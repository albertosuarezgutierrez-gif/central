import test from 'node:test'
import assert from 'node:assert/strict'
import { aniosDelCuerpo, aplicarTopesHistorial, topesDelMensaje } from './historial-maximo.ts'

const cuerpo = (previa: Record<string, unknown>) => ({ insuranceLine: { id: 'Car' }, risk: { registrationPlate: '1234ABC', previousInsurance: { policyNumber: 'X', ...previa } } })
const diez = { totalYearsInsured: 10, yearsInPreviousCompany: 10, yearsWithoutAccidents: 10 }

test('lee el tope literal del mensaje, por campo y por línea', () => {
  const m = 'The total years insured of the previous insurance must be less than or equal to 8.\nThe years without accidents must be between 0 and 6.'
  assert.deepEqual(topesDelMensaje(m, diez), { totalYearsInsured: 8, yearsWithoutAccidents: 6 })
  assert.deepEqual(topesDelMensaje('totalYearsInsured: maximum value is 9', diez), { totalYearsInsured: 9 })
})

test('sin número baja un peldaño desde lo enviado; lo que no es de años no se toca', () => {
  assert.deepEqual(topesDelMensaje('The years without claims value is not valid.', diez), { yearsWithoutAccidents: 8 })
  assert.deepEqual(topesDelMensaje('The road name of the address of the holder is mandatory.', diez), {})
  assert.deepEqual(topesDelMensaje('totalYearsInsured must be less than or equal to 0', diez), {}, '«máximo 0» declararía novel: no se aprende')
})

test('recorta el cuerpo sin tocar el original y mantiene la coherencia', () => {
  const c = cuerpo(diez)
  const r = aplicarTopesHistorial(c, { totalYearsInsured: 8 })
  assert.deepEqual(aniosDelCuerpo(r.cuerpo), { totalYearsInsured: 8, yearsInPreviousCompany: 8, yearsWithoutAccidents: 8 })
  assert.equal(aniosDelCuerpo(c).totalYearsInsured, 10, 'el original no se toca')
  assert.equal(r.cambios.length, 3)
})

test('un recorte que deja menos de 5 limpios distinto de asegurado lo iguala (sigue siendo «ninguno»)', () => {
  const r = aplicarTopesHistorial(cuerpo({ totalYearsInsured: 6, yearsInPreviousCompany: 6, yearsWithoutAccidents: 6 }), { yearsWithoutAccidents: 4 })
  assert.equal(aniosDelCuerpo(r.cuerpo).yearsWithoutAccidents, 6)
})

test('sin seguro anterior o sin topes, el cuerpo sale igual', () => {
  const sin = { insuranceLine: { id: 'Car' }, risk: {} }
  assert.equal(aplicarTopesHistorial(sin, { totalYearsInsured: 5 }).cuerpo, sin)
  const c = cuerpo(diez)
  assert.equal(aplicarTopesHistorial(c, {}).cuerpo, c)
})
