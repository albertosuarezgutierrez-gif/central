// Sintaxis ENTREGABLE de un correo, más estricta que `destinoValido` del paquete.
//
// Motivo (auditoría 02/11/2026): 3 envíos de `/api/acceso/solicitar` acabaron en SMTP
// «Bad recipient address syntax». `destinoValido` deja pasar `a..b@x.es`, `.a@x.es`, `a.@x.es`,
// dominios con `_`/`!`/guion al borde o caracteres no ASCII, y el servidor SMTP los rechaza
// DESPUÉS de haber escrito la fila y gastado cuota. Aquí: dot-atom (RFC 5321/5322) en ASCII.
// Valida, no normaliza (misma regla que `destino.ts`: el hash lleva su propio trim/lower).

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const ETIQUETA = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

export function emailEntregable(email: unknown): boolean {
  if (typeof email !== 'string') return false
  const i = email.lastIndexOf('@')
  if (i <= 0 || i !== email.indexOf('@')) return false
  const local = email.slice(0, i)
  const dominio = email.slice(i + 1)
  if (local.length > 64 || dominio.length > 253) return false
  if (!LOCAL.test(local)) return false
  const etiquetas = dominio.split('.')
  if (etiquetas.length < 2) return false
  if (!etiquetas.every((e) => ETIQUETA.test(e))) return false
  return /^[A-Za-z]{2,}$/.test(etiquetas[etiquetas.length - 1])
}
