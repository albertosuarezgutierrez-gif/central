// Estadísticas de los bots del tarificador (15/10/2026): lectura del puerto y textos. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarEstadisticas, textoDuracion, textoPorcentaje } from './tarificador-estadisticas-asegura.ts'

const ventana = { total: 10, ok: 6, atascado: 1, requiereHumano: 1, errorDefinitivo: 2, pctOk: 60, pctProblema: 40, tiempoMedioSeg: 95, topAtascos: [{ clave: 'iban', n: 3 }] }

test('lectura: filas válidas, versión null, ventana ausente y fila rara contada', () => {
  const r = interpretarEstadisticas(200, { estado: 'ok', generadoEn: '2026-10-15T10:00:00Z', atascosDisponibles: true, filas: [
    { compania: 'allianz', ramo: 'comunidades', botVersion: null, d7: null, d30: ventana },
    { ramo: 'auto' },
  ] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas.length, 1)
  assert.equal(r.ilegibles, 1)
  assert.equal(r.filas[0]!.botVersion, null)
  assert.equal(r.filas[0]!.d7, null)
  assert.equal(r.filas[0]!.d30!.topAtascos[0]!.clave, 'iban')
})

test('null sigue siendo null (sin datos), no 0', () => {
  const r = interpretarEstadisticas(200, { estado: 'ok', filas: [{ compania: 'a', ramo: 'b', d30: { ...ventana, pctOk: null, tiempoMedioSeg: null } }] })
  if (r.estado !== 'ok') throw new Error('ok')
  assert.equal(r.filas[0]!.d30!.pctOk, null)
  assert.equal(r.filas[0]!.d30!.tiempoMedioSeg, null)
})

test('un fallo del puerto no es «no hay trabajos»', () => {
  assert.deepEqual(interpretarEstadisticas(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.equal(interpretarEstadisticas(503, { estado: 'error', causa: 'x' }).estado, 'error')
  assert.equal(interpretarEstadisticas(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarEstadisticas(404, null).estado, 'error')
  assert.equal(interpretarEstadisticas(401, null).estado, 'error')
})

test('textos legibles', () => {
  assert.equal(textoPorcentaje(null), 'sin datos')
  assert.equal(textoPorcentaje(0), '0 %')
  assert.equal(textoPorcentaje(62.5), '62,5 %')
  assert.equal(textoDuracion(null), 'sin datos')
  assert.equal(textoDuracion(45), '45 s')
  assert.equal(textoDuracion(95), '1 min 35 s')
  assert.equal(textoDuracion(120), '2 min')
  assert.equal(textoDuracion(7500), '2 h 5 min')
})
