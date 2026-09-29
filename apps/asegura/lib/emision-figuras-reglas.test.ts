import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cambiosDePeticion, confirmacionesExigidas, conductorHabitualDe, faltanConfirmaciones } from './emision-figuras-reglas.ts'

// Personas y matrículas inventadas: aquí no entra ningún cliente real.
const P = (dni: string, name: string) => ({ identificationDocument: { id: dni }, name, surname: 'Prueba' })
const HIJO = P('00000000T', 'Hijo')
const PADRE = P('11111111H', 'Padre')
const pet = (o: { holder?: unknown; owner?: unknown; driver?: unknown; ocasional?: unknown; cp?: string; plate?: string }) => ({
  holder: o.holder ?? HIJO,
  risk: {
    registrationPlate: o.plate ?? '0000XXX',
    owner: o.owner ?? o.holder ?? HIJO,
    primaryDriver: o.driver ?? o.holder ?? HIJO,
    ...(o.ocasional ? { secondaryDriver: o.ocasional } : {}),
    circulationAddress: { postalCode: o.cp ?? '41003' },
  },
})

test('mismas personas y mismo CP: nada que confirmar', () => {
  assert.deepEqual(cambiosDePeticion(pet({}), pet({})), [])
  assert.deepEqual(confirmacionesExigidas([]), [])
})

test('🪤 el conductor TECLEADO a mano cuenta: se compara el DNI que viajó, no la foto de figuras', () => {
  const c = cambiosDePeticion(pet({ driver: PADRE }), pet({ driver: HIJO }))
  assert.deepEqual(c, [{ campo: 'conductor_habitual', antes: 'Padre Prueba', despues: 'Hijo Prueba' }])
  assert.deepEqual(confirmacionesExigidas(c), ['conductor', 'cliente'])
})

test('otro tomador y otro CP: se piden conductor, CP y cliente', () => {
  const c = cambiosDePeticion(pet({}), pet({ holder: PADRE, cp: '11520' }))
  assert.deepEqual(c.map((x) => x.campo).sort(), ['conductor_habitual', 'cp', 'propietario', 'tomador'])
  assert.deepEqual(confirmacionesExigidas(c), ['conductor', 'cp', 'cliente'])
})

test('quitar el conductor ocasional también es un cambio', () => {
  const c = cambiosDePeticion(pet({ ocasional: PADRE }), pet({}))
  assert.deepEqual(c, [{ campo: 'conductor_ocasional', antes: 'Padre Prueba', despues: null }])
})

test('🪤 otro VEHÍCULO no se compara (la oportunidad agrupa el ramo del cliente)', () => {
  assert.deepEqual(cambiosDePeticion(pet({ plate: '1111AAA' }), pet({ plate: '2222BBB', holder: PADRE, cp: '11520' })), [])
})

test('sin matrícula (hogar) o sin DNI legible no se afirma ningún cambio', () => {
  const sinPlaca = { holder: HIJO, risk: { owner: HIJO } }
  assert.deepEqual(cambiosDePeticion(sinPlaca, { holder: PADRE, risk: { owner: PADRE } }), [])
  assert.deepEqual(cambiosDePeticion(pet({ driver: { name: 'Sin DNI' } }), pet({ driver: PADRE })), [])
})

test('el conductor habitual de la variante se da SIEMPRE, cambie o no (texto de la casilla)', () => {
  assert.equal(conductorHabitualDe(pet({ holder: PADRE, driver: HIJO })), 'Hijo Prueba')
})

test('las confirmaciones solo cuentan como array de textos exactos', () => {
  assert.deepEqual(faltanConfirmaciones(['conductor', 'cliente'], ['conductor', 'cliente']), [])
  assert.deepEqual(faltanConfirmaciones(['conductor', 'cliente'], ['conductor']), ['cliente'])
  assert.deepEqual(faltanConfirmaciones(['cliente'], true), ['cliente'])
})
