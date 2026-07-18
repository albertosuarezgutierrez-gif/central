import type { Vela } from './types.ts'
import { indicadoresDe } from './indicadores.ts'
import { torneo } from './estrategias.ts'
import { bajoTendencia } from './riesgo.ts'

// BACKTEST walk-forward (paper) de UN símbolo sobre su histórico. Reproduce las decisiones del agente
// día a día SIN mirar el futuro: en cada vela `i` los indicadores se calculan solo con `velas[0..i]`.
// Long-only, una posición a la vez (no promedia). Entra cuando el torneo da señal alcista Y el precio
// está sobre su SMA50 (gate `bajoTendencia`); sale por stop (2·ATR, intradía por el mínimo del día) u
// horizonte. Es la "prueba de fuego" contra el histórico. Compara SIEMPRE contra comprar-y-mantener
// (`retornoBuyHoldPct`): batir a buy-and-hold es la vara honesta, no el signo del retorno.

export type TradeBT = {
  entradaIdx: number
  salidaIdx: number
  precioEntrada: number
  precioSalida: number
  pnlPct: number                 // (salida/entrada − 1)
  motivo: 'stop' | 'horizonte' | 'fin'
}

export type ResultadoBacktest = {
  trades: TradeBT[]
  nTrades: number
  ganadoras: number
  winRate: number                // ganadoras / nTrades (0..1)
  retornoTotalPct: number        // compuesto de los trades secuenciales
  retornoMedioPct: number        // media simple del pnl por trade
  retornoBuyHoldPct: number      // comprar en la 1ª vela operable y mantener hasta el final (benchmark)
  baten: boolean                 // ¿la estrategia bate a comprar-y-mantener? (la vara honesta)
}

export type OpcionesBacktest = {
  horizonteDias?: number         // cierre por tiempo (default 10)
  atrMult?: number               // stop = entrada − atrMult·ATR (default 2)
  minVelas?: number              // calentamiento antes de operar (default 50, para SMA50/ADX)
}

function cerrar(pos: { entradaIdx: number; precioEntrada: number }, salidaIdx: number, precioSalida: number, motivo: TradeBT['motivo']): TradeBT {
  return { entradaIdx: pos.entradaIdx, salidaIdx, precioEntrada: pos.precioEntrada, precioSalida, pnlPct: precioSalida / pos.precioEntrada - 1, motivo }
}

export function backtestSimbolo(velas: Vela[], opts: OpcionesBacktest = {}): ResultadoBacktest {
  const horizonteDias = opts.horizonteDias ?? 10
  const atrMult = opts.atrMult ?? 2
  const minVelas = opts.minVelas ?? 50
  const trades: TradeBT[] = []
  let pos: { entradaIdx: number; precioEntrada: number; stop: number } | null = null

  for (let i = minVelas; i < velas.length; i++) {
    const precio = velas[i].cierre
    if (pos) {
      if (velas[i].bajo <= pos.stop) { trades.push(cerrar(pos, i, pos.stop, 'stop')); pos = null; continue }
      if (i - pos.entradaIdx >= horizonteDias) { trades.push(cerrar(pos, i, precio, 'horizonte')); pos = null; continue }
      continue   // posición viva, sin evento → no reevaluar entradas
    }
    const ind = indicadoresDe(velas.slice(0, i + 1))
    if (ind.atr14 == null) continue
    const señales = torneo(ind, {}, velas[i].fecha || '')
    const ganadora = [...señales].filter(s => s.direccion !== 'neutral').sort((a, b) => b.confianza - a.confianza)[0]
    // Gate de tendencia de fondo: no abrir largos por debajo de la SMA50 (evita comprar cuchillos).
    if (ganadora && ganadora.direccion === 'alcista' && !bajoTendencia(precio, ind.sma50)) {
      pos = { entradaIdx: i, precioEntrada: precio, stop: precio - atrMult * ind.atr14 }
    }
  }
  if (pos) trades.push(cerrar(pos, velas.length - 1, velas[velas.length - 1].cierre, 'fin'))

  const nTrades = trades.length
  const ganadoras = trades.filter(t => t.pnlPct > 0).length
  const retornoTotalPct = trades.reduce((acc, t) => acc * (1 + t.pnlPct), 1) - 1
  const retornoMedioPct = nTrades ? trades.reduce((a, t) => a + t.pnlPct, 0) / nTrades : 0
  // Buy-and-hold: comprar en la 1ª vela operable (fin del calentamiento) y mantener hasta el final.
  const retornoBuyHoldPct = velas.length > minVelas ? velas[velas.length - 1].cierre / velas[minVelas].cierre - 1 : 0
  return {
    trades, nTrades, ganadoras, winRate: nTrades ? ganadoras / nTrades : 0,
    retornoTotalPct, retornoMedioPct, retornoBuyHoldPct, baten: retornoTotalPct > retornoBuyHoldPct,
  }
}

// Validación FUERA DE MUESTRA: parte el histórico en dos mitades y corre el backtest en cada una. Si el
// borde solo aparece "en muestra" (1ª mitad) y desaparece "fuera de muestra" (2ª), es sobreajuste. No
// recalibra parámetros (el sistema no los tiene tunables aún) — mide si el comportamiento PERSISTE.
export type ResultadoOOS = { enMuestra: ResultadoBacktest; fueraMuestra: ResultadoBacktest; corte: number }

export function backtestOOS(velas: Vela[], opts: OpcionesBacktest = {}): ResultadoOOS {
  const corte = Math.floor(velas.length / 2)
  return {
    enMuestra: backtestSimbolo(velas.slice(0, corte), opts),
    fueraMuestra: backtestSimbolo(velas.slice(corte), opts),
    corte,
  }
}
