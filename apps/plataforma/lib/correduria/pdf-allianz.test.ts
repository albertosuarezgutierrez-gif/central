import test from 'node:test'
import assert from 'node:assert/strict'
import { decodificarEbcdic, importeEs, periodoDeExtracto, leerExtracto } from './pdf-allianz.ts'

test('el texto del PDF de Allianz va en EBCDIC, no en latin1', () => {
  // Bytes reales del content stream del extracto de julio/2026.
  assert.equal(decodificarEbcdic('ÃÖÂÙÖâ@ÄÅÓ@ÔÅâ'), 'COBROS DEL MES')
  assert.equal(decodificarEbcdic('ÙÅãÅÕÃÉÖÕ'), 'RETENCION')
  assert.equal(decodificarEbcdic('âÁÓÄÖ@ãÖãÁÓ'), 'SALDO TOTAL')
  assert.equal(decodificarEbcdic('õõøkøø'), '558,88')
  assert.equal(decodificarEbcdic('ôñððó@@âÅåÉÓÓÁ'), '41003  SEVILLA')
})

test('los importes vienen en formato español dentro del PDF', () => {
  assert.equal(importeEs('558,88'), 558.88)
  assert.equal(importeEs('2.162,49'), 2162.49)
  assert.equal(importeEs('-346,20'), -346.2)
  assert.equal(importeEs('0,00'), 0)
})

test('un importe ilegible es null, NUNCA 0', () => {
  // Un 0 aquí diría «la compañía te liquidó cero euros», que es una afirmación
  // distinta de «no se ha podido leer».
  assert.equal(importeEs(''), null)
  assert.equal(importeEs('n/d'), null)
  assert.equal(importeEs('SALDO TOTAL'), null)
})

test('el periodo se lee del CUERPO, no del asunto del correo', () => {
  assert.deepEqual(periodoDeExtracto('Conceptos del periodo  01-07-2026 al 31-07-2026'), {
    inicio: '2026-07-01',
    fin: '2026-07-31',
  })
  // El asunto de Allianz miente: este correo se envió en agosto de 2026.
  assert.equal(periodoDeExtracto('Cartera No Vida del mes de Noviembre de 2026'), null)
})

test('lee el extracto real de julio/2026: saldo y la línea del recibo', () => {
  // Secuencia tal y como sale del content stream, ya decodificada.
  const lineas = [
    'Conceptos del periodo  01-07-2026 al 31-07-2026',
    'SALDO MES ANTERIOR',
    '558,88',
    'COBROS DEL MES',
    'SALDO TOTAL',
    '558,88',
    'ALLIANZ MOTO V.03',
    '29,52',
    '4,43',
    '249,34',
  ]
  const e = leerExtracto(lineas)
  assert.deepEqual(e.periodo, { inicio: '2026-07-01', fin: '2026-07-31' })
  assert.equal(e.saldoTotal, 558.88)
  assert.equal(e.recibos.length, 1)
  assert.equal(e.recibos[0].ramo, 'ALLIANZ MOTO V.03')
  assert.equal(e.recibos[0].comision, 29.52)
  assert.equal(e.recibos[0].irpf, 4.43)
  assert.equal(e.recibos[0].recibo, 249.34)
})

test('la retención del extracto es el 15 % de la comisión, como en CIMA', () => {
  // 4,43 / 29,52 = 15,01 %. Es el mismo recibo que en la BD de la correduría
  // figura con comision_bruta 29,52 y comision_liquida 25,09 (= 29,52 − 4,43):
  // dos fuentes independientes coincidiendo al céntimo.
  const pct = (4.43 / 29.52) * 100
  assert.ok(pct > 14.9 && pct < 15.1, `esperaba ~15 %, salió ${pct.toFixed(2)} %`)
  assert.equal(Math.round((29.52 - 4.43) * 100) / 100, 25.09)
})

test('una fila de totales no se cuenta como un recibo más', () => {
  const e = leerExtracto(['TOTALES', 'Total', '29,52', '4,43', '249,34'])
  assert.equal(e.recibos.length, 0)
})

test('sin periodo en el cuerpo, el periodo es null y no se inventa', () => {
  const e = leerExtracto(['Cuenta Agente', 'SALDO TOTAL', '100,00'])
  assert.equal(e.periodo, null)
  assert.equal(e.saldoTotal, 100)
})
