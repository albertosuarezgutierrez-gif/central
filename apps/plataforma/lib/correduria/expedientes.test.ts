import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarExpedientes } from './expedientes.ts'

const FILA = {
  id: 'o1', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', clase: 'rescate', estadoVisible: 'abierta', estado: 'en_negociacion',
  delVolcado: false, aparcadaHasta: null, aparcadaMotivo: null,
  proximaAccion: { tareaId: 't1', texto: 'Llamar', tipo: 'llamada', fecha: '2026-10-13' },
  prima: 0, fechaFinVigencia: null, notas: 'año que viene', creada: '2026-10-01T00:00:00.000Z',
  rescate: { tipo: 'recibo', recibo: { reciboId: 'r1', idRecibo: '123', importe: 41.5, efecto: '2026-10-01', suspensionDesde: '2026-10-31', hito: 'inicial', situacion: 'devuelto' } },
}

test('ok: la fila se lee; una prima 0 es «no se sabe» (null), nunca 0,00€', () => {
  const r = interpretarExpedientes(200, { estado: 'ok', hoy: '2026-10-13', expedientes: [FILA], recuento: { abierta: 1, esperando_cliente: 0, aparcada: 0 }, truncado: false, descartadas: 0 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.expedientes.length, 1)
  assert.equal(r.expedientes[0].prima, null)
  assert.equal(r.expedientes[0].rescate?.recibo?.importe, 41.5)
  assert.deepEqual(r.recuento, { abierta: 1, esperando_cliente: 0, aparcada: 0 })
})

test('una clase o estado que esta versión no conoce se CUENTA como descartada, no se pinta', () => {
  const r = interpretarExpedientes(200, { estado: 'ok', expedientes: [{ ...FILA, clase: 'otro' }, { ...FILA, estadoVisible: 'ganada' }], descartadas: 1 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.expedientes.length, 0)
  assert.equal(r.descartadas, 3)
  assert.equal(r.recuento, null, 'sin recuento del puerto no se supone 0')
})

test('no se ha podido mirar ≠ lista vacía', () => {
  assert.deepEqual(interpretarExpedientes(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.equal(interpretarExpedientes(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.equal(interpretarExpedientes(200, { estado: 'ok' }).estado, 'error')
  assert.deepEqual(interpretarExpedientes(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
})
