// Huella de un REMITENTE de correo (19/10/2026, F5 «¿ha escrito el cliente?»). Asegura la calcula sobre las direcciones
// de la ficha (en claro solo dentro de asegura) y plataforma la compara, en SQL, con los remitentes de `correo_triaje`
// (que plataforma ya guarda en claro): así el puerto no lleva el email del cliente.
//
// 🔗 La normalización es la MISMA que hace el SQL de plataforma:
//      encode(sha256(convert_to(lower(btrim(remitente)), 'UTF8')), 'hex')
//    (cepo en `apps/plataforma/lib/correo/lead-correduria-seguimiento.test.ts`). SHA-256 sin pimienta a propósito: no
//    protege la dirección de quien ya la tiene (plataforma), solo evita mandarla en claro por el puerto.
import { createHash } from 'node:crypto'

/** `null` si no parece una dirección (no se hashea basura). */
export function huellaRemitente(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const n = email.replace(/^ +| +$/g, '').toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(n)) return null
  return createHash('sha256').update(n, 'utf8').digest('hex')
}
