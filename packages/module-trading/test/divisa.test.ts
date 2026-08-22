import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFxDailyCsv, indexarFx, resolverTipoCambio, usdAEur, dentroDelRango, MAX_DIAS_ATRAS } from '../src/divisa.ts'

// Filas REALES de EUR/USD (Alpha Vantage FX_DAILY, consultado el 21/08/2026).
const CSV = `timestamp,open,high,low,close
2026-08-20,1.16770,1.17100,1.16680,1.16780
2026-08-19,1.15750,1.16790,1.15680,1.16770
2026-08-18,1.15830,1.15880,1.15650,1.15740
2026-08-17,1.15620,1.16140,1.15580,1.15790
2026-08-14,1.15260,1.15850,1.15240,1.15690`

test('parsea el CSV y descarta la cabecera', () => {
  const p = parseFxDailyCsv(CSV)
  assert.equal(p.length, 5)
  assert.deepEqual(p[0], { fecha: '2026-08-20', cierre: 1.1678 })
})

test('una fila con cambio 0 o ilegible se DESCARTA, no entra como cero', () => {
  const p = parseFxDailyCsv(`timestamp,open,high,low,close
2026-08-20,1,1,1,0
2026-08-19,1,1,1,abc
2026-08-18,1,1,1,1.15740`)
  assert.deepEqual(p.map(x => x.fecha), ['2026-08-18'])
})

test('un día que cotizó se resuelve exacto, sin retroceder', () => {
  const r = resolverTipoCambio('2026-08-17', indexarFx(parseFxDailyCsv(CSV)))
  assert.deepEqual(r, { tipoCambio: 1.1579, fechaUsada: '2026-08-17', diasAtras: 0 })
})

test('un fin de semana toma la sesión ANTERIOR, nunca la siguiente', () => {
  // 15 y 16 de agosto de 2026 son sábado y domingo: ambos caen al viernes 14.
  const idx = indexarFx(parseFxDailyCsv(CSV))
  const sabado = resolverTipoCambio('2026-08-15', idx)
  assert.equal(sabado.fechaUsada, '2026-08-14')
  assert.equal(sabado.tipoCambio, 1.1569)
  assert.equal(sabado.diasAtras, 1)
  assert.equal(resolverTipoCambio('2026-08-16', idx).fechaUsada, '2026-08-14')
})

test('mirar hacia delante sería meter información que aún no existía', () => {
  const r = resolverTipoCambio('2026-08-16', indexarFx(parseFxDailyCsv(CSV)))
  assert.notEqual(r.fechaUsada, '2026-08-17', 'el lunes todavía no había pasado')
})

test('si no hay serie suficiente devuelve null, NO el último cambio a mano', () => {
  const r = resolverTipoCambio('2020-01-15', indexarFx(parseFxDailyCsv(CSV)))
  assert.deepEqual(r, { tipoCambio: null, fechaUsada: null, diasAtras: null })
})

test('el retroceso tiene tope: más allá se rinde en vez de estirar el dato', () => {
  const idx = indexarFx([{ fecha: '2026-08-01', cierre: 1.15 }])
  assert.equal(resolverTipoCambio('2026-08-08', idx).diasAtras, MAX_DIAS_ATRAS)
  assert.equal(resolverTipoCambio('2026-08-09', idx).tipoCambio, null)
})

test('la conversión DIVIDE: la serie dice cuántos dólares vale un euro', () => {
  // Los 37.214,35 USD del 17/08 al cambio ejecutado dan los 32.105,69 EUR del libro.
  assert.equal(Math.round(usdAEur(37214.3473928, 1.15912)! * 100) / 100, 32105.69)
})

test('sin tipo de cambio la conversión es null, nunca 0', () => {
  assert.equal(usdAEur(1000, null), null)
  assert.equal(usdAEur(1000, 0), null)
  assert.notEqual(usdAEur(1000, null), 0)
})

test('el cambio que ejecutó el bróker cae dentro del rango del día', () => {
  // Contraste real: IBKR ejecutó a 1,15912 el 17/08; el día fue 1,15580-1,16140.
  assert.equal(dentroDelRango(1.15912, 1.1558, 1.1614), true)
  assert.equal(dentroDelRango(1.2500, 1.1558, 1.1614), false)
})
