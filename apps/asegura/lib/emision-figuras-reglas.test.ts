import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cambiosDeFiguras, confirmacionesExigidas, faltanConfirmaciones, papelesDe } from './emision-figuras-reglas.ts'

// Ids inventados: aquí no entra ningún cliente real.
const HIJO = '00000000-0000-4000-8000-000000000001'
const PADRE = '00000000-0000-4000-8000-000000000002'
const pet = (cp: string) => ({ risk: { circulationAddress: { postalCode: cp } } })

test('sin foto de figuras (variante vieja), el tomador ocupa todos los papeles', () => {
  assert.deepEqual(papelesDe({ figuras: null, clienteId: HIJO, peticion: null }), { tomador: HIJO, propietario: HIJO, conductor_habitual: HIJO })
})

test('mismas personas y mismo CP: nada que confirmar', () => {
  const v = { figuras: { tomador: HIJO }, clienteId: HIJO, peticion: pet('41003') }
  assert.deepEqual(cambiosDeFiguras(v, v), [])
  assert.deepEqual(confirmacionesExigidas([]), [])
})

test('otro tomador y otro CP: se piden conductor, CP y cliente', () => {
  const p1 = { figuras: { tomador: HIJO }, clienteId: HIJO, peticion: pet('41003') }
  const p3 = { figuras: { tomador: PADRE }, clienteId: PADRE, peticion: pet('11520') }
  const c = cambiosDeFiguras(p1, p3)
  assert.deepEqual(c.map((x) => x.campo).sort(), ['conductor_habitual', 'cp', 'propietario', 'tomador'])
  assert.deepEqual(confirmacionesExigidas(c), ['conductor', 'cp', 'cliente'])
})

test('solo cambia el CP: se piden CP y cliente, no el conductor', () => {
  const a = { figuras: { tomador: HIJO }, clienteId: HIJO, peticion: pet('41003') }
  const b = { figuras: { tomador: HIJO }, clienteId: HIJO, peticion: pet('11520') }
  assert.deepEqual(confirmacionesExigidas(cambiosDeFiguras(a, b)), ['cp', 'cliente'])
})

test('un CP que no consta en un lado NO cuenta como cambio', () => {
  const a = { figuras: { tomador: HIJO }, clienteId: HIJO, peticion: null }
  const b = { figuras: { tomador: HIJO }, clienteId: HIJO, peticion: pet('11520') }
  assert.deepEqual(cambiosDeFiguras(a, b), [])
})

test('las confirmaciones solo cuentan como array de textos exactos', () => {
  assert.deepEqual(faltanConfirmaciones(['conductor', 'cliente'], ['conductor', 'cliente']), [])
  assert.deepEqual(faltanConfirmaciones(['conductor', 'cliente'], ['conductor']), ['cliente'])
  assert.deepEqual(faltanConfirmaciones(['cliente'], true), ['cliente'])
  assert.deepEqual(faltanConfirmaciones(['cliente'], 'cliente'), ['cliente'])
})
