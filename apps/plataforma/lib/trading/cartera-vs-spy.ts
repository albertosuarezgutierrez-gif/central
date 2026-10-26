// 💼 Cartera real vs S&P 500 — parte PURA (sin red ni BD). El fetch del SPY vive en la página.
//
// Rentabilidad de la cartera = retorno ENCADENADO entre puntos consecutivos que corrige aportaciones.
// SUPUESTO: si `invertido` cambia entre dos puntos, el cambio es una aportación (o retirada) hecha
// al cierre del periodo, así que  r_t = (valor_t - aportacion_t) / valor_{t-1} - 1  con
// aportacion_t = invertido_t - invertido_{t-1}. (Aproximación: `invertido` es coste, no caja; una
// compra con la cartera a precio distinto de su coste mueve `invertido` por el coste, no por el
// valor, y la corrección es aproximada.) La rentabilidad acumulada es el producto de (1 + r_t) - 1.
//
// Los puntos con completo=false se ignoran (el total no es la cartera entera). Si falta cualquier
// dato → 'sin_datos_suficientes', JAMÁS un 0%. SPY: cierre del día o, si no hubo sesión (fin de
// semana/festivo), el último cierre anterior dentro de MAX_HUECO_SPY_DIAS; si no, falta.
// Ojo: SPY cotiza en USD y la cartera puede estar en EUR: la comparación no incluye efecto divisa.

export type PuntoCartera = { fecha: string; valor: number | null; invertido: number | null; completo: boolean }
export type CierreSpy = { fecha: string; cierre: number }

export type ResultadoCarteraVsSpy =
  | { estado: 'ok'; desde: string; hasta: string; rentCarteraPct: number; rentSpyPct: number; diferenciaPp: number; dias: number }
  | { estado: 'sin_datos_suficientes'; desde: string | null; hasta: string | null; rentCarteraPct: null; rentSpyPct: null; diferenciaPp: null; dias: number | null }

export const MIN_PUNTOS = 5
export const MAX_HUECO_SPY_DIAS = 4

const MS_DIA = 86_400_000
const aMs = (f: string) => Date.parse(`${f}T00:00:00Z`)
export const diasEntre = (a: string, b: string) => Math.round((aMs(b) - aMs(a)) / MS_DIA)

function sinDatos(desde: string | null = null, hasta: string | null = null, dias: number | null = null): ResultadoCarteraVsSpy {
  return { estado: 'sin_datos_suficientes', desde, hasta, rentCarteraPct: null, rentSpyPct: null, diferenciaPp: null, dias }
}

function cierreSpyEn(spy: CierreSpy[], fecha: string): number | null {
  let mejor: CierreSpy | null = null
  for (const c of spy) {
    if (c.fecha <= fecha && Number.isFinite(c.cierre) && c.cierre > 0 && (!mejor || c.fecha > mejor.fecha)) mejor = c
  }
  if (!mejor || diasEntre(mejor.fecha, fecha) > MAX_HUECO_SPY_DIAS) return null
  return mejor.cierre
}

export function carteraVsSpy(puntos: PuntoCartera[], spy: CierreSpy[]): ResultadoCarteraVsSpy {
  const ps = puntos.filter(p => p.completo).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  if (ps.length < MIN_PUNTOS) return sinDatos(ps[0]?.fecha ?? null)
  const desde = ps[0].fecha
  const hasta = ps[ps.length - 1].fecha
  const dias = diasEntre(desde, hasta)
  if (dias <= 0) return sinDatos(desde, hasta, dias)

  let factor = 1
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i]
    if (a.valor == null || b.valor == null || a.invertido == null || b.invertido == null) return sinDatos(desde, hasta, dias)
    if (!(a.valor > 0) || !Number.isFinite(b.valor)) return sinDatos(desde, hasta, dias)
    factor *= (b.valor - (b.invertido - a.invertido)) / a.valor
  }
  if (!Number.isFinite(factor)) return sinDatos(desde, hasta, dias)

  // Todas las fechas del track necesitan SPY (si falta una, el dato no es fiable).
  for (const p of ps) if (cierreSpyEn(spy, p.fecha) == null) return sinDatos(desde, hasta, dias)
  const spy0 = cierreSpyEn(spy, desde)!, spy1 = cierreSpyEn(spy, hasta)!

  const rentCarteraPct = (factor - 1) * 100
  const rentSpyPct = (spy1 / spy0 - 1) * 100
  return { estado: 'ok', desde, hasta, rentCarteraPct, rentSpyPct, diferenciaPp: rentCarteraPct - rentSpyPct, dias }
}
