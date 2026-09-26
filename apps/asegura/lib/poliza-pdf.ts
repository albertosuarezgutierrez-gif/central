// El PDF original de una póliza emitida (26/09/2026): leerlo de `seguros.documentos` o, si aún no está,
// traerlo de Codeoscopic; y el cron que lo manda al cliente cuando la compañía lo entrega DESPUÉS de
// emitir. Solo se escribe al cliente si antes salió el correo de la emisión (que es el OK de Alberto).
import { prismaAsegura } from './asegura-db'
import { resolverConfigEmision } from './codeoscopic/emitir.ts'
import { traerPdfEmitido } from './codeoscopic/traer-pdf-emitido.ts'
import { cuerpoCorreoPoliza } from './correo-emision.ts'
import { enlacePortal } from './correo-invitacion-portal.ts'
import { estadoPortalDeFicha, nombreDe } from './invitacion-portal'

export type PdfPoliza = { nombre: string; contenido: Buffer }

/** El PDF de la compañía ya archivado para esa póliza, o `null` si no está (aún). */
export async function pdfArchivado(correduriaId: string, polizaId: string): Promise<PdfPoliza | null> {
  const d = await prismaAsegura().documento.findFirst({
    where: { correduriaId, polizaId, tipo: 'poliza', subidoPor: 'agente', contenido: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { nombreFichero: true, contenido: true },
  })
  return d?.contenido ? { nombre: d.nombreFichero ?? 'poliza.pdf', contenido: Buffer.from(d.contenido) } : null
}

/** Lo archivado; si no hay, lo intenta traer de Codeoscopic UNA vez (gratis). `null` = la compañía aún no lo da. */
export async function pdfDePoliza(correduriaId: string, polizaId: string): Promise<PdfPoliza | null> {
  const ya = await pdfArchivado(correduriaId, polizaId)
  if (ya) return ya
  const [p] = await prismaAsegura().$queryRaw<{ projectId: string }[]>`
    select project_id_codeoscopic::text as "projectId" from codeoscopic_projects
    where correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid and estado = 'emitida' limit 1`
  if (!p) return null
  const t = await traerPdfEmitido(correduriaId, p.projectId, polizaId)
  if (t.estado !== 'archivado') {
    if (t.estado === 'error') console.error(`[poliza-pdf] ${polizaId}: ${t.motivo}`)
    return null
  }
  return pdfArchivado(correduriaId, polizaId)
}

export const TIPO_CORREO_POLIZA = 'poliza_pdf'
export const TIPO_CORREO_EMISION_CON_POLIZA = 'emision_con_poliza'

export type ResumenPolizasPdf = {
  revisadas: number; archivadas: number; enviadas: number; pendientes: number; fallos: number
  /** Se quedan fuera de la ventana de 14 días SIN PDF en esta pasada: el cliente tenía prometido el envío. */
  caducadas: string[]
  /** Se cortó por tiempo: las que faltan se revisan en la siguiente pasada. */
  cortado: boolean
}

const VENTANA_DIAS = 14
const PRESUPUESTO_MS = 90_000

/**
 * Pólizas emitidas por Codeoscopic en los últimos 14 días cuyo cliente YA recibió el correo de la
 * emisión DE ESA PÓLIZA sin la póliza: se intenta traer el PDF y, si llega, se le manda. Todo va POR
 * PÓLIZA (`correo_envio.poliza_id`), no por cliente: con dos emisiones del mismo cliente, el correo de
 * una no puede ni tapar ni autorizar el de la otra.
 */
export async function enviarPolizasPendientes(correduriaId: string, ahora = Date.now()): Promise<ResumenPolizasPdf | { apagado: string }> {
  // Sin Codeoscopic no hay nada que traer: se dice una vez, no un error por póliza cada hora.
  const cfg = resolverConfigEmision()
  if (cfg.estado !== 'lista') return { apagado: cfg.estado === 'apagado' ? cfg.motivo : `faltan variables: ${cfg.faltan.join(', ')}` }
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ polizaId: string; clienteId: string; ultima: boolean }[]>`
    select p.id::text as "polizaId", p.cliente_id::text as "clienteId",
           (p.created_at <= now() - make_interval(days => ${VENTANA_DIAS}) + interval '1 hour') as "ultima"
    from polizas p
    where p.correduria_id = ${correduriaId}::uuid and p.origen = 'emitida_codeoscopic' and p.merged_into_poliza_id is null
      and p.created_at > now() - make_interval(days => ${VENTANA_DIAS})
      and exists (select 1 from correo_envio e where e.poliza_id = p.id and e.tipo = 'emision' and e.estado = 'enviado')
      and not exists (select 1 from correo_envio e where e.poliza_id = p.id
                      and e.tipo in (${TIPO_CORREO_POLIZA}, ${TIPO_CORREO_EMISION_CON_POLIZA}) and e.estado = 'enviado')
    order by p.created_at
    limit 20`
  const r: ResumenPolizasPdf = { revisadas: filas.length, archivadas: 0, enviadas: 0, pendientes: 0, fallos: 0, caducadas: [], cortado: false }
  const enlace = enlacePortal()
  if (!enlace) throw new Error('sin_portal')
  const { enviarCorreoSeguido } = await import('./correo-envio')
  for (const f of filas) {
    if (Date.now() - ahora > PRESUPUESTO_MS) { r.cortado = true; break }
    const yaHabia = await pdfArchivado(correduriaId, f.polizaId)
    const pdf = yaHabia ?? (await pdfDePoliza(correduriaId, f.polizaId))
    if (!pdf) {
      r.pendientes++
      if (f.ultima) r.caducadas.push(f.polizaId)
      continue
    }
    if (!yaHabia) r.archivadas++
    const ficha = await estadoPortalDeFicha(correduriaId, f.clienteId)
    if (!ficha?.emailInvitacion) { r.fallos++; continue }
    const cuerpo = cuerpoCorreoPoliza({ nombre: await nombreDe(correduriaId, f.clienteId), enlace })
    const envio = await enviarCorreoSeguido({
      correduriaId, clienteId: f.clienteId, polizaId: f.polizaId, tipo: TIPO_CORREO_POLIZA, to: ficha.emailInvitacion, ...cuerpo,
      adjuntos: [{ nombre: pdf.nombre, contenido: pdf.contenido, tipo: 'application/pdf' }],
    })
    if (envio.resultado === 'enviado') r.enviadas++
    else r.fallos++
  }
  // Una promesa por escrito al cliente que se queda sin cumplir no puede morir en un JSON de cron.
  if (r.caducadas.length) console.error(`[poliza-pdf] ${r.caducadas.length} póliza(s) llegan a ${VENTANA_DIAS} días sin PDF de la compañía: ${r.caducadas.join(', ')}`)
  if (r.fallos) console.error(`[poliza-pdf] ${r.fallos} envío(s) de póliza fallaron`)
  return r
}
