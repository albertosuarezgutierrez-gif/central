// El Submit REAL a Codeoscopic (`POST /insurances/{id}/policy-applications`)
// y su candado de idempotencia. Separado de `emitir.ts` (puro) porque este
// fichero SÍ toca BD (`prisma`), y `emitir.ts` tiene que poder importarse
// bajo `node --test` sin arrastrar `tenant.ts` (ver su cabecera).
//
// 🚨 SIN SANDBOX Y SIN FIXTURE DEL FABRICANTE para esta llamada. El propio
// portal avisa de que puede aceptar el producto principal y fallar en los
// addons («the main product will be submitted first and, if accepted, the
// addons next») sin decir cómo reanudarlo — por eso `crudo` (la respuesta
// ENTERA del vendor) viaja siempre en el resultado, salga bien o mal.
//
// Idempotencia: UN SOLO INTENTO. El candado usa
// `seguros.codeoscopic_projects.submit_attempt_id`/`submit_in_flight_at`
// (columnas que ya existían desde la spec de emisión del 02/09 sin usarse) y
// exige el índice único `codeoscopic_projects_correduria_proyecto_idx`
// (`2026-09-11_codeoscopic_projects_unique_proyecto.sql`): sin él, un
// `ON CONFLICT` no tiene sobre qué actuar y dos peticiones concurrentes
// podrían crear dos filas para el mismo proyecto — dos candados que no se ven
// entre sí no son un candado.

import { randomUUID } from 'node:crypto'
import type { ConfigCodeoscopic } from './config.ts'
import { obtenerToken } from './cliente.ts'
import { prisma } from '../tenant.ts'

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

// ─── El candado: un solo Submit en vuelo por proyecto ───────────────────────

const MARGEN_EN_VUELO_MIN = 10

/**
 * Toma el candado ANTES de llamar al vendor. `false` = ya había un intento en
 * vuelo (o reciente) para este proyecto: no se llama, para no arriesgar un
 * segundo Submit sobre el mismo contrato mientras no se aclare el primero.
 *
 * Upsert sobre `codeoscopic_projects`: si el proyecto no tenía fila todavía
 * (lo normal es que SÍ la tenga: la crea `oferta/route.ts` en el ReRate, antes
 * de llegar aquí), la crea — puente de emergencia con `'auto'` como producto
 * placeholder (hoy el envío real solo está construido para auto).
 */
async function bloquearEnvio(
  correduriaId: string,
  projectId: string,
  attemptId: string,
): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    insert into codeoscopic_projects (
      correduria_id, project_id_codeoscopic, producto, estado, submit_attempt_id, submit_in_flight_at
    ) values (
      ${correduriaId}::uuid, ${projectId}, 'auto'::tipo_seguro, 'preemision', ${attemptId}::uuid, now()
    )
    on conflict (correduria_id, project_id_codeoscopic) do update
      set submit_attempt_id = excluded.submit_attempt_id, submit_in_flight_at = now()
      where codeoscopic_projects.submit_in_flight_at is null
         or codeoscopic_projects.submit_in_flight_at < now() - (${MARGEN_EN_VUELO_MIN}::int * interval '1 minute')
    returning id::text as id
  `
  return filas.length > 0
}

/** Libera el candado. `estado` queda como rastro de qué pasó con el intento;
 *  `submit_in_flight_at` se limpia siempre, se haya enviado o no, porque un
 *  candado que no se suelta deja el proyecto bloqueado para siempre. */
async function cerrarEnvio(
  correduriaId: string,
  projectId: string,
  attemptId: string,
  // `codeoscopic_project_estado` no tiene un valor «enviada»: el éxito del
  // Submit se refleja aparte, cuando `registrarPolizaEmitida` (module-seguros)
  // pone `estado='emitida'` al acuñar la póliza en la MISMA transacción que
  // enlaza esta fila. Aquí solo se libera el candado; `'preemision'` mantiene
  // el estado de «ya tiene oferta confirmada, aún sin póliza acuñada».
  estado: 'preemision' | 'error',
): Promise<void> {
  await prisma.$executeRaw`
    update codeoscopic_projects
    set estado = ${estado}::codeoscopic_project_estado, submit_in_flight_at = null
    where correduria_id = ${correduriaId}::uuid
      and project_id_codeoscopic = ${projectId}
      and submit_attempt_id = ${attemptId}::uuid
  `
}

// ─── Submit: la emisión de verdad ────────────────────────────────────────────

export type ResultadoEnvio =
  | { ok: true; referenciaVendor: string | null; crudo: unknown }
  | { ok: false; razon: 'en-vuelo' | 'vendor'; mensaje: string; crudo?: unknown }

/**
 * `POST /insurances/{projectId}/policy-applications`, multipart. Un solo
 * intento, con CANDADO antes de llamar (ver `bloquearEnvio`).
 *
 * El transporte NO reutiliza `peticion()` de `cliente.ts` (JSON puro): esta
 * llamada es multipart, así que arma su propio `FormData` con las mismas
 * cabeceras de autenticación (`obtenerToken`).
 */
export async function enviarEmision(
  config: ConfigCodeoscopic,
  entrada: {
    correduriaId: string
    projectId: string
    offerId: string
    campos: Record<string, unknown>
  },
): Promise<ResultadoEnvio> {
  const attemptId = randomUUID()
  const tomado = await bloquearEnvio(entrada.correduriaId, entrada.projectId, attemptId)
  if (!tomado) {
    return {
      ok: false,
      razon: 'en-vuelo',
      mensaje:
        `Ya hay un envío de este proyecto (${entrada.projectId}) en curso o de hace menos de ` +
        `${MARGEN_EN_VUELO_MIN} min. No se manda un segundo Submit mientras no se aclare el primero.`,
    }
  }

  try {
    // 🚨 Décimo fallo real (12/09/2026, proyecto 40684860): «The `policyApplications`
    // body part is required.» — el vendor NO acepta campos multipart sueltos: exige
    // UNA sola parte llamada `policyApplications` con un JSON ARRAY dentro
    // (`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`, la única referencia con la forma real
    // de esta llamada). `entrada.offerId` es aquí el `mainQuote.id` del ReRate
    // (p.ej. "Q2018406592"), que es lo que el vendor llama `quote.id`.
    const policyApplication: Record<string, unknown> = { quote: { id: entrada.offerId } }
    for (const [k, v] of Object.entries(entrada.campos)) {
      if (v === null || v === undefined) continue
      policyApplication[k] = v
    }
    const form = new FormData()
    form.append('policyApplications', JSON.stringify([policyApplication]))

    const token = await obtenerToken(config)
    const res = await fetch(
      `${config.baseUrl}/insurances/${encodeURIComponent(entrada.projectId)}/policy-applications`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'x-client-app': config.clientApp,
          'x-user-email': config.userEmail,
          accept: 'application/vnd.codeoscopic.v1+json',
        },
        body: form,
      },
    )
    const texto = await res.text()
    let crudo: unknown = null
    try {
      crudo = texto ? JSON.parse(texto) : null
    } catch {
      crudo = texto
    }

    if (!res.ok) {
      await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'error')
      return { ok: false, razon: 'vendor', mensaje: `${res.status}: ${texto.slice(0, 1000)}`, crudo }
    }

    const referenciaVendor = str((crudo as Record<string, unknown> | null)?.referenceFromVendor)
    await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'preemision')
    return { ok: true, referenciaVendor, crudo }
  } catch (e) {
    // No sabemos si el vendor llegó a procesar la petición antes de que se
    // cortara la conexión: el candado se libera igual (para no dejar el
    // proyecto bloqueado para siempre), pero el `estado: 'error'` deja
    // constancia de que este intento NO terminó con una respuesta clara.
    await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'error').catch(() => {})
    return {
      ok: false,
      razon: 'vendor',
      mensaje:
        `${e instanceof Error ? e.message : String(e)} — no hay confirmación de qué hizo el ` +
        'vendor con esta petición: antes de reintentar, consultar `GET /insurances/{id}` para ver si ya emitió.',
    }
  }
}
