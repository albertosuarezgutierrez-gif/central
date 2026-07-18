import type { Vela } from './types.ts'
import { indicadoresDe } from './indicadores.ts'
import { torneo } from './estrategias.ts'

// BACKTEST walk-forward (paper) de UN símbolo sobre su histórico. Reproduce las decisiones del agente
// día a día SIN mirar el futuro: en cada vela `i` los indicadores se calculan solo con `velas[0..i]`.
// Long-only, una posición a la vez (no promedia). Entra cuando el torneo da señal alcista; sale por
// stop (2·ATR, intradía por el mínimo del día) u horizonte. Es la "prueba de fuego" contra el histórico.

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
    if (ganadora && ganadora.direccion === 'alcista') {
      pos = { entradaIdx: i, precioEntrada: precio, stop: precio - atrMult * ind.atr14 }
    }
  }
  if (pos) trades.push(cerrar(pos, velas.length - 1, velas[velas.length - 1].cierre, 'fin'))

  const nTrades = trades.length
  const ganadoras = trades.filter(t => t.pnlPct > 0).length
  const retornoTotalPct = trades.reduce((acc, t) => acc * (1 + t.pnlPct), 1) - 1
  const retornoMedioPct = nTrades ? trades.reduce((a, t) => a + t.pnlPct, 0) / nTrades : 0
  return { trades, nTrades, ganadoras, winRate: nTrades ? ganadoras / nTrades : 0, retornoTotalPct, retornoMedioPct }
}
