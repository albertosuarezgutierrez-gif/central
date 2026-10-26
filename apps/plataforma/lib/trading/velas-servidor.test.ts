import { describe, it, expect } from 'vitest'
import { parseVelasYahoo } from './velas-servidor'

const DIA = 86_400
const T0 = Date.UTC(2026, 0, 5) / 1000
function chart(n: number, mut?: (q: Record<string, Array<number | null>>, ts: number[]) => void) {
  const ts = Array.from({ length: n }, (_, i) => T0 + i * DIA)
  const q: Record<string, Array<number | null>> = {
    open: ts.map((_, i) => 10 + i), high: ts.map((_, i) => 11 + i), low: ts.map((_, i) => 9 + i),
    close: ts.map((_, i) => 10.5 + i), volume: ts.map(() => 1000),
  }
  mut?.(q, ts)
  return { chart: { result: [{ timestamp: ts, indicators: { quote: [q] } }] } }
}
const iso = (i: number) => new Date((T0 + i * DIA) * 1000).toISOString().slice(0, 10)

describe('parseVelasYahoo', () => {
  it('parsea, ordena ascendente y recorta a las últimas n', () => {
    const v = parseVelasYahoo(chart(150), '2030-01-01', 120)!
    expect(v).toHaveLength(120)
    expect(v[119]).toEqual({ fecha: iso(149), apertura: 159, alto: 160, bajo: 158, cierre: 159.5, volumen: 1000 })
    expect(v[0].fecha < v[1].fecha).toBe(true)
  })
  it('descarta velas con nulls', () => {
    const v = parseVelasYahoo(chart(80, q => { q.close[10] = null; q.open[11] = null }), '2030-01-01')!
    expect(v).toHaveLength(78)
  })
  it('descarta velas posteriores a la fecha (la de hoy parcial)', () => {
    const v = parseVelasYahoo(chart(80), iso(70))!
    expect(v[v.length - 1].fecha).toBe(iso(70))
  })
  it('null (nunca []) con menos de 60 velas o respuesta vacía/rota', () => {
    expect(parseVelasYahoo(chart(59), '2030-01-01')).toBeNull()
    expect(parseVelasYahoo({ chart: { result: null } }, '2030-01-01')).toBeNull()
    expect(parseVelasYahoo(null, '2030-01-01')).toBeNull()
  })
})
