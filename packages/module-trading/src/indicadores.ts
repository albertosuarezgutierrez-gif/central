import type { Vela, Indicadores, Regimen } from './types.ts'

export function sma(valores: number[], n: number): number | null {
  if (valores.length < n) return null
  const ventana = valores.slice(-n)
  return ventana.reduce((a, b) => a + b, 0) / n
}

export function ema(valores: number[], n: number): number | null {
  if (valores.length < n) return null
  const k = 2 / (n + 1)
  // Arranca en el SMA de las primeras n muestras y avanza.
  let e = valores.slice(0, n).reduce((a, b) => a + b, 0) / n
  for (let i = n; i < valores.length; i++) e = valores[i] * k + e * (1 - k)
  return e
}

export function rsi(cierres: number[], n = 14): number | null {
  if (cierres.length < n + 1) return null
  let ganancias = 0, perdidas = 0
  for (let i = cierres.length - n; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1]
    if (d >= 0) ganancias += d
    else perdidas -= d
  }
  if (perdidas === 0) return 100
  const rs = (ganancias / n) / (perdidas / n)
  return 100 - 100 / (1 + rs)
}

export function macd(cierres: number[]): { macd: number | null; signal: number | null } {
  const ema12 = ema(cierres, 12)
  const ema26 = ema(cierres, 26)
  if (ema12 === null || ema26 === null) return { macd: null, signal: null }
  const linea = ema12 - ema26
  // Signal = EMA9 de la línea MACD; aproximamos con la serie de MACD recalculada.
  const serie: number[] = []
  for (let i = 26; i <= cierres.length; i++) {
    const sub = cierres.slice(0, i)
    const a = ema(sub, 12), b = ema(sub, 26)
    if (a !== null && b !== null) serie.push(a - b)
  }
  const signal = ema(serie, 9)
  return { macd: linea, signal }
}

export function atr(velas: Vela[], n = 14): number | null {
  if (velas.length < n + 1) return null
  const trs: number[] = []
  for (let i = velas.length - n; i < velas.length; i++) {
    const v = velas[i], prev = velas[i - 1]
    trs.push(Math.max(v.alto - v.bajo, Math.abs(v.alto - prev.cierre), Math.abs(v.bajo - prev.cierre)))
  }
  return trs.reduce((a, b) => a + b, 0) / n
}

export function indicadoresDe(velas: Vela[]): Indicadores {
  const cierres = velas.map(v => v.cierre)
  const m = macd(cierres)
  return {
    sma20: sma(cierres, 20),
    sma50: sma(cierres, 50),
    ema12: ema(cierres, 12),
    ema26: ema(cierres, 26),
    rsi14: rsi(cierres, 14),
    macd: m.macd,
    macdSignal: m.signal,
    atr14: atr(velas, 14),
  }
}

export function regimenDe(ind: Indicadores): Regimen {
  if (ind.sma20 === null || ind.sma50 === null) return 'lateral'
  const dif = (ind.sma20 - ind.sma50) / ind.sma50
  if (dif > 0.01) return 'tendencia_alcista'
  if (dif < -0.01) return 'tendencia_bajista'
  return 'lateral'
}
