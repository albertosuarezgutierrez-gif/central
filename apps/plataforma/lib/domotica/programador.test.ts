import { test } from 'node:test'
import assert from 'node:assert'
import { enVentana, decidirAcciones, ahoraMadrid, CONFIG_DEFAULT } from './programador.ts'

test('enVentana: [inicio, inicio+min)', () => {
  assert.equal(enVentana('15:00', '15:00', 30), true)
  assert.equal(enVentana('15:29', '15:00', 30), true)
  assert.equal(enVentana('15:30', '15:00', 30), false)
  assert.equal(enVentana('14:59', '15:00', 30), false)
  assert.equal(enVentana('11:55', '11:30', 30), true)
})

test('ahoraMadrid devuelve fecha yyyy-mm-dd y hora HH:MM', () => {
  const { fecha, hora } = ahoraMadrid(new Date('2026-07-15T13:25:00Z')) // CEST = 15:25 Madrid
  assert.equal(fecha, '2026-07-15')
  assert.equal(hora, '15:25')
})

test('ahoraMadrid en invierno (CET, UTC+1)', () => {
  const { hora } = ahoraMadrid(new Date('2026-01-15T14:25:00Z'))
  assert.equal(hora, '15:25')
})

const R = (id: string, arrival: string, departure: string) => ({ id, arrival, departure })

test('llegada hoy en ventana de encendido → encender', () => {
  const out = decidirAcciones('2026-07-15', '15:25', [R('a', '2026-07-15', '2026-07-18')], CONFIG_DEFAULT, new Set())
  assert.deepEqual(out.encender.map(r => r.id), ['a'])
  assert.deepEqual(out.apagar, [])
})

test('fuera de ventana → nada', () => {
  const out = decidirAcciones('2026-07-15', '16:00', [R('a', '2026-07-15', '2026-07-18')], CONFIG_DEFAULT, new Set())
  assert.deepEqual(out.encender, [])
})

test('idempotencia: on ya hecho (o skip_temp) no se repite', () => {
  const rs = [R('a', '2026-07-15', '2026-07-18')]
  assert.deepEqual(decidirAcciones('2026-07-15', '15:25', rs, CONFIG_DEFAULT, new Set(['on:a'])).encender, [])
  assert.deepEqual(decidirAcciones('2026-07-15', '15:25', rs, CONFIG_DEFAULT, new Set(['skip_temp:a'])).encender, [])
})

test('checkout hoy en ventana de apagado → apagar (idempotente)', () => {
  const rs = [R('b', '2026-07-10', '2026-07-15')]
  assert.deepEqual(decidirAcciones('2026-07-15', '11:55', rs, CONFIG_DEFAULT, new Set()).apagar.map(r => r.id), ['b'])
  assert.deepEqual(decidirAcciones('2026-07-15', '11:55', rs, CONFIG_DEFAULT, new Set(['off:b'])).apagar, [])
})

test('caso borde: sale una reserva y entra otra el MISMO día → ambas acciones, claves distintas', () => {
  const rs = [R('sale', '2026-07-10', '2026-07-15'), R('entra', '2026-07-15', '2026-07-20')]
  const manana = decidirAcciones('2026-07-15', '11:45', rs, CONFIG_DEFAULT, new Set())
  assert.deepEqual(manana.apagar.map(r => r.id), ['sale'])
  assert.deepEqual(manana.encender, [])
  const tarde = decidirAcciones('2026-07-15', '15:10', rs, CONFIG_DEFAULT, new Set(['off:sale']))
  assert.deepEqual(tarde.encender.map(r => r.id), ['entra'])
  assert.deepEqual(tarde.apagar, [])
})

test('autoOn=false desactiva el encendido pero NO la verificación de apagado', () => {
  const cfg = { ...CONFIG_DEFAULT, autoOn: false }
  const rs = [R('a', '2026-07-15', '2026-07-15')]
  assert.deepEqual(decidirAcciones('2026-07-15', '15:10', rs, cfg, new Set()).encender, [])
  assert.deepEqual(decidirAcciones('2026-07-15', '11:45', rs, cfg, new Set()).apagar.map(r => r.id), ['a'])
})
