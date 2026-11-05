// KPI del panel del dueño (spec 7ter) a partir de Σ debe/haber por cuenta. PURO.
//
// 🚨 Tres estados, nunca dos: `null` = «sin datos» (ningún apunte toca esas cuentas en el periodo: NO se sabe), número = dato
// (también 0 cuando hay apuntes que se compensan). Un libro vacío NO dice «0 € de ventas»: dice «sin datos».
// Fórmulas (PGC pymes, importes en céntimos):
//   · ventas          = Σ (haber − debe) de las cuentas 70x            (periodo)
//   · gastos          = Σ (debe − haber) de las cuentas 6xx            (periodo)
//   · resultado       = Σ (haber − debe) de 7xx − Σ (debe − haber) de 6xx (periodo; null si no hay ni 6 ni 7)
//   · ivaEstimado     = (haber − debe) de 477 − (debe − haber) de 472  (periodo; positivo = a ingresar)
//   · caja            = Σ (debe − haber) de 57x                        (acumulado hasta el fin del periodo)
//   · cobrosPendientes= Σ (debe − haber) de 43x                        (acumulado)
//   · pagosPendientes = Σ (haber − debe) de 40x y 41x                  (acumulado)
import type { SumaCuenta } from './repo.ts'

export type Kpis = {
  ventas: number | null
  gastos: number | null
  resultado: number | null
  ivaEstimado: number | null
  caja: number | null
  cobrosPendientes: number | null
  pagosPendientes: number | null
}

type Filtro = (cuenta: string) => boolean
const empieza = (...prefijos: string[]): Filtro => (c) => prefijos.some((p) => c.startsWith(p))

/** Σ (debe − haber) de las cuentas que pasan el filtro; null si ningún apunte las toca. */
function saldoDeudor(sumas: readonly SumaCuenta[], f: Filtro): number | null {
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
    ivaEstimado,
    caja: saldoDeudor(acumulado, empieza('57')),
    cobrosPendientes: saldoDeudor(acumulado, empieza('43')),
    pagosPendientes: neg(saldoDeudor(acumulado, empieza('40', '41'))),
  }
}

/** Variación vs otro periodo: null si falta cualquiera de los dos lados (comparar con «sin datos» no dice nada). */
export const variacion = (actual: number | null, anterior: number | null): number | null =>
  actual === null || anterior === null ? null : actual - anterior

// ── Periodos (reloj inyectado: nunca la fecha del sistema dentro de la lógica) ─────────────────────────────────────
export type TipoPeriodo = 'mes' | 'trimestre' | 'anio'
export type Rango = { desde: string; hasta: string }

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const finDeMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

export function rangoPeriodo(tipo: TipoPeriodo, hoy: Date): Rango {
  const a = hoy.getUTCFullYear()
  const m = hoy.getUTCMonth() + 1
  if (tipo === 'anio') return { desde: iso(a, 1, 1), hasta: iso(a, 12, 31) }
  if (tipo === 'trimestre') {
    const m0 = Math.floor((m - 1) / 3) * 3 + 1
    return { desde: iso(a, m0, 1), hasta: iso(a, m0 + 2, finDeMes(a, m0 + 2)) }
  }
  return { desde: iso(a, m, 1), hasta: iso(a, m, finDeMes(a, m)) }
}

/** Periodo inmediatamente anterior del mismo tipo. */
export function periodoAnterior(tipo: TipoPeriodo, r: Rango): Rango {
  const [a, m] = r.desde.split('-').map(Number)
  const pasos = tipo === 'mes' ? 1 : tipo === 'trimestre' ? 3 : 12
  return rangoPeriodo(tipo, new Date(Date.UTC(a, m - 1 - pasos, 1)))
}

/** Mismo periodo del año anterior. */
export function mismoPeriodoAnioAnterior(tipo: TipoPeriodo, r: Rango): Rango {
  const [a, m] = r.desde.split('-').map(Number)
  return rangoPeriodo(tipo, new Date(Date.UTC(a - 1, m - 1, 1)))
}

export const esTipoPeriodo = (v: unknown): v is TipoPeriodo => v === 'mes' || v === 'trimestre' || v === 'anio'
