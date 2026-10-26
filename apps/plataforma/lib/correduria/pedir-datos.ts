import { enlaceDeRespuestaSolicitud } from './whatsapp-datos.ts'

/**
 * «Pedir datos al cliente por enlace» (24/09/2026; 26/10/2026 con `reemitir`, aprobado por Alberto). Módulo PURO: qué
 * enseña la pantalla tras `POST /api/correduria/solicitud-datos { oportunidadId, reemitir: true }`. Con una solicitud
 * viva, asegura le da token NUEVO a la MISMA fila (lo que el cliente tenía a medias y el plazo se conservan; el enlace
 * anterior deja de funcionar): ya no hace falta «anúlalo y crea otro».
 */
export type ResultadoPedirDatos =
  | { ok: true; url: string; mensaje: string; caduca: string; renovado: boolean; aviso: string | null }
  | { ok: false; aviso: string }

export const AVISO_ENLACE_RENOVADO = 'Enlace renovado; el anterior ya no funciona. Lo que el cliente tuviera a medias se conserva.'

export function resultadoPedirDatos(status: number, json: Record<string, unknown> | null): ResultadoPedirDatos {
  const { url, motivo } = enlaceDeRespuestaSolicitud(status, json)
  if (!url) return { ok: false, aviso: `No se ha podido generar el enlace: ${motivo ?? `HTTP ${status}`}.` }
  const renovado = json?.reemitida === true
  return {
    ok: true,
    url,
    mensaje: typeof json?.mensaje === 'string' ? json.mensaje : url,
    caduca: typeof json?.caduca === 'string' ? json.caduca : '',
    renovado,
    aviso: renovado ? AVISO_ENLACE_RENOVADO : null,
  }
}
