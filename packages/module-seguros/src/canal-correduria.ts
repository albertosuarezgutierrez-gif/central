// Canal de la CORREDURÍA ≠ dato del cliente.
//
// Cuando una compañía EXIGE email/móvil y el titular no tiene (típico: un familiar lleva sus
// seguros), se pone el de la correduría (Alberto, 03/10/2026). Esos datos NO son del cliente:
// no se pintan como suyos, no se usan para avisarle ni para agrupar/fundir fichas.
// Los datos salen de `MEDIADOR` (una sola fuente).
import { MEDIADOR } from './mediador.ts'

function normalizarEmail(v: string): string {
  const s = v.trim().toLowerCase().replace(/\s+/g, '')
  const at = s.lastIndexOf('@')
  if (at < 1) return s
  const local = s.slice(0, at).split('+')[0]
  return `${local}@${s.slice(at + 1)}`
}

function normalizarTelefono(v: string): string {
  let d = v.replace(/\D/g, '')
  if (d.startsWith('0034')) d = d.slice(4)
  else if (d.length > 9 && d.startsWith('34')) d = d.slice(2)
  return d
}

/** `true` si el valor (email o teléfono) es un canal de la correduría. `null`/vacío → false. */
export function esCanalCorreduria(valor: string | null | undefined): boolean {
  if (typeof valor !== 'string' || !valor.trim()) return false
  if (valor.includes('@')) return normalizarEmail(valor) === normalizarEmail(MEDIADOR.identidad.email)
  const t = normalizarTelefono(valor)
  return t.length >= 6 && t === normalizarTelefono(MEDIADOR.identidad.telefono)
}
