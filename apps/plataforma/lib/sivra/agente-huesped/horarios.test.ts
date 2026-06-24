import { test } from 'node:test'
import assert from 'node:assert'
import { horarioPiso } from './horarios.ts'

test('Dúplex entra a las 15:00 aunque Smoobu diga 13:00', () => {
  assert.deepEqual(horarioPiso('prop_duplex_center', '13:00', '11:00'), { checkIn: '15:00', checkOut: '11:00' })
})
test('Busto Reform sí entra a las 13:00', () => {
  assert.equal(horarioPiso('prop_busto_reform', '13:00', '11:00').checkIn, '13:00')
})
test('piso desconocido cae a lo que diga Smoobu', () => {
  assert.deepEqual(horarioPiso('all', '14:00', '10:00'), { checkIn: '14:00', checkOut: '10:00' })
})
