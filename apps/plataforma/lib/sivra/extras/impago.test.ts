import { test } from 'node:test'
import assert from 'node:assert'
import { decidirImpago, horasEntre, HORAS_RECORDATORIO } from './impago.ts'

test('recién enviado: no se hace nada', () => {
  assert.equal(decidirImpago({ horasDesdeEnlace: 2, yaRecordado: false, horasHastaEntrada: 240 }), 'esperar')
})

test('a las 24h sin pagar se recuerda una sola vez', () => {
  assert.equal(decidirImpago({ horasDesdeEnlace: HORAS_RECORDATORIO, yaRecordado: false, horasHastaEntrada: 240 }), 'recordar')
  assert.equal(decidirImpago({ horasDesdeEnlace: 100, yaRecordado: true, horasHastaEntrada: 240 }), 'esperar')
})

test('a 48h de la entrada sin pagar, caduca y manda mirar a Alberto', () => {
  assert.equal(decidirImpago({ horasDesdeEnlace: 5, yaRecordado: false, horasHastaEntrada: 48 }), 'caducar')
  assert.equal(decidirImpago({ horasDesdeEnlace: 5, yaRecordado: true, horasHastaEntrada: 10 }), 'caducar')
})

// La regla de oro del repo aplicada a una ACCIÓN: no sabemos cuándo entra ≠ entra pronto.
test('sin fecha de entrada NUNCA se caduca un cobro vivo', () => {
  assert.equal(decidirImpago({ horasDesdeEnlace: 500, yaRecordado: true, horasHastaEntrada: null }), 'esperar')
  assert.equal(decidirImpago({ horasDesdeEnlace: 500, yaRecordado: false, horasHastaEntrada: null }), 'recordar')
})

test('horasEntre devuelve null si falta cualquiera de las dos fechas', () => {
  assert.equal(horasEntre(null, new Date()), null)
  assert.equal(horasEntre(new Date(), undefined), null)
  assert.equal(horasEntre(new Date('2026-08-28T00:00:00Z'), new Date('2026-08-29T00:00:00Z')), 24)
})
