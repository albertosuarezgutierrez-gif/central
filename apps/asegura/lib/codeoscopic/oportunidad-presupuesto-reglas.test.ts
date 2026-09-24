import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoTrasPresupuesto, fuenteDePresupuesto, ramoDeOportunidad } from './oportunidad-presupuesto-reglas.ts'

test('con un precio en la mano, «por contactar» pasa a «interesado»; lo demás se respeta', () => {
  assert.equal(estadoTrasPresupuesto('competencia'), 'en_negociacion')
  assert.equal(estadoTrasPresupuesto('en_negociacion'), 'en_negociacion')
  assert.equal(estadoTrasPresupuesto('pendiente_cliente'), 'pendiente_cliente')
})

test('el ramo del presupuesto solo vale si es un ramo de oportunidad: no se inventa', () => {
  assert.equal(ramoDeOportunidad('hogar'), 'hogar')
  assert.equal(ramoDeOportunidad('auto'), 'auto')
  assert.equal(ramoDeOportunidad('barco'), null)
  assert.equal(ramoDeOportunidad(undefined), null)
})

test('retarificar una póliza propia nace como renovación; sin póliza, venta directa', () => {
  assert.equal(fuenteDePresupuesto('00000000-0000-0000-0000-000000000001'), 'renovacion')
  assert.equal(fuenteDePresupuesto(null), 'venta_directa')
})
