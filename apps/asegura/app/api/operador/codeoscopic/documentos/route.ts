import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { prisma } from '@/lib/tenant'
import { resolverConfigEmision, leerProyectoCrudo, redactarCrudoVendor } from '@/lib/codeoscopic/emitir'
import { peticion } from '@/lib/codeoscopic/cliente'
import { solicitudesEmision } from '@/lib/codeoscopic/reintento-emision'
import { archivarDocumentoEmitido } from '@/lib/codeoscopic/archivar-documento'
import { documentosEmitidos, documentoPoliza, meritaReintentoDocumento } from '@/lib/codeoscopic/documentos-emitidos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 120, no 60: esta ruta hoy encadena HASTA CUATRO llamadas al vendor (el
// proyecto, el Retrieve, su reintento y la descarga del PDF), cada una con
// su propio timeout configurable hasta 60 s (`CODEOSCOPIC_REQUEST_TIMEOUT_MS`,
// `lib/codeoscopic/config.ts`) — con 60 s de presupuesto, el peor caso mataría
// la función ANTES de responder, rompiendo la promesa de «la descarga NUNCA
// rompe la respuesta» por un motivo distinto (el propio plazo, no un fallo).
export const maxDuration = 120

/**
 * `GET ?projectId=` — lo que Codeoscopic devuelve de la SOLICITUD DE EMISIÓN
 * de un proyecto, en crudo, incluido `issuedDocuments[]` si lo manda. Y, desde
 * el 23/09/2026, DESCARGA el PDF de la póliza (best-effort) y lo archiva en
 * `seguros.documentos` — es el hueco anotado el 13/09/2026 tras el primer 500
 * real («al acuñar, bajar `issuedDocuments[]` a `seguros.documentos` — falta la
 * forma del tag `File` del portal»), cerrado con el OpenAPI vivo de INT (ver
 * `docs/CODEOSCOPIC-API-PORTAL.md` § 12: `InsuranceFile_V1` = `{name, url,
 * creationDateTime, expirationDateTime}`, se descarga con `GET {url}` + el
 * MISMO Bearer, gratis).
 *
 * 🚨 Reintento ÚNICO (23/09/2026): si la compañía ya aprobó y esta lectura no
 * trae `issuedDocuments[]` (el vendor no ha terminado de generarlo — el
 * portal no dice cuánto tarda), se repite el Retrieve UNA vez tras una pausa
 * corta. Gratis (sigue siendo un `GET`) y acotado: mismo patrón que
 * `oferta/route.ts` con `effectiveDate` — nunca un bucle sin salida, ni un
 * reintento sobre una solicitud pendiente/rechazada (ahí esperar no cambia
 * nada). Sigue siendo esto, y no el flujo de acuñado, el sitio donde se
 * reintenta: en `emitir/route.ts` se decidió NO reintentar porque una
 * emisión no puede quedarse esperando al vendor con el corredor delante.
 *
 * La descarga NUNCA rompe la respuesta: si falla, el `issuedDocuments` crudo
 * sigue viajando igual para que la pantalla enseñe el enlace de todos modos.
 */
/** El Retrieve individual (`GET .../policy-applications/{id}`), en UN solo
 *  sitio: la primera lectura y el reintento tienen que pedir EXACTAMENTE lo
 *  mismo, o divergirían en silencio si algún día cambia (cabecera, timeout…). */
async function retrievePolicyApplication(config: Parameters<typeof peticion>[0], projectId: string, solicitudId: string): Promise<unknown> {
  return peticion(config, {
    metodo: 'GET',
    path: `/insurances/${encodeURIComponent(projectId)}/policy-applications/${encodeURIComponent(solicitudId)}`,
    timeoutMs: config.timeoutGenericoMs,
  })
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ estado: 'error', mensaje: 'no autorizado' }, { status: 401 })
  }

  const projectId = new URL(req.url).searchParams.get('projectId')?.trim()
  if (!projectId) {
    return NextResponse.json({ estado: 'error', mensaje: 'falta projectId' }, { status: 400 })
  }

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'error', mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}` },
      { status: 503 },
    )
  }

  let proyectoCrudo: unknown
  try {
    proyectoCrudo = await leerProyectoCrudo(r.config, projectId)
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', mensaje: `no se pudo leer el proyecto: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const solicitudes = solicitudesEmision(proyectoCrudo)
  if (solicitudes.length === 0) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: false,
      mensaje: 'el proyecto no cuenta ninguna solicitud de emisión (`policyApplications[]` vacío)',
      proyectoCrudo: redactarCrudoVendor(proyectoCrudo),
    })
  }
  // La solicitud viva: aprobada si hay alguna, si no la primera con id.
  const solicitud = solicitudes.find((s) => s.veredicto === 'aprobada' && s.id) ?? solicitudes.find((s) => s.id) ?? solicitudes[0]
  if (!solicitud.id) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: true,
      solicitud,
      mensaje: 'la solicitud no trae `id`: no se puede pedir el Retrieve individual',
    })
  }

  let policyApplication: unknown
  try {
    policyApplication = await retrievePolicyApplication(r.config, projectId, solicitud.id)
  } catch (e) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: true,
      solicitud,
      mensaje: `no se pudo hacer el Retrieve individual: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // ── Reintento ÚNICO si aprobada pero sin documentos todavía ─────────────
  // Gratis (GET) y acotado a uno solo — si el vendor sigue sin traer nada
  // tras la pausa, se sigue con lo que ya se tiene: nunca un bucle sin
  // salida, y nunca sobre una solicitud pendiente/rechazada (ahí no hay nada
  // que esperar). Un fallo en el reintento no tumba la respuesta: se queda
  // con la primera lectura, que ya es válida.
  if (meritaReintentoDocumento(solicitud.veredicto, documentosEmitidos(policyApplication))) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    try {
      const relectura = await retrievePolicyApplication(r.config, projectId, solicitud.id)
      if (documentosEmitidos(relectura).length > 0) policyApplication = relectura
    } catch {
      // Sin reintento aplicado: se sigue con la primera lectura.
    }
  }

  // Best-effort: guarda la respuesta cruda para no perderla otra vez. SIEMPRE
  // redactada — `policyApplication` trae IBAN/DNI/email/teléfono del tomador
  // y `quote_data` es jsonb sin cifrar (a diferencia de `clientes.iban/dni`).
  const policyApplicationRedactado = redactarCrudoVendor(policyApplication)
  const correduria = await correduriaUnica().catch(() => null)
  if (correduria) {
    await prisma.$executeRaw`
      update codeoscopic_projects set quote_data = ${JSON.stringify(policyApplicationRedactado)}::jsonb
      where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
    `.catch(() => {})
  }

  const issuedDocuments = (policyApplicationRedactado as Record<string, unknown> | null)?.issuedDocuments ?? null

  // ── Descarga y archivo del PDF, best-effort ──────────────────────────────
  // La URL sale del crudo SIN redactar (no lleva PII: es del propio vendor),
  // pero nunca se devuelve al cliente HTTP — solo se usa para el GET interno.
  // Solo se mira `poliza_id` si de verdad HAY un documento que archivar: un
  // proyecto sin `issuedDocuments[]` (pendiente, sin aprobar) no tiene nada
  // que archivar y no debe decir «falta poliza_id» sobre un documento que no
  // existe. Y TODO el bloque va en un único try/catch (`archivarDocumentoEmitido`
  // ya protege su propia descarga, pero la lectura de `poliza_id` de aquí NO
  // estaba cubierta antes de este comentario — un fallo del pooler tumbaba el
  // endpoint entero en vez de degradar a un aviso, rompiendo la promesa de
  // arriba de que «la descarga NUNCA rompe la respuesta»).
  let documentoGuardado: { id: string; repetido: boolean } | null = null
  let avisoDocumento: string | null = null
  const poliza = documentoPoliza(documentosEmitidos(policyApplication))
  if (poliza && correduria) {
    try {
      const fila = await prisma.$queryRaw<{ poliza_id: string | null }[]>`
        select poliza_id from codeoscopic_projects
        where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
      `
      const polizaId = fila[0]?.poliza_id ?? null
      if (!polizaId) {
        avisoDocumento = 'El proyecto todavía no tiene `poliza_id` (no se ha acuñado): no se archiva sin saber de qué póliza es.'
      } else {
        const archivado = await archivarDocumentoEmitido(r.config, { correduriaId: correduria.id, polizaId, crudo: policyApplication })
        documentoGuardado = archivado.documentoGuardado
        avisoDocumento = archivado.avisoDocumento
      }
    } catch (e) {
      avisoDocumento = `No se pudo descargar el PDF del vendor: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  return NextResponse.json({
    estado: 'ok',
    encontrada: true,
    solicitud,
    issuedDocuments,
    documentoGuardado,
    avisoDocumento,
    policyApplication: policyApplicationRedactado,
  })
}
