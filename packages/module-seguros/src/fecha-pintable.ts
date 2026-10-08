/**
 * Fechas que se pintan en las fichas de la correduría. PURO.
 *
 * 🚨 Las fechas centinela (`1900-01-01`, `9999-12-31`, `0001-01-01`…) son el «sin fecha» de las
 * compañías: nunca se pintan como fecha («Solicitud 01/01/1900»). Son `null` = no consta.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})/
const AÑO_MINIMO = 1901
const AÑO_MAXIMO = 2999

/** `YYYY-MM-DD` real y no centinela, o `null` (basura, imposible o centinela). Acepta `YYYY-MM-DDT…`. */
export function diaIsoPintable(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = ISO.exec(v.trim())
  if (!m) return null
  const [, a, mes, d] = m
  const año = Number(a)
  if (año < AÑO_MINIMO || año > AÑO_MAXIMO) return null
  const f = new Date(`${a}-${mes}-${d}T00:00:00Z`)
  if (Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== `${a}-${mes}-${d}`) return null
  return `${a}-${mes}-${d}`
}

/** `dd/mm/aaaa` o `null` si no hay fecha pintable (ausente, ilegible o centinela). */
export function fechaPintable(v: unknown): string | null {
  const dia = diaIsoPintable(v)
  return dia === null ? null : `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`
}
