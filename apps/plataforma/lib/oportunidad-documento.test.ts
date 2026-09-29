import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarOportunidadDocumento } from './oportunidad-documento.ts'

test('creada: dice cuándo vence y cuándo se llama', () => {
  const a = interpretarOportunidadDocumento({ estado: 'creada', clienteId: 'c1', vence: '2026-12-31', llamada: '2026-11-16', clienteNuevo: false, relacionado: false })
  assert.equal(a?.tono, 'ok')
  assert.match(a!.texto, /vence el 31\/12\/2026; llamada el 16\/11\/2026/)
  assert.equal(a?.clienteId, 'c1')
})

test('🪤 documento de otra persona: se dice que es un lead nuevo, no se calla', () => {
  const a = interpretarOportunidadDocumento({ estado: 'creada', clienteId: 'c2', vence: null, llamada: '2026-09-30', clienteNuevo: true, relacionado: true })
  assert.match(a!.texto, /lead NUEVO/)
  assert.match(a!.texto, /sin vencimiento legible/)
})

test('🪤 cada desenlace se dice distinto; sin desenlace no se pinta nada', () => {
  assert.match(interpretarOportunidadDocumento({ estado: 'ya_nuestra' })!.texto, /ya es nuestra/)
  assert.match(interpretarOportunidadDocumento({ estado: 'no_es_seguro' })!.texto, /no abre oportunidad/)
  assert.equal(interpretarOportunidadDocumento({ estado: 'error', motivo: 'x' })!.tono, 'aviso')
  assert.equal(interpretarOportunidadDocumento(null), null)
  assert.equal(interpretarOportunidadDocumento({ estado: 'raro' }), null)
})

test('🪤 «actualizada» solo dice que completó algo si de verdad lo hizo', () => {
  assert.match(interpretarOportunidadDocumento({ estado: 'actualizada', clienteId: 'c1', vence: null, llamada: '2026-09-30', completada: true })!.texto, /completado/)
  assert.doesNotMatch(interpretarOportunidadDocumento({ estado: 'actualizada', clienteId: 'c1', vence: null, llamada: '2026-09-30', completada: false })!.texto, /completado/)
})
