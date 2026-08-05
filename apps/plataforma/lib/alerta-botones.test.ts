import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarBotones } from './alerta-botones.ts'

test('acepta el teclado real de una propuesta: URL https + callback trd_', () => {
  const filas = validarBotones([[
    { texto: '✅ Enviar en IBKR', url: 'https://ndcdyn.interactivebrokers.com/sso/resolver?action=X#/orders' },
    { texto: '❌ No', callback: 'trd_no:100' },
  ]])
  assert.equal(filas?.[0].length, 2)
  assert.equal(filas?.[0][1].callback, 'trd_no:100')
})

test('rechaza callbacks fuera del prefijo trd_ (un token filtrado no fabrica botones de pago)', () => {
  assert.equal(validarBotones([[{ texto: 'ok', callback: 'pago_aprobar:55' }]]), null)
  assert.equal(validarBotones([[{ texto: 'ok', callback: 'mov_confirmar_ia:1:pisos' }]]), null)
  assert.equal(validarBotones([[{ texto: 'ok', callback: 'trd_' }]]), null)
})

test('rechaza URLs no-https y payloads con url Y callback a la vez', () => {
  assert.equal(validarBotones([[{ texto: 'x', url: 'http://ibkr.com' }]]), null)
  assert.equal(validarBotones([[{ texto: 'x', url: 'https://a.com', callback: 'trd_no:1' }]]), null)
  assert.equal(validarBotones([[{ texto: 'x' }]]), null)
})

test('rechaza formas fuera de tamaño (filas/botones/texto)', () => {
  assert.equal(validarBotones([]), null)
  assert.equal(validarBotones([[]]), null)
  assert.equal(validarBotones([[{ texto: 'x'.repeat(49), callback: 'trd_no:1' }]]), null)
  const fila4 = Array.from({ length: 4 }, () => ({ texto: 'x', callback: 'trd_no:1' }))
  assert.equal(validarBotones([fila4]), null)
})

test('lo no-array o vacío devuelve null (el aviso sale sin botones, nunca rompe)', () => {
  assert.equal(validarBotones(undefined), null)
  assert.equal(validarBotones('botones'), null)
  assert.equal(validarBotones({ texto: 'x' }), null)
})
