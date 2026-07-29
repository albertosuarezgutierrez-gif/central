import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sma, ema, rsi, macd, atr, adx, indicadoresDe, regimenDe } from '../src/indicadores.ts'
import type { Vela } from '../src/types.ts'

test('sma promedia las últimas n muestras', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3)
  assert.equal(sma([2, 4], 5), null)            // insuficientes → null
})

test('ema pondera lo reciente y arranca del sma', () => {
  const e = ema([1, 2, 3, 4, 5, 6, 7, 8], 3)
  assert.ok(e !== null && e > 6 && e < 8)
})

test('rsi de una serie estrictamente creciente tiende a 100', () => {
  const r = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14)
  assert.ok(r !== null && r > 99)
})

test('atr es positivo con rango real', () => {
  const velas: Vela[] = Array.from({ length: 20 }, (_, i) => ({
    fecha: `2026-01-${String(i + 1).padStart(2, '0')}`,
    apertura: 10, alto: 12, bajo: 9, cierre: 11, volumen: 100,
  }))
  const a = atr(velas, 14)
  assert.ok(a !== null && a > 0)
})

test('adx es alto en tendencia fuerte y bajo en lateral, null si faltan velas', () => {
  // Tendencia limpia al alza: +DM domina → ADX alto.
  const tendencia: Vela[] = Array.from({ length: 40 }, (_, i) => ({
    fecha: `d${i}`, apertura: 100 + i, alto: 101 + i, bajo: 99.5 + i, cierre: 100.8 + i, volumen: 1,
  }))
  const aTend = adx(tendencia, 14)
  assert.ok(aTend !== null && aTend > 25)
  // Sierra lateral: +DM y −DM se compensan → ADX bajo.
  const lateral: Vela[] = Array.from({ length: 40 }, (_, i) => {
    const base = 100 + (i % 2 === 0 ? 0 : 1)
    return { fecha: `d${i}`, apertura: base, alto: base + 0.5, bajo: base - 0.5, cierre: base, volumen: 1 }
  })
  const aLat = adx(lateral, 14)
  assert.ok(aLat !== null && aLat < aTend)
  assert.equal(adx(tendencia.slice(0, 10), 14), null)   // pocas velas → null
})

test('indicadoresDe devuelve todos los campos', () => {
  const cierres = Array.from({ length: 60 }, (_, i) => 100 + i)
  const velas: Vela[] = cierres.map((c, i) => ({
    fecha: `d${i}`, apertura: c, alto: c + 1, bajo: c - 1, cierre: c, volumen: 1,
  }))
  const ind = indicadoresDe(velas)
  assert.ok(ind.sma20 !== null && ind.rsi14 !== null && ind.macd !== null && ind.atr14 !== null)
})

test('regimenDe detecta tendencia alcista con sma20>sma50', () => {
  assert.equal(regimenDe({ sma20: 110, sma50: 100 } as any), 'tendencia_alcista')
  assert.equal(regimenDe({ sma20: 90, sma50: 100 } as any), 'tendencia_bajista')
  assert.equal(regimenDe({ sma20: 100.2, sma50: 100 } as any), 'lateral')  // <1% dif
})
