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

// ADX (Average Directional Index, método de Wilder): mide la FUERZA de la tendencia (no la
// dirección). ≥25 = tendencia fuerte (no fadear); <20 = lateral (terreno de reversión). Necesita
// ~2n+1 velas (n para suavizar los DI + n para promediar el DX); si no, degrada a null.
export function adx(velas: Vela[], n = 14): number | null {
  if (velas.length < 2 * n + 1) return null
  const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = []
  for (let i = 1; i < velas.length; i++) {
    const up = velas[i].alto - velas[i - 1].alto
    const down = velas[i - 1].bajo - velas[i].bajo
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
    const v = velas[i], prev = velas[i - 1]
    tr.push(Math.max(v.alto - v.bajo, Math.abs(v.alto - prev.cierre), Math.abs(v.bajo - prev.cierre)))
  }
  // Suavizado de Wilder: primer valor = suma de las primeras n; luego resta la media y suma el nuevo.
  const wilder = (arr: number[]): number[] => {
    if (arr.length < n) return []
    const out: number[] = []
    let s = arr.slice(0, n).reduce((a, b) => a + b, 0)
    out.push(s)
    for (let i = n; i < arr.length; i++) { s = s - s / n + arr[i]; out.push(s) }
    return out
  }
  const trS = wilder(tr), pS = wilder(plusDM), mS = wilder(minusDM)
  const dx: number[] = []
  for (let i = 0; i < trS.length; i++) {
    if (trS[i] === 0) { dx.push(0); continue }
    const pdi = 100 * pS[i] / trS[i], mdi = 100 * mS[i] / trS[i]
    const suma = pdi + mdi
    dx.push(suma === 0 ? 0 : 100 * Math.abs(pdi - mdi) / suma)
  }
  if (dx.length < n) return null
  let a = dx.slice(0, n).reduce((x, y) => x + y, 0) / n
  for (let i = n; i < dx.length; i++) a = (a * (n - 1) + dx[i]) / n
  return a
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
    adx14: adx(velas, 14),
  }
}

export function regimenDe(ind: Indicadores): Regimen {
  if (ind.sma20 === null || ind.sma50 === null) return 'lateral'
  const dif = (ind.sma20 - ind.sma50) / ind.sma50
  if (dif > 0.01) return 'tendencia_alcista'
  if (dif < -0.01) return 'tendencia_bajista'
  return 'lateral'
}
