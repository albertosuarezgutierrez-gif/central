// Series mensuales / trimestrales / anuales de ventas, gastos, resultado, margen y caja. PURO.
// Entrada: Σ por (mes, cuenta) — la forma que agrega la BD en una sola consulta y que también sale de unos asientos.
// Un cubo sin ningún apunte relevante lleva `null` («sin datos»), nunca 0.
import type { Asiento } from '../partida/asiento.ts'
import { cubosHasta, type Granularidad } from './periodos.ts'
import type { SumaCuenta } from './kpis.ts'
import { saldoDeudor } from './kpis.ts'

export type SumaMes = { mes: string; cuenta: string; debe: number; haber: number; n: number }

/** Agrupa asientos por (mes `AAAA-MM`, cuenta). */
export function sumasMensualesDeAsientos(asientos: readonly Asiento[]): SumaMes[] {
  const m = new Map<string, SumaMes>()
  for (const a of asientos) {
    const mes = a.fecha.slice(0, 7)
    for (const p of a.apuntes) {
      const k = `${mes}|${p.cuenta}`
      const x = m.get(k) ?? { mes, cuenta: p.cuenta, debe: 0, haber: 0, n: 0 }
      x.debe += p.debe; x.haber += p.haber; x.n += 1
      m.set(k, x)
    }
  }
  return [...m.values()]
}

export type PuntoSerie = {
  clave: string
  etiqueta: string
  desde: string
  hasta: string
  ventas: number | null
  gastos: number | null
  resultado: number | null
  margenPct: number | null
  /** Saldo de las cuentas 57x al FIN del cubo (acumulado desde el principio de los datos). */
  caja: number | null
  /** Resultado acumulado dentro de la ventana mostrada (null mientras no haya ningún cubo con datos). */
  resultadoAcumulado: number | null
  /** Ventas del mismo cubo un año antes (null si no hay). */
  ventasAnioAnterior: number | null
}

const aSumas = (xs: readonly SumaMes[]): SumaCuenta[] => xs.map((x) => ({ cuenta: x.cuenta, debe: x.debe, haber: x.haber, n: x.n }))

function flujo(sumas: readonly SumaMes[], desde: string, hasta: string) {
  const mDesde = desde.slice(0, 7)
  const mHasta = hasta.slice(0, 7)
  const en = aSumas(sumas.filter((x) => x.mes >= mDesde && x.mes <= mHasta))
  const v = saldoDeudor(en, (c) => c.startsWith('70'))
  const ventas = v === null ? null : -v || 0
  const gastos = saldoDeudor(en, (c) => c.startsWith('6'))
  const i = saldoDeudor(en, (c) => c.startsWith('7'))
  const ingresos = i === null ? null : -i || 0
  const resultado = ingresos === null && gastos === null ? null : (ingresos ?? 0) - (gastos ?? 0)
  const margenPct = resultado === null || ingresos === null || ingresos <= 0 ? null : Math.round((resultado * 1000) / ingresos) / 10
  return { ventas, gastos, resultado, margenPct }
}

/** Serie de los `n` últimos cubos (el último contiene `hoy`). `sumas` debe incluir TODO el histórico hasta hoy (la caja es un saldo). */
export function serieTemporal(sumas: readonly SumaMes[], gran: Granularidad, hoy: Date, n: number): PuntoSerie[] {
  let acumulado: number | null = null
  return cubosHasta(gran, hoy, n).map((c) => {
    const f = flujo(sumas, c.desde, c.hasta)
    if (f.resultado !== null) acumulado = (acumulado ?? 0) + f.resultado
    const [a, ...resto] = c.desde.split('-')
    const antes = flujo(sumas, [String(Number(a) - 1), ...resto].join('-'), [String(Number(c.hasta.slice(0, 4)) - 1), ...c.hasta.split('-').slice(1)].join('-'))
    const caja = saldoDeudor(aSumas(sumas.filter((x) => x.mes <= c.hasta.slice(0, 7))), (cu) => cu.startsWith('57'))
    return { ...c, ...f, caja, resultadoAcumulado: acumulado, ventasAnioAnterior: antes.ventas }
  })
}
