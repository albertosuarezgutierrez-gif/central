import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { interpretarCalidad } from './correduria-puerto.ts'

test('calidad: respuesta ok con incidencias válidas', () => {
  const json = {
    estado: 'ok',
    filas: [
      {
        regla: 'sin_prima',
        clienteId: 'c1',
        cliente: 'Juan Perez',
        polizaId: 'p1',
        numeroPoliza: '12345',
        compania: 'Reale',
        dato: null,
        relacionadoId: null,
      },
      {
        regla: 'vencida_sin_renovar',
        clienteId: 'c2',
        cliente: 'Maria Lopez',
        polizaId: 'p2',
        numeroPoliza: '67890',
        compania: 'Generali',
        dato: '2026-09-15',
        relacionadoId: null,
      },
    ],
    truncado: false,
  }
  const result = interpretarCalidad(200, json)
  assert.equal(result.estado, 'ok')
  assert.equal(result.incidencias.length, 2)
  assert.equal(result.incidencias[0].regla, 'sin_prima')
  assert.equal(result.incidencias[1].dato, '2026-09-15')
  assert.equal(result.truncado, false)
})

test('calidad: fila con regla desconocida invalida toda la respuesta', () => {
  const json = {
    estado: 'ok',
    filas: [
      {
        regla: 'desconocida_inventada',
        clienteId: 'c1',
        cliente: 'Juan',
        polizaId: null,
        numeroPoliza: null,
        compania: null,
        dato: null,
        relacionadoId: null,
      },
    ],
    truncado: false,
  }
  const result = interpretarCalidad(200, json)
  // Una fila con regla inválida (null tras cadena()) invalida la respuesta
  assert.equal(result.estado, 'error')
  assert.equal(result.motivo, 'respuesta_ilegible')
})

test('calidad: JSON roto o status 500', () => {
  const r1 = interpretarCalidad(500, {})
  assert.equal(r1.estado, 'error')
  if (r1.estado === 'error') {
    assert.equal(r1.motivo, 'respuesta_ilegible')
  }
  const r2 = interpretarCalidad(200, 'no es objeto')
  assert.equal(r2.estado, 'error')
  const r3 = interpretarCalidad(200, null)
  assert.equal(r3.estado, 'error')
})

test('calidad: sin_configurar', () => {
  const json = { estado: 'sin_configurar' }
  const result = interpretarCalidad(200, json)
  assert.equal(result.estado, 'sin_configurar')
})
