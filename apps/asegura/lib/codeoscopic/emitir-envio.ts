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
import { redactarCrudoVendor } from './emitir.ts'
import { FRASE_SIN_CONFIRMACION, solicitudesEmision } from './reintento-emision.ts'
import { conLibroDeEmision } from './libro-emision.ts'
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
 * de llegar aquí), la crea — puente de emergencia con `producto` (el
 * `polizas.tipo` real que pasa el caller, `emitir/route.ts`) en vez del
 * literal `'auto'` de antes (12/09/2026): esta rama solo se pisa si el ReRate
 * nunca llegó a crear la fila, y da igual el ramo — hardcodear el más
 * frecuente la habría dejado mintiendo sobre hogar/RC igual que el INSERT
 * gemelo de `oferta/route.ts`.
 */
async function bloquearEnvio(
  correduriaId: string,
  projectId: string,
  attemptId: string,
  producto: string,
  permitirQuizaEmitido: boolean,
): Promise<'tomado' | 'en-vuelo' | 'quiza-emitido' | 'ya-emitida'> {
  // La condición «quizá emitido» va DENTRO del upsert, no solo en la lectura
  // previa de `emitir/route.ts` (13/09/2026): dos peticiones casi simultáneas
  // leen ambas un proyecto sano, la primera muere en 5xx y suelta el candado,
  // y la segunda —que ya había pasado la lectura— lo tomaría y mandaría el
  // segundo Submit a ciegas. Aquí la fila se decide en la misma sentencia.
  // La regex es la misma que `intentoQuizaEmitido()` (`reintento-emision.ts`).
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    insert into codeoscopic_projects (
      correduria_id, project_id_codeoscopic, producto, estado, submit_attempt_id, submit_in_flight_at
    ) values (
      ${correduriaId}::uuid, ${projectId}, ${producto}::tipo_seguro, 'preemision', ${attemptId}::uuid, now()
    )
    on conflict (correduria_id, project_id_codeoscopic) do update
      set submit_attempt_id = excluded.submit_attempt_id, submit_in_flight_at = now()
      where (codeoscopic_projects.submit_in_flight_at is null
             or codeoscopic_projects.submit_in_flight_at < now() - (${MARGEN_EN_VUELO_MIN}::int * interval '1 minute'))
        and codeoscopic_projects.estado <> 'emitida'
        and (${permitirQuizaEmitido}::boolean
             or codeoscopic_projects.error_mensaje is null
             or not (codeoscopic_projects.error_mensaje ~ '^5[0-9]{2}([^0-9]|$)'
                     or codeoscopic_projects.error_mensaje ilike ${'%' + FRASE_SIN_CONFIRMACION + '%'}))
    returning id::text as id
  `
  if (filas.length > 0) return 'tomado'
  const fila = await prisma.$queryRaw<{ estado: string | null; en_vuelo: boolean }[]>`
    select estado::text as estado,
           (submit_in_flight_at is not null
            and submit_in_flight_at >= now() - (${MARGEN_EN_VUELO_MIN}::int * interval '1 minute')) as en_vuelo
    from codeoscopic_projects
    where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}
  `
  if (fila[0]?.estado === 'emitida') return 'ya-emitida'
  return fila[0]?.en_vuelo ? 'en-vuelo' : 'quiza-emitido'
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
  /**
   * El texto del vendor (ya enmascarado por el caller) cuando `estado` es
   * `error`. Hasta el 12/09/2026 `error_mensaje` quedaba a NULL en cada
   * Submit rechazado: el 400 solo vivía en la respuesta HTTP y en el chat, y
   * al día siguiente no había forma de saber POR QUÉ falló un proyecto. Un
   * Submit que SÍ cuaja (`preemision`) la deja a NULL: nadie más escribe esta
   * columna, así que un error viejo se quedaría pegado a un proyecto ya
   * emitido si no se limpiara aquí.
   */
  mensaje: string | null = null,
): Promise<void> {
  const errorMensaje = estado === 'error' && mensaje ? mensaje.slice(0, 2000) : null
  await prisma.$executeRaw`
    update codeoscopic_projects
    set estado = ${estado}::codeoscopic_project_estado,
        submit_in_flight_at = null,
        error_mensaje = ${errorMensaje}::text
    where correduria_id = ${correduriaId}::uuid
      and project_id_codeoscopic = ${projectId}
      and submit_attempt_id = ${attemptId}::uuid
  `
}

// ─── Submit: la emisión de verdad ────────────────────────────────────────────

export type ResultadoEnvio =
  | { ok: true; referenciaVendor: string | null; crudo: unknown }
  | {
      ok: false
      /**
       * `sin-libro` y `tope` (21/09/2026) son los del LIBRO DE CONSUMO, y son
       * distintos de los del candado: significan que no se ha llegado a llamar
       * a la compañía porque no se podía contar el gasto o porque se ha
       * alcanzado el tope de Submits. No se colapsan con `vendor` — ese es «el
       * vendor contestó que no», y este es «no le hemos preguntado».
       */
      razon: 'en-vuelo' | 'quiza-emitido' | 'ya-emitida' | 'vendor' | 'sin-libro' | 'tope'
      mensaje: string
      crudo?: unknown
    }

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
    /** `polizas.tipo` de la póliza enlazada — solo se usa si hay que crear la
     *  fila de emergencia (ver `bloquearEnvio`); la fila normal ya la trae
     *  del ReRate. */
    producto: string
    /** El corredor ha mirado el proyecto tras un intento «quizá emitido» y no
     *  hay póliza: solo así se pasa por encima de ese candado. */
    reintentoConfirmado: boolean
    /** Quién lo pide. Va al libro de consumo, para poder explicar la factura
     *  línea a línea (igual que `solicitadoPor` en `cotizar()`). */
    solicitadoPor?: string
  },
): Promise<ResultadoEnvio> {
  const attemptId = randomUUID()
  const candado = await bloquearEnvio(
    entrada.correduriaId,
    entrada.projectId,
    attemptId,
    entrada.producto,
    entrada.reintentoConfirmado,
  )
  if (candado === 'en-vuelo') {
    return {
      ok: false,
      razon: 'en-vuelo',
      mensaje:
        `Ya hay un envío de este proyecto (${entrada.projectId}) en curso o de hace menos de ` +
        `${MARGEN_EN_VUELO_MIN} min. No se manda un segundo Submit mientras no se aclare el primero.`,
    }
  }
  if (candado === 'ya-emitida') {
    return { ok: false, razon: 'ya-emitida', mensaje: `El proyecto ${entrada.projectId} ya consta como emitido: no se envía otro Submit.` }
  }
  if (candado === 'quiza-emitido') {
    return {
      ok: false,
      razon: 'quiza-emitido',
      mensaje:
        `El último envío del proyecto ${entrada.projectId} acabó sin respuesta clara del vendor y nadie ha ` +
        'confirmado el reintento: no se reenvía a ciegas.',
    }
  }

  // El token y el cuerpo se preparan FUERA del try de la llamada: si fallan,
  // el POST no ha salido y NO puede quedar registrado como «quizá emitido»
  // (eso bloquearía el siguiente intento legítimo con una falsa alarma).
  let token: string
  let form: FormData
  try {
    const policyApplication: Record<string, unknown> = { quote: { id: entrada.offerId } }
    for (const [k, v] of Object.entries(entrada.campos)) {
      if (v === null || v === undefined) continue
      policyApplication[k] = v
    }
    form = new FormData()
    form.append('policyApplications', JSON.stringify([policyApplication]))
    token = await obtenerToken(config)
  } catch (e) {
    const mensaje = `antes de enviar: ${e instanceof Error ? e.message : String(e)} (el Submit NO ha salido)`
    await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'error', String(redactarCrudoVendor(mensaje))).catch(() => {})
    return { ok: false, razon: 'vendor', mensaje }
  }

  try {
    // 🚨 Décimo fallo real (12/09/2026, proyecto 40684860): «The `policyApplications`
    // body part is required.» — el vendor NO acepta campos multipart sueltos: exige
    // UNA sola parte llamada `policyApplications` con un JSON ARRAY dentro
    // (`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`, la única referencia con la forma real
    // de esta llamada). `entrada.offerId` es aquí el `mainQuote.id` del ReRate
    // (p.ej. "Q2018406592"), que es lo que el vendor llama `quote.id`.
    //
    // 🚨 21/09/2026: el Submit abre su PROPIA línea en
    // `seguros.codeoscopic_consumo` (`motivo: 'submit'`). Hasta hoy no escribía
    // ninguna, así que el libro contaba de menos y el tope protegía menos de lo
    // que decía. El coste sale de `CODEOSCOPIC_COSTE_SUBMIT_CENTS` y arranca en
    // 0 —no está confirmado que esta llamada facture— pero la LÍNEA se abre
    // igual: lo conservador es contarla. El embudo reserva ANTES del `fetch`,
    // así que un corte de red deja la línea en `reservado`, que cuenta.
    const gasto = await conLibroDeEmision(
      {
        correduriaId: entrada.correduriaId,
        operacion: 'submit',
        solicitadoPor: entrada.solicitadoPor ?? 'plataforma',
        projectId: entrada.projectId,
      },
      async () => {
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
        return { estadoHttp: res.status, correcto: res.ok, texto: await res.text() }
      },
      {
        // Un 4xx es el vendor RECHAZANDO el cuerpo: la solicitud no llegó a la
        // compañía, así que libera cupo — misma doctrina que `cotizar()` con
        // `pruebaQueNoHuboCargo`. Un 5xx NO: ahí Codeoscopic dejó de esperar a
        // la compañía y no se sabe si emitió (13/09/2026, proyecto 40685793).
        evidenciaSinCargo: (r) =>
          !r.correcto && r.estadoHttp >= 400 && r.estadoHttp < 500
            ? {
                evidencia: `validacion: el vendor rechazó el Submit con ${r.estadoHttp}, la compañía no llegó a recibirlo`,
                codigo: 'validacion',
              }
            : null,
        // 🚨 Y un 5xx tampoco es un ÉXITO: sin este `exitoso`, `conLibroDeEmision`
        // cerraría la línea como `facturable` por defecto (es lo que hace para
        // el ReRate, donde resolver SÍ es éxito porque `reRate()` lanza en
        // cualquier fallo). Aquí el `fetch` no lanza con un 5xx — devuelve el
        // estado HTTP como valor — así que sin este predicado un 500 del
        // Submit se habría contado como gasto confirmado en vez de quedarse
        // `reservado` (la misma duda que un timeout).
        exitoso: (r) => r.correcto,
      },
    )
    if (!gasto.ok) {
      // El candado ya estaba tomado: se suelta, porque no se ha enviado nada y
      // dejarlo puesto bloquearía 10 minutos un envío que nunca salió.
      const mensaje = `${gasto.mensaje} NO se ha enviado nada a la compañía.`
      await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'error', mensaje).catch(() => {})
      return { ok: false, razon: gasto.razon, mensaje }
    }

    const { estadoHttp, correcto, texto } = gasto.valor
    let crudo: unknown = null
    try {
      crudo = texto ? JSON.parse(texto) : null
    } catch {
      crudo = texto
    }

    if (!correcto) {
      const mensaje = `${estadoHttp}: ${texto.slice(0, 1000)}`
      await cerrarEnvio(
        entrada.correduriaId,
        entrada.projectId,
        attemptId,
        'error',
        String(redactarCrudoVendor(mensaje)),
      )
      return { ok: false, razon: 'vendor', mensaje, crudo }
    }

    // `referenceFromVendor` es la forma del traspaso de Manuel; el portal (13/09/2026)
    // documenta la respuesta como PolicyApplication_V1[] con `policyNumber` («the
    // policy number assigned by the issuer»). Se leen las dos: sin fixture real no
    // se sabe cuál llega.
    const referenciaVendor =
      str((crudo as Record<string, unknown> | null)?.referenceFromVendor) ??
      solicitudesEmision(crudo).find((s) => s.numeroPoliza)?.numeroPoliza ??
      null
    await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'preemision')
    return { ok: true, referenciaVendor, crudo }
  } catch (e) {
    // No sabemos si el vendor llegó a procesar la petición antes de que se
    // cortara la conexión: el candado se libera igual (para no dejar el
    // proyecto bloqueado para siempre), pero el `estado: 'error'` deja
    // constancia de que este intento NO terminó con una respuesta clara.
    const mensaje =
      `${e instanceof Error ? e.message : String(e)} — ${FRASE_SIN_CONFIRMACION} con esta petición: ` +
      'antes de reintentar, consultar `GET /insurances/{id}` para ver si ya emitió.'
    await cerrarEnvio(entrada.correduriaId, entrada.projectId, attemptId, 'error', String(redactarCrudoVendor(mensaje))).catch(
      () => {},
    )
    return { ok: false, razon: 'vendor', mensaje }
  }
}
