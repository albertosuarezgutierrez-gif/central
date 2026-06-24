// lib/sivra/agente-huesped/clave-dedup.ts
// Clave de idempotencia de un mensaje del huésped (pura, testeable con `node --test`).
// Usa el id del mensaje de Smoobu si lo hay; si NO lo hay (p.ej. el webhook no lo trae), cae a una
// clave estable por reserva+contenido, para no reprocesar el MISMO mensaje en cada sondeo.
import { createHash } from 'node:crypto'

export function claveDedup(bookingId: string, msgId: string | null | undefined, pregunta: string): string {
  if (msgId) return msgId
  const norm = `${bookingId}|${(pregunta || '').trim().toLowerCase().replace(/\s+/g, ' ')}`
  return `c:${bookingId}:${createHash('sha1').update(norm).digest('hex').slice(0, 16)}`
}
