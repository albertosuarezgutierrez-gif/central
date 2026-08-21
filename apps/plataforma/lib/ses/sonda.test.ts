import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarSondaSes } from './sonda.ts'
import type { RespuestaSes } from '@central/module-ses'

const r = (p: Partial<RespuestaSes>): RespuestaSes => ({
  ok: false, clase: 'ok', codigo: null, descripcion: null, lotes: [], detalle: 'x', ...p,
})

test('codigo 0: verde y sin acción', () => {
  const v = evaluarSondaSes(r({ clase: 'ok', ok: true, codigo: 0 }))
  assert.equal(v.transporteOk, true)
  assert.equal(v.accion, 'ninguna')
})

test('un error de DATOS también es verde: la puerta está abierta', () => {
  // Si SES nos contesta «te falta un campo», hemos llegado, nos ha autenticado y nos ha leído.
  // Eso es exactamente lo que este latido pregunta. Ponerlo rojo sería una falsa alarma.
  const v = evaluarSondaSes(r({ clase: 'datos', codigo: 10131 }))
  assert.equal(v.transporteOk, true)
  assert.match(v.detalle, /transporte OK/)
})

test('SES caído: rojo y la acción es ESPERAR, no tocar nada', () => {
  const v = evaluarSondaSes(r({ clase: 'transporte', detalle: 'HTTP 502 del servicio de SES' }))
  assert.equal(v.transporteOk, false)
  assert.equal(v.accion, 'esperar')
  assert.match(v.detalle, /SES no responde/)
})

test('credenciales rechazadas: rojo y la acción es ir al portal', () => {
  // Es el caso que se separa del anterior a propósito: si el aviso dijera lo mismo en los dos,
  // se dejaría de leer en dos semanas.
  const v = evaluarSondaSes(r({ clase: 'configuracion', detalle: 'HTTP 401' }))
  assert.equal(v.transporteOk, false)
  assert.equal(v.accion, 'revisar_portal')
})

test('una respuesta ilegible NO se da por buena', () => {
  const v = evaluarSondaSes(r({ clase: 'desconocido', detalle: 'sin codigoRetorno legible' }))
  assert.equal(v.transporteOk, false)
  assert.match(v.detalle, /no reconocida/)
})
