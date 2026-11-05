// KPI del panel del dueño (spec 7ter) a partir de Σ debe/haber por cuenta. PURO.
//
// 🚨 Tres estados, nunca dos: `null` = «sin datos» (ningún apunte toca esas cuentas en el periodo: NO se sabe), número = dato
// (también 0 cuando hay apuntes que se compensan). Un libro vacío NO dice «0 € de ventas»: dice «sin datos».
// Fórmulas (PGC pymes, importes en céntimos):
//   · ventas          = Σ (haber − debe) de las cuentas 70x                (periodo)
//   · gastos          = Σ (debe − haber) de las cuentas 6xx                (periodo)
//   · resultado       = Σ (haber − debe) de 7xx − Σ (debe − haber) de 6xx (periodo; null si no hay ni 6 ni 7)
//   · margenPct       = resultado / ingresos(7xx) × 100, 1 decimal         (null si no hay ingresos o son ≤ 0)
//   · ivaEstimado     = (haber − debe) de 477 − (debe − haber) de 472      (periodo; positivo = a ingresar)
//   · caja            = Σ (debe − haber) de 57x                            (acumulado hasta el fin del periodo)
//   · cobrosPendientes= Σ (debe − haber) de 43x                            (acumulado)
//   · pagosPendientes = Σ (haber − debe) de 40x y 41x                      (acumulado)
import type { Asiento } from '../partida/asiento.ts'
import type { Centimos } from '../partida/dinero.ts'
import type { Periodo } from '../partida/libros.ts'

export type SumaCuenta = { cuenta: string; debe: Centimos; haber: Centimos; n: number }

export type Kpis = {
  ventas: number | null
  gastos: number | null
  resultado: number | null
  margenPct: number | null
  ivaEstimado: number | null
  caja: number | null
  cobrosPendientes: number | null
  pagosPendientes: number | null
}
export type ClaveKpi = keyof Kpis

type Filtro = (cuenta: string) => boolean
const empieza = (...prefijos: string[]): Filtro => (c) => prefijos.some((p) => c.startsWith(p))

/** Σ (debe − haber) de las cuentas que pasan el filtro; null si ningún apunte las toca. */
export function saldoDeudor(sumas: readonly SumaCuenta[], f: Filtro): number | null {
  let n = 0
  let s = 0
  for (const x of sumas) if (f(x.cuenta)) { n += x.n; s += x.debe - x.haber }
  return n > 0 ? s : null
}
const neg = (v: number | null) => (v === null ? null : -v || 0)

export function calcularKpis(periodo: readonly SumaCuenta[], acumulado: readonly SumaCuenta[]): Kpis {
  const ventas = neg(saldoDeudor(periodo, empieza('70')))
  const gastos = saldoDeudor(periodo, empieza('6'))
  const ingresos = neg(saldoDeudor(periodo, empieza('7')))
  const resultado = ingresos === null && gastos === null ? null : (ingresos ?? 0) - (gastos ?? 0)
  const repercutido = neg(saldoDeudor(periodo, (c) => c.startsWith('477')))
  const soportado = saldoDeudor(periodo, (c) => c.startsWith('472'))
  const ivaEstimado = repercutido === null && soportado === null ? null : (repercutido ?? 0) - (soportado ?? 0)
  return {
    ventas,
    gastos,
    resultado,
    margenPct: resultado === null || ingresos === null || ingresos <= 0 ? null : Math.round((resultado * 1000) / ingresos) / 10,
    ivaEstimado,
    caja: saldoDeudor(acumulado, empieza('57')),
    cobrosPendientes: saldoDeudor(acumulado, empieza('43')),
    pagosPendientes: neg(saldoDeudor(acumulado, empieza('40', '41'))),
  }
}

/** Variación absoluta vs otro periodo: null si falta cualquiera de los dos lados (comparar con «sin datos» no dice nada). */
export const variacion = (actual: number | null, anterior: number | null): number | null =>
  actual === null || anterior === null ? null : actual - anterior

/** Variación relativa en %, 1 decimal: null si falta un lado o el anterior es 0 (no se puede dividir). Sobre el valor absoluto del anterior. */
export function variacionPct(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior === 0) return null
  return Math.round(((actual - anterior) * 1000) / Math.abs(anterior)) / 10
}

export type Sentido = 'sube' | 'baja' | 'igual'
export type Comparacion = { abs: number; pct: number | null; sentido: Sentido }

/** Comparación lista para pintar la flecha (↑/↓) y el %: null si no hay con qué comparar. */
export function comparar(actual: number | null, previo: number | null): Comparacion | null {
  const abs = variacion(actual, previo)
  if (abs === null) return null
  return { abs, pct: variacionPct(actual, previo), sentido: abs > 0 ? 'sube' : abs < 0 ? 'baja' : 'igual' }
}

export type TarjetaKpi = { clave: ClaveKpi; valor: number | null; vsAnterior: Comparacion | null; vsAnioPasado: Comparacion | null }

export function tarjetasKpi(actual: Kpis, anterior: Kpis, anioPasado: Kpis): TarjetaKpi[] {
  return (Object.keys(actual) as ClaveKpi[]).map((clave) => ({
    clave, valor: actual[clave], vsAnterior: comparar(actual[clave], anterior[clave]), vsAnioPasado: comparar(actual[clave], anioPasado[clave]),
  }))
}

function enPeriodo(a: Asiento, p?: Periodo): boolean {
  return !(p?.desde && a.fecha < p.desde) && !(p?.hasta && a.fecha > p.hasta)
}

/** Σ debe / Σ haber / nº de apuntes por cuenta de los asientos del periodo (la misma forma que devuelve el repositorio SQL). */
export function sumasDeAsientos(asientos: readonly Asiento[], periodo?: Periodo): SumaCuenta[] {
  const m = new Map<string, SumaCuenta>()
  for (const a of asientos) {
    if (!enPeriodo(a, periodo)) continue
    for (const p of a.apuntes) {
      const x = m.get(p.cuenta) ?? { cuenta: p.cuenta, debe: 0, haber: 0, n: 0 }
      x.debe += p.debe; x.haber += p.haber; x.n += 1
      m.set(p.cuenta, x)
    }
  }
  return [...m.values()]
}

/** KPI de un periodo calculados directamente sobre asientos: flujo = periodo; saldos = acumulado hasta `hasta`. */
export function kpisDeAsientos(asientos: readonly Asiento[], periodo: { desde: string; hasta: string }): Kpis {
  return calcularKpis(sumasDeAsientos(asientos, periodo), sumasDeAsientos(asientos, { hasta: periodo.hasta }))
}
