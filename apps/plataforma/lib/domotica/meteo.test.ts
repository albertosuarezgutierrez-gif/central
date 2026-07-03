import { test } from 'node:test'
import assert from 'node:assert'
import { extraerTemperatura } from './meteo.ts'

test('extraerTemperatura lee current.temperature_2m', () => {
  assert.equal(extraerTemperatura({ current: { temperature_2m: 34.6 } }), 34.6)
  assert.equal(extraerTemperatura({ current: { temperature_2m: 0 } }), 0)
})

test('extraerTemperatura devuelve null con respuestas rotas', () => {
  assert.equal(extraerTemperatura(null), null)
  assert.equal(extraerTemperatura({}), null)
  assert.equal(extraerTemperatura({ current: { temperature_2m: 'NaN' } }), null)
})
