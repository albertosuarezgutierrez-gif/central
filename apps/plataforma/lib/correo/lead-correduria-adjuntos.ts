// lib/correo/lead-correduria-adjuntos.ts — qué adjuntos de un correo se CONSERVAN para la respuesta de un lead
// (19/10/2026, spec lead → propuesta F2). PURO (lo usa `imap.ts`; test al lado).
//
// El triaje no guarda adjuntos (una pasada son hasta 50 correos): solo PDFs de aseguradoras. La F2 amplía eso SOLO para
// lo que puede ser la respuesta de un lead en su hilo —tiene referencias (es respuesta) e iba a un buzón de la
// correduría— y SOLO fotos y PDF (DNI, ficha técnica, póliza anterior), con topes por correo y por pasada. Que de verdad
// sea la respuesta de un lead lo decide después el proceso (casando el hilo en asegura); lo que no case se descarta
// en memoria sin tocar disco. Nunca se pasan por la IA ni a Telegram: asegura los guarda cifrados.
import { esDestinoCorreduria } from './lead-correduria.ts'

export type AdjuntoCorreo = { nombre: string; mime: string; contenido: Buffer }

const MIMES: Record<string, string> = {
  'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp',
  'image/heic': 'image/heic', 'image/heif': 'image/heif', 'application/pdf': 'application/pdf',
}
const POR_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' }

export const ADJ_MAX_BYTES = 2_000_000
export const ADJ_MAX_POR_CORREO = 3
export const ADJ_PRESUPUESTO_PASADA = 12_000_000
/** Una imagen más pequeña es un logo de firma, no un documento. */
const ADJ_MIN_IMAGEN = 8_000

type Crudo = { contentType?: string; filename?: string; content?: Buffer; size?: number; related?: boolean; contentDisposition?: string }

export function mimeAdjunto(a: Pick<Crudo, 'contentType' | 'filename'>): string | null {
  const ct = (a.contentType ?? '').toLowerCase().split(';')[0].trim()
  if (MIMES[ct]) return MIMES[ct]
  if (ct && ct !== 'application/octet-stream') return null
  const ext = (a.filename ?? '').toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1]
  return ext ? POR_EXTENSION[ext] ?? null : null
}

/**
 * Adjuntos que se conservan (y cuántos documentos válidos se quedan FUERA por tope, para decirlo). `presupuesto` es
 * de la pasada entera y se descuenta aquí. Fuera de una posible respuesta de lead → `null` (no se conserva nada). PURA
 * salvo el descuento del presupuesto.
 */
export function adjuntosDeRespuestaLead(
  c: { referencias: readonly string[]; destinatarios: readonly string[]; automatico: boolean },
  adjuntos: readonly Crudo[] | undefined,
  presupuesto: { bytes: number },
): { adjuntos: AdjuntoCorreo[]; omitidos: number } | null {
  if (!c.referencias.length || c.automatico || !esDestinoCorreduria(c.destinatarios)) return null
  const out: AdjuntoCorreo[] = []
  let omitidos = 0
  for (const a of adjuntos ?? []) {
    const mime = mimeAdjunto(a)
    if (!mime || !a.content || a.related) continue
    const n = a.content.length
    if (mime !== 'application/pdf' && n < ADJ_MIN_IMAGEN) continue
    if (n > ADJ_MAX_BYTES || out.length >= ADJ_MAX_POR_CORREO || n > presupuesto.bytes) { omitidos++; continue }
    presupuesto.bytes -= n
    const nombre = (a.filename ?? '').replace(/[\r\n\0/\\]/g, ' ').trim().slice(0, 120) || `adjunto.${mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]}`
    out.push({ nombre, mime, contenido: a.content })
  }
  return out.length || omitidos ? { adjuntos: out, omitidos } : null
}
