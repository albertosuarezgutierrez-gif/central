import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { prisma } from '@/lib/tenant'
import { prismaAsegura } from '@/lib/asegura-db'
import { guardarDocumento } from '@/lib/cartera-documentos'
import { resolverConfigEmision, leerProyectoCrudo, redactarCrudoVendor } from '@/lib/codeoscopic/emitir'
import { peticion, descargarFicheroVendor } from '@/lib/codeoscopic/cliente'
import { solicitudesEmision } from '@/lib/codeoscopic/reintento-emision'
import { documentosEmitidos, documentoPoliza, documentoCaducado } from '@/lib/codeoscopic/documentos-emitidos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
 * La descarga NUNCA rompe la respuesta: si falla, el `issuedDocuments` crudo
 * sigue viajando igual para que la pantalla enseñe el enlace de todos modos.
 */
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
    policyApplication = await peticion(r.config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}/policy-applications/${encodeURIComponent(solicitud.id)}`,
      timeoutMs: r.config.timeoutGenericoMs,
    })
  } catch (e) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: true,
      solicitud,
      mensaje: `no se pudo hacer el Retrieve individual: ${e instanceof Error ? e.message : String(e)}`,
    })
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
  let documentoGuardado: { id: string; repetido: boolean } | null = null
  let avisoDocumento: string | null = null
  const docs = documentosEmitidos(policyApplication)
  const poliza = documentoPoliza(docs)
  if (poliza && correduria) {
    if (documentoCaducado(poliza)) {
      avisoDocumento = `El documento "${poliza.nombre}" caducó el ${poliza.caducaEn} — Codeoscopic ya no lo sirve.`
    } else {
      try {
        const fila = await prisma.$queryRaw<{ poliza_id: string | null }[]>`
          select poliza_id from codeoscopic_projects
          where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
        `
        const polizaId = fila[0]?.poliza_id ?? null
        if (!polizaId) {
          avisoDocumento = 'El proyecto todavía no tiene `poliza_id` (no se ha acuñado): no se archiva sin saber de qué póliza es.'
        } else {
          const yaGuardado = await prismaAsegura().documento.findFirst({
            where: { correduriaId: correduria.id, polizaId, tipo: 'poliza', subidoPor: 'agente' },
            select: { id: true },
          })
          if (yaGuardado) {
            documentoGuardado = { id: yaGuardado.id, repetido: true }
          } else {
            const { bytes } = await descargarFicheroVendor(r.config, poliza.url)
            const guardado = await guardarDocumento(correduria.id, {
              polizaId,
              tipo: 'poliza',
              nombre: `${poliza.nombre}.pdf`,
              mime: 'application/pdf',
              contenido: bytes,
              subidoPor: 'agente',
              notas: `Descargado de Codeoscopic (issuedDocuments) el ${new Date().toISOString()}.`,
            })
            documentoGuardado = guardado.ok ? { id: guardado.documento.id, repetido: guardado.repetido } : null
            if (!guardado.ok) avisoDocumento = `No se pudo archivar el PDF: ${guardado.motivo}`
          }
        }
      } catch (e) {
        avisoDocumento = `No se pudo descargar el PDF del vendor: ${e instanceof Error ? e.message : String(e)}`
      }
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
