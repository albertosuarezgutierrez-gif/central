// Importes en CÉNTIMOS ENTEROS en la frontera de la app (formularios y filas de BD). PURO.
// Nunca floats: «1.234,56» se convierte dígito a dígito, sin pasar por parseFloat.
import { esCentimos, type Centimos } from '@central/module-contabilidad'

export { formatearCentimos } from '@central/module-contabilidad'

/**
 * «1.234,56» / «1234,5» / «1234» / «0,07» → céntimos. null si no es un importe válido (vacío, negativo, más de 2 decimales,
 * letras, puntos de miles mal puestos). Formato español: coma decimal; punto solo como separador de miles.
 */
export function parsearImporte(texto: unknown): Centimos | null {
  if (typeof texto !== 'string') return null
  const t = texto.trim().replace(/\s|€/g, '')
  if (!t) return null
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(t)
  if (!m) return null
  const enteros = m[1].replace(/\./g, '')
  const dec = (m[2] ?? '').padEnd(2, '0')
  if (enteros.length > 13) return null
  const c = Number(enteros) * 100 + Number(dec)
  return esCentimos(c) ? c : null
}

/** Valor de una columna bigint/integer de Postgres (Prisma da `bigint` para bigint) → céntimos. Lanza si no es entero seguro. */
export function centimosDeBd(v: unknown, etiqueta = 'importe'): Centimos {
  const n = typeof v === 'bigint' ? Number(v) : v
  if (!esCentimos(n)) throw new Error(`${etiqueta} de BD no es un entero seguro en céntimos: ${String(v)}`)
  return n
}

/** Entero pequeño de BD (count, número de asiento). */
export function enteroDeBd(v: unknown, etiqueta = 'entero'): number {
  const n = typeof v === 'bigint' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new Error(`${etiqueta} de BD no es entero: ${String(v)}`)
  return n
}

/** Fecha de BD (`date` → Date de Prisma, o texto ISO) → `AAAA-MM-DD`. */
export function fechaDeBd(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  throw new Error(`fecha de BD no válida: ${String(v)}`)
}

/** `AAAA-MM-DD` → «dd/mm/aaaa». */
export function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
