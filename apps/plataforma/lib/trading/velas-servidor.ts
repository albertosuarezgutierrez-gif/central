import type { Vela } from '@central/module-trading'
import { urlYahoo } from './precios-stooq'
import { sumarDias } from './backtest-puro'

// Velas diarias traídas POR EL SERVIDOR (Yahoo chart v8, la misma URL que ya usa el contraste de
// precios) para cuando `/api/trading/analizar` recibe un símbolo sin `velas`. Motivo: volcar a mano
// ~25 series de ~120 velas de IBKR en el payload las desalinea (landmine del 04/08/2026).
// Contrato: devuelve `null` —nunca `[]`— si la fuente falla o hay pocas velas: «no se sabe» no es «sin datos».

export const MIN_VELAS = 60
const UA = 'Mozilla/5.0 (compatible; central-trading/1.0)'

type Quote = { open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }

const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0

// Parte PURA: JSON del chart de Yahoo → velas ascendentes, sin nulls, sin velas posteriores a `fecha`
// (la de hoy puede ser parcial), recortadas a las últimas `n`. `null` si quedan < MIN_VELAS.
export function parseVelasYahoo(json: unknown, fecha: string, n = 120): Vela[] | null {
  const res = (json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Quote[] } }> } })?.chart?.result?.[0]
  const ts = res?.timestamp ?? []
  const q = res?.indicators?.quote?.[0]
  if (!q || ts.length === 0) return null
  const velas: Vela[] = []
  for (let i = 0; i < ts.length; i++) {
    const [a, h, b, c, v] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i]]
    if (typeof ts[i] !== 'number' || !ok(a) || !ok(h) || !ok(b) || !ok(c) || typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue
    const f = new Date(ts[i] * 1000).toISOString().slice(0, 10)
    if (f > fecha) continue
    velas.push({ fecha: f, apertura: a, alto: h, bajo: b, cierre: c, volumen: v })
  }
  velas.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0))
  // Duplicados de fecha (Yahoo repite a veces la sesión en curso): se queda la última.
  const unicas = velas.filter((v, i) => i === velas.length - 1 || velas[i + 1].fecha !== v.fecha)
  return unicas.length >= MIN_VELAS ? unicas.slice(-n) : null
}

export async function velasDiariasServidor(simbolo: string, fecha: string, n = 120, timeoutMs = 10_000): Promise<Vela[] | null> {
  try {
    const desde = sumarDias(fecha, -Math.ceil(n * 1.6) - 10)   // ~120 sesiones ≈ 170 días naturales
    const res = await fetch(urlYahoo(simbolo, desde, sumarDias(fecha, 2)), {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return parseVelasYahoo(await res.json(), fecha, n)
  } catch {
    return null
  }
}
