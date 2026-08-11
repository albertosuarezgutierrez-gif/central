// 📏 MEDICIÓN ALINEADA del forward paper (auditoría 11/08/2026). Las funciones históricas de
// seleccionEval.ts / riesgoCesta.ts miden sobre «lo que la fuente devuelva»: si Stooq trunca una
// serie (limita IPs de datacenter; con ≥2 puntos no se cae a Yahoo), el retorno de ese símbolo se
// calcula sobre OTRA ventana que el benchmark, y el drawdown de la cesta —alineado por índice y
// recortado a la longitud mínima— se compara con un drawdown del SPY de distinta duración. Ese
// número es la EVIDENCIA de la escalera de dinero real, y puede estar sesgado en cualquiera de los
// dos sentidos. La clave de un dato es su PERIODO: aquí toda medida exige series FECHADAS que cubran
// la MISMA ventana; lo que no la cubre sale como null y DECLARADO (sinDatos), nunca como un retorno
// de otra ventana. Puro y serializable: el consumidor aporta los puntos {fecha, cierre}.

import type { EvalCesta, RetornoSimbolo } from './seleccionEval.ts'
import { maxDrawdown, volatilidadAnual, trackingErrorAnual, type MetricasRiesgo } from './riesgoCesta.ts'

export type PuntoSerie = { fecha: string; cierre: number }   // fecha ISO YYYY-MM-DD

// Tolerancia de cobertura en DÍAS NATURALES en cada punta de la ventana: cubre finde + festivo +
// que la fuente publique el cierre con 1-2 sesiones de retraso (la pasada corre el lunes por la
// tarde y Stooq/Yahoo pueden ir por el viernes). Más allá de esto, la serie NO cubre la ventana.
export const TOLERANCIA_COBERTURA_DIAS = 6

const diasEntre = (d1: string, d2: string): number => Math.round((Date.parse(d2) - Date.parse(d1)) / 86_400_000)

// Retorno total de una serie fechada DENTRO de [desde, hasta]. null si la serie no cubre la ventana
// (empieza tarde o acaba pronto más allá de la tolerancia) — medir sobre otra ventana es mentir.
export function retornoVentana(
  puntos: PuntoSerie[], desde: string, hasta: string, toleranciaDias = TOLERANCIA_COBERTURA_DIAS,
): number | null {
  if (!Array.isArray(puntos) || puntos.length < 2) return null
  const dentro = puntos.filter(p => p.fecha >= desde && p.fecha <= hasta && p.cierre > 0)
  if (dentro.length < 2) return null
  const primero = dentro[0]
  const ultimo = dentro[dentro.length - 1]
  if (diasEntre(desde, primero.fecha) > toleranciaDias) return null
  if (diasEntre(ultimo.fecha, hasta) > toleranciaDias) return null
  return ultimo.cierre / primero.cierre - 1
}

export type EvalCestaAlineada = EvalCesta & {
  total: number          // tamaño de la cesta congelada (medidos = n)
  sinDatos: string[]     // símbolos SIN serie que cubra la ventana — declarados, no colapsados
}

// Como evaluarCestaVsBench pero con series FECHADAS y la MISMA ventana para todos. El benchmark debe
// cubrir la ventana (si no, no hay con qué comparar → null). Los símbolos que no la cubren no
// puntúan Y quedan declarados en `sinDatos` (un 6/8 no puede leerse como si fuera la cesta entera).
export function evaluarCestaVsBenchAlineada(
  cesta: Array<{ simbolo: string; puntos: PuntoSerie[] }>,
  bench: PuntoSerie[],
  desde: string,
  hasta: string,
): EvalCestaAlineada | null {
  const retornoBench = retornoVentana(bench, desde, hasta)
  if (retornoBench == null) return null

  const porSimbolo: RetornoSimbolo[] = []
  const sinDatos: string[] = []
  for (const { simbolo, puntos } of cesta) {
    const r = retornoVentana(puntos, desde, hasta)
    if (r == null) { sinDatos.push(simbolo); continue }
    porSimbolo.push({ simbolo, retorno: r })
  }
  if (porSimbolo.length === 0) return null

  const retornoCesta = porSimbolo.reduce((s, x) => s + x.retorno, 0) / porSimbolo.length
  porSimbolo.sort((a, b) => b.retorno - a.retorno)
  const alpha = retornoCesta - retornoBench
  return {
    n: porSimbolo.length, total: cesta.length, sinDatos,
    retornoCesta, retornoBench, alpha, bate: alpha > 0,
    ganadoresVsBench: porSimbolo.filter(x => x.retorno > retornoBench).length,
    porSimbolo,
  }
}

// Curvas de cesta equiponderada y benchmark sobre el MISMO calendario (las fechas del benchmark
// dentro de la ventana — el SPY siempre cotiza). Solo entran las series que CUBREN la ventana; en
// los huecos intermedios de una serie se arrastra el último cierre conocido (festivo puntual de la
// fuente), y los días previos a su primer cierre valen como el primero (arranque plano dentro de la
// tolerancia). Devuelve también cuántas series entraron, para declararlo.
export function curvasAlineadas(
  series: PuntoSerie[][],
  bench: PuntoSerie[],
  desde: string,
  hasta: string,
): { curvaCesta: number[]; curvaBench: number[]; nSeries: number } | null {
  if (retornoVentana(bench, desde, hasta) == null) return null
  const calendario = bench.filter(p => p.fecha >= desde && p.fecha <= hasta && p.cierre > 0)
  if (calendario.length < 2) return null

  const validas = series.filter(s => retornoVentana(s, desde, hasta) != null)
  if (!validas.length) return null

  const normalizadas: number[][] = []
  for (const s of validas) {
    const porFecha = new Map(s.filter(p => p.cierre > 0).map(p => [p.fecha, p.cierre]))
    const valores: number[] = []
    let ultimo: number | null = null
    for (const dia of calendario) {
      const v = porFecha.get(dia.fecha)
      if (v != null) ultimo = v
      valores.push(ultimo ?? NaN)   // NaN solo antes del primer cierre; se rellena plano después
    }
    const primerIdx = valores.findIndex(v => Number.isFinite(v))
    if (primerIdx < 0) continue
    const base = valores[primerIdx]
    normalizadas.push(valores.map((v, i) => (i < primerIdx ? 1 : v / base)))
  }
  if (!normalizadas.length) return null

  const curvaCesta = calendario.map((_, t) => normalizadas.reduce((s, serie) => s + serie[t], 0) / normalizadas.length)
  const base = calendario[0].cierre
  const curvaBench = calendario.map(p => p.cierre / base)
  return { curvaCesta, curvaBench, nSeries: normalizadas.length }
}

export type MetricasRiesgoAlineadas = MetricasRiesgo & { nSeries: number }

// Riesgo de la cesta vs benchmark medido sobre el MISMO calendario y la MISMA ventana — el cociente
// de drawdowns del tramo 3 de la escalera deja de comparar 30 sesiones contra 4 meses.
export function metricasRiesgoAlineadas(
  series: PuntoSerie[][],
  bench: PuntoSerie[],
  desde: string,
  hasta: string,
): MetricasRiesgoAlineadas | null {
  const curvas = curvasAlineadas(series, bench, desde, hasta)
  if (!curvas) return null
  const { curvaCesta, curvaBench, nSeries } = curvas
  return {
    maxDrawdown: maxDrawdown(curvaCesta),
    maxDrawdownBench: maxDrawdown(curvaBench),
    volAnual: volatilidadAnual(curvaCesta),
    volBenchAnual: volatilidadAnual(curvaBench),
    trackingError: trackingErrorAnual(curvaCesta, curvaBench),
    nSeries,
  }
}
