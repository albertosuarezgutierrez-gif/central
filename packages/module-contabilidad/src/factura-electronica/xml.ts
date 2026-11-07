// Utilidades XML mínimas (sin dependencias). Escapa texto y atributos; `importe` formatea céntimos enteros sin float.
import { validarCentimos, type Centimos } from '../partida/dinero.ts'

export function esc(v: string): string {
  // Quita caracteres de control no permitidos en XML 1.0 y escapa los cinco reservados.
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
export function importe(c: Centimos, decimales: 2 | 6 = 2): string {
  validarCentimos(c)
  const abs = Math.abs(c)
  return `${c < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}${decimales === 6 ? '0000' : ''}`
}
/** Milésimas → decimal con 3 decimales («2500» → «2.500»). */
export function milesimas(m: number): string {
  return `${Math.floor(m / 1000)}.${String(m % 1000).padStart(3, '0')}`
}
/** Porcentaje (número) → «21.00»; admite hasta 2 decimales. */
export function porcentajeTxt(p: number): string {
  const c = Math.round(p * 100)
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`
}
/** Elemento con texto: `<tag>valor</tag>`. */
export const el = (tag: string, valor: string, attrs = ''): string => `<${tag}${attrs ? ' ' + attrs : ''}>${esc(valor)}</${tag}>`
