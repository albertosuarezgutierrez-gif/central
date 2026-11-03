// lib/sivra/facturas/periodos.ts — rango de fechas del listado /sivra/facturas y su CSV. PURO.
// `hasta` es EXCLUSIVO (primer día fuera del rango), para que `fecha >= desde AND fecha < hasta` no pierda el último día.

export type Periodo =
  | { tipo: 'mes'; anio: number; mes: number }
  | { tipo: 'trimestre'; anio: number; trimestre: number }
  | { tipo: 'anio'; anio: number }
  | { tipo: 'personalizado'; desde: string; hasta: string } // inclusivo en la UI: «del 01/06 al 30/09»

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const anioOk = (a: unknown): a is number => Number.isInteger(a) && (a as number) >= 2000 && (a as number) <= 2100
const fechaOk = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

function diaSiguiente(s: string): string {
  const d = new Date(`${s}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** `null` = periodo mal formado (la ruta responde 400, no un listado vacío). */
export function rangoPeriodo(p: Periodo): { desde: string; hasta: string } | null {
  switch (p.tipo) {
    case 'mes':
      if (!anioOk(p.anio) || !Number.isInteger(p.mes) || p.mes < 1 || p.mes > 12) return null
      return { desde: iso(p.anio, p.mes, 1), hasta: p.mes === 12 ? iso(p.anio + 1, 1, 1) : iso(p.anio, p.mes + 1, 1) }
    case 'trimestre':
      if (!anioOk(p.anio) || !Number.isInteger(p.trimestre) || p.trimestre < 1 || p.trimestre > 4) return null
      return { desde: iso(p.anio, (p.trimestre - 1) * 3 + 1, 1), hasta: p.trimestre === 4 ? iso(p.anio + 1, 1, 1) : iso(p.anio, p.trimestre * 3 + 1, 1) }
    case 'anio':
      if (!anioOk(p.anio)) return null
      return { desde: iso(p.anio, 1, 1), hasta: iso(p.anio + 1, 1, 1) }
    case 'personalizado':
      if (!fechaOk(p.desde) || !fechaOk(p.hasta) || p.hasta < p.desde) return null
      return { desde: p.desde, hasta: diaSiguiente(p.hasta) }
  }
}

/** Lee el periodo de los parámetros de la URL. */
export function periodoDeQuery(q: URLSearchParams): Periodo | null {
  const tipo = q.get('periodo') ?? 'mes'
  const anio = Number(q.get('anio'))
  if (tipo === 'mes') return { tipo, anio, mes: Number(q.get('mes')) }
  if (tipo === 'trimestre') return { tipo, anio, trimestre: Number(q.get('trimestre')) }
  if (tipo === 'anio') return { tipo, anio }
  if (tipo === 'personalizado') return { tipo, desde: q.get('desde') ?? '', hasta: q.get('hasta') ?? '' }
  return null
}
