// Trae de Codeoscopic el PDF de una póliza YA emitida y lo archiva en `seguros.documentos` (26/09/2026).
// Mismo camino que el endpoint de diagnóstico (`/api/operador/codeoscopic/documentos`): proyecto →
// solicitud aprobada → Retrieve individual → `archivarDocumentoEmitido`. Todo son `GET`: gratis.
// Lo usan el correo tras emitir (para adjuntarlo) y el cron que lo reintenta mientras la compañía no
// lo ha generado. Nunca lanza: devuelve qué pasó.
import { archivarDocumentoEmitido } from './archivar-documento.ts'
import { peticion } from './cliente.ts'
import { leerProyectoCrudo, resolverConfigEmision } from './emitir.ts'
import { solicitudesEmision } from './reintento-emision.ts'

export type PdfTraido =
  | { estado: 'archivado'; documentoId: string }
  /** La compañía aún no lo ha generado (o la solicitud no está aprobada): se reintenta más tarde. */
  | { estado: 'aun_no'; motivo: string }
  | { estado: 'error'; motivo: string }
  /** El proyecto emitió OTRA póliza (número distinto): no se archiva — el cliente vería un PDF ajeno. */
  | { estado: 'no_coincide'; motivo: string }

/** Solo cifras y letras, en mayúsculas: «302 26-00334066» y «30226000334066» son la misma. */
export const normalizarNumeroPoliza = (v: string) => v.replace(/[^0-9A-Za-z]/g, '').toUpperCase()

export async function traerPdfEmitido(
  correduriaId: string,
  projectId: string,
  polizaId: string,
  /** Si viene, la solicitud aprobada tiene que traer ESE número: el PDF va a la vista del cliente. */
  opciones: { numeroPolizaEsperado?: string | null } = {},
): Promise<PdfTraido> {
  const r = resolverConfigEmision()
  if (r.estado !== 'lista') return { estado: 'error', motivo: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}` }
  try {
    const proyecto = await leerProyectoCrudo(r.config, projectId)
    const sol = solicitudesEmision(proyecto).find((s) => s.veredicto === 'aprobada' && s.id)
    if (!sol?.id) return { estado: 'aun_no', motivo: 'la solicitud de emisión no consta aprobada todavía' }
    const esperado = opciones.numeroPolizaEsperado?.trim()
    if (esperado) {
      if (!sol.numeroPoliza) return { estado: 'no_coincide', motivo: 'la solicitud aprobada no trae número de póliza: no se puede comprobar que sea esta' }
      if (normalizarNumeroPoliza(sol.numeroPoliza) !== normalizarNumeroPoliza(esperado)) {
        return { estado: 'no_coincide', motivo: `ese proyecto emitió la póliza ${sol.numeroPoliza}, no la ${esperado}` }
      }
    }
    const aplicacion = await peticion(r.config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}/policy-applications/${encodeURIComponent(sol.id)}`,
      timeoutMs: r.config.timeoutGenericoMs,
    })
    const a = await archivarDocumentoEmitido(r.config, { correduriaId, polizaId, crudo: aplicacion })
    if (a.documentoGuardado) return { estado: 'archivado', documentoId: a.documentoGuardado.id }
    return a.avisoDocumento ? { estado: 'error', motivo: a.avisoDocumento } : { estado: 'aun_no', motivo: 'la compañía todavía no ha generado el PDF' }
  } catch (e) {
    return { estado: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }
}
