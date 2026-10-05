// Formato español de los valores de un informe (pantalla, PDF y CSV). Módulo PURO.
// - Números: 1.234,56 (punto de miles también con 4 cifras, coma decimal).
// - Dinero: 2.162,49€ (€ detrás, sin espacio). Horas: 2 decimales.
// - Fechas: dd/mm/aaaa; fecha-hora en hora de Madrid.
// - null = «sin dato»: celda vacía (nunca 0).

import type { TipoColumna } from './catalogo'

export const ZONA = 'Europe/Madrid'

/** 1234.5 → «1.234,50» (dec = 2). Agrupa miles siempre, también con 4 cifras. */
export function numeroEs(n: number, dec = 2): string {
  const neg = n < 0
  const [ent, frac] = Math.abs(n).toFixed(dec).split('.')
  const conPuntos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const s = frac ? `${conPuntos},${frac}` : conPuntos
  return neg && /[1-9]/.test(s) ? `-${s}` : s
}

/** Entero si lo es; si no, 2 decimales. */
function numeroLibre(n: number): string {
  return Number.isInteger(n) ? numeroEs(n, 0) : numeroEs(n, 2)
}

export const dineroEs = (n: number) => `${numeroEs(n, 2)}€`

/** 'YYYY-MM-DD' (o ISO) → 'dd/mm/aaaa'. */
export function fechaEs(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v
}

/** Partes de fecha-hora en hora de Madrid (para pantalla y para Excel). */
export function partesMadrid(iso: string): { y: number; m: number; d: number; h: number; mi: number } | null {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(t).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]),
  ) as Record<string, number>
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute }
}

export function fechaHoraEs(iso: string): string {
  const p = partesMadrid(iso)
  if (!p) return iso
  const z = (n: number) => String(n).padStart(2, '0')
  return `${z(p.d)}/${z(p.m)}/${p.y} ${z(p.h)}:${z(p.mi)}`
}

/** Valor de celda → texto en español. null/undefined → '' (sin dato). */
export function formatearValor(tipo: TipoColumna, v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  switch (tipo) {
    case 'dinero': return typeof v === 'number' ? dineroEs(v) : String(v)
    case 'horas': return typeof v === 'number' ? numeroEs(v, 2) : String(v)
    case 'numero': return typeof v === 'number' ? numeroLibre(v) : String(v)
    case 'fecha': return fechaEs(String(v))
    case 'fechahora': return fechaHoraEs(String(v))
    case 'booleano': return v === true ? 'Sí' : v === false ? 'No' : String(v)
    default: return String(v)
  }
}

/** Valor de una métrica (recuento, suma, media). null → «—» (no hay dato que sumar). */
export function formatearMetrica(formato: TipoColumna | 'recuento', v: number | null): string {
  if (v === null) return '—'
  if (formato === 'recuento') return numeroEs(v, 0)
  if (formato === 'horas') return `${numeroEs(v, 2)} h`
  return formatearValor(formato, v)
}
