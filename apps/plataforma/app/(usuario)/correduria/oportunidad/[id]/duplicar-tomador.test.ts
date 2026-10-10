import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDuplicarConOtroTomador } from './duplicar-tomador.ts'

const ANA = { clienteId: 'a-1', nombre: 'Ana' }
const RAFAEL = { clienteId: 'r-1', nombre: 'Rafael' }
const AUTO = ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'] as const
const f = (rol: (typeof AUTO)[number], p: { clienteId: string; nombre: string }, porDefecto = false) => ({ rol, ...p, porDefecto })

test('🪤 P1 → P2 del Mercedes: tomador Rafael, Ana sigue conduciendo y Rafael sigue de propietario', () => {
  // P1: Ana tomadora (y conductora por defecto), Rafael propietario. La oportunidad es de Rafael.
  const plan = planDuplicarConOtroTomador({ roles: AUTO, figuras: [f('tomador', ANA), f('propietario', RAFAEL)], clienteOportunidad: RAFAEL })
  assert.ok(plan.ok)
  assert.deepEqual(plan.nuevoTomador, RAFAEL)
  // El conductor que era «el mismo que el tomador» se escribe con la ficha de Ana ANTES de mover el tomador.
  assert.deepEqual(plan.asignaciones, [{ rol: 'conductor_habitual', clienteId: 'a-1' }, { rol: 'tomador', clienteId: 'r-1' }])
  assert.equal(plan.resultado, 'Tomador: Rafael · Conductor: Ana · Propietario: Rafael')
})

test('P2 → P1: vuelve a Ana de tomadora; propietario y conductor no cambian', () => {
  const plan = planDuplicarConOtroTomador({
    roles: AUTO, figuras: [f('tomador', RAFAEL, true), f('conductor_habitual', ANA)], clienteOportunidad: RAFAEL,
  })
  assert.ok(plan.ok)
  assert.deepEqual(plan.nuevoTomador, ANA)
  assert.deepEqual(plan.asignaciones, [{ rol: 'propietario', clienteId: 'r-1' }, { rol: 'tomador', clienteId: 'a-1' }])
  assert.equal(plan.resultado, 'Tomador: Ana · Conductor: Ana · Propietario: Rafael')
})

test('con una sola persona en el riesgo no se inventa otra', () => {
  const plan = planDuplicarConOtroTomador({ roles: AUTO, figuras: [f('tomador', RAFAEL, true)], clienteOportunidad: RAFAEL })
  assert.equal(plan.ok, false)
})

test('dos fichas con el mismo nombre son dos personas (identidad por clienteId)', () => {
  const otraAna = { clienteId: 'a-2', nombre: 'Ana' }
  const plan = planDuplicarConOtroTomador({ roles: AUTO, figuras: [f('tomador', ANA), f('propietario', otraAna)], clienteOportunidad: ANA })
  assert.ok(plan.ok)
  assert.equal(plan.nuevoTomador.clienteId, 'a-2')
})

test('un ramo sin conductor no se duplica así', () => {
  const plan = planDuplicarConOtroTomador({ roles: ['tomador'], figuras: [f('tomador', ANA)], clienteOportunidad: ANA })
  assert.equal(plan.ok, false)
})
