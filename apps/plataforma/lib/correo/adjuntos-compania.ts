// lib/correo/adjuntos-compania.ts — qué adjuntos de un correo de COMPAÑÍA se conservan para archivarlos en la ficha
// (F1 del agente corredor de correo, 21/10/2026, docs/CORREDURIA-AGENTE-CORREO.md §4.3 y §6). PURO (lo usa `imap.ts`).
//
// - Solo de remitentes de ASEGURADORA (`esDominioAseguradora`); Codeoscopic no (sus PDF de emisión ya los archiva
//   `archivar-documento.ts` desde la API, con su póliza).
// - 🛡️ Un correo EXCLUIDO por seguridad (capa 0) no conserva NADA: ni se mira la lista de adjuntos.
// - Solo PDF de verdad (firma `%PDF-`). Topes: 5 por correo, 3 MB por adjunto, 40 MB por pasada. Lo que excede (o el
//   «.pdf» que no lo es) se CUENTA en `omitidos` y el triaje lo suma a `ilegibles` del aviso: nunca se descarta callando.
//
// Por qué 3 MB y no los 10 MB de la tabla: el adjunto viaja a asegura en base64 (×1,37) dentro de un JSON y una función
// de Vercel corta el cuerpo hacia 4,5 MB. 3 MB × 1,37 ≈ 4,1 MB cabe; más no llegaría y se perdería sin decirlo. Un PDF
// mayor queda «omitido» (se dice en el aviso) y se sube a mano desde la ficha.
import type { AdjuntoCorreo } from './lead-correduria-adjuntos.ts'
import { mimeAdjunto } from './lead-correduria-adjuntos.ts'
import { esDominioAseguradora } from './keywords.ts'

export const ADJ_COMPANIA_MAX_BYTES = 3_000_000
export const ADJ_COMPANIA_MAX_POR_CORREO = 5
export const ADJ_COMPANIA_PRESUPUESTO_PASADA = 40_000_000

type Crudo = { contentType?: string; filename?: string; content?: Buffer; size?: number; related?: boolean }

/**
 * Adjuntos PDF que se conservan de un correo de compañía y cuántos válidos se quedan FUERA (para decirlo). `null` = este
 * correo no es de compañía, está excluido o no trae ningún PDF. `presupuesto` es de la pasada entera y se descuenta aquí.
 */
export function adjuntosDeCompania(
  c: { from: string; excluido: boolean },
  adjuntos: readonly Crudo[] | undefined,
  presupuesto: { bytes: number },
): { adjuntos: AdjuntoCorreo[]; omitidos: number } | null {
  if (c.excluido || !esDominioAseguradora(c.from)) return null
  const out: AdjuntoCorreo[] = []
  let omitidos = 0
  for (const a of adjuntos ?? []) {
    if (a.related || mimeAdjunto(a) !== 'application/pdf') continue
    const contenido = a.content
    if (!contenido || contenido.length === 0) { omitidos++; continue }
    const n = contenido.length
    if (contenido.subarray(0, 5).toString('latin1') !== '%PDF-') { omitidos++; continue }
    if (n > ADJ_COMPANIA_MAX_BYTES || out.length >= ADJ_COMPANIA_MAX_POR_CORREO || n > presupuesto.bytes) { omitidos++; continue }
    presupuesto.bytes -= n
    const nombre = (a.filename ?? '').replace(/[\r\n\0/\\]/g, ' ').trim().slice(0, 120) || 'adjunto.pdf'
    out.push({ nombre, mime: 'application/pdf', contenido })
  }
  return out.length || omitidos ? { adjuntos: out, omitidos } : null
}
