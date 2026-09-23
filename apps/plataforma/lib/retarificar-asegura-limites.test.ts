import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarLimitesHogar } from './retarificar-asegura.ts'

test('ok: los dos rangos; un capital a 0 o ausente es null, nunca 0', () => {
  const r = interpretarLimitesHogar(200, {
    estado: 'ok',
    continente: { media: 98000, minimo: 80000, maximo: 120000 },
    contenido: { media: 0, minimo: null, maximo: null },
    coste: 'coste sin confirmar (…)',
    restantesHoy: 9,
  })
  assert.deepEqual(r, {
    estado: 'ok',
    continente: { media: 98000, minimo: 80000, maximo: 120000 },
    contenido: null,
    coste: 'coste sin confirmar (…)',
    restantesHoy: 9,
  })
})

test('faltan datos (422 gratis) y tope (429) tienen su propio estado', () => {
  const f = interpretarLimitesHogar(422, { error: 'faltan datos para cotizar', faltan: [{ campo: 'metrosCuadrados', motivo: 'x' }], gastado: '0,00€' })
  assert.equal(f.estado, 'faltan')
  assert.equal(interpretarLimitesHogar(429, { estado: 'tope', mensaje: 'tope', gastado: '0,00€' }).estado, 'tope')
})

test('🚨 solo `gastado: 0,00€` autoriza a decir que no ha costado', () => {
  const sinCargo = interpretarLimitesHogar(409, { error: 'esta póliza es de auto', gastado: '0,00€' })
  assert.deepEqual(sinCargo.estado === 'error' && sinCargo.gastoDesconocido, false)
  const quizá = interpretarLimitesHogar(502, { estado: 'error', mensaje: 'timeout', gastoDesconocido: true })
  assert.deepEqual(quizá.estado === 'error' && quizá.gastoDesconocido, true)
})
