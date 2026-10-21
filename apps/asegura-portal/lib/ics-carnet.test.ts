// El .ics de «Añadir a mi calendario»: pura, con `ahora` inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { icsCaducidadCarnet, nombreFicheroIcsCarnet, plegarLineaIcs } from './ics-carnet.ts'

const AHORA = new Date('2026-10-21T09:30:15.123Z')
const base = { id: 'a1b2c3d4-0000-4000-8000-000000000001', tipo: 'B', fechaCaducidad: '2030-02-28', ahora: AHORA }

test('evento de día completo con fin exclusivo (día siguiente), UID estable y sello del reloj inyectado', () => {
  const ics = icsCaducidadCarnet(base)!
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/)
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/)
  assert.match(ics, /DTSTART;VALUE=DATE:20300228\r\n/)
  assert.match(ics, /DTEND;VALUE=DATE:20300301\r\n/)
  assert.match(ics, /UID:carnet-a1b2c3d4-0000-4000-8000-000000000001@grupoasegura\.es\r\n/)
  assert.match(ics, /DTSTAMP:20261021T093015Z\r\n/)
  assert.match(ics, /SUMMARY:Caduca mi carné de conducir \(B\)\r\n/)
  assert.equal(icsCaducidadCarnet(base), ics, 'determinista')
})

test('fin de año y 29 de febrero: el día siguiente es real', () => {
  assert.match(icsCaducidadCarnet({ ...base, fechaCaducidad: '2030-12-31' })!, /DTEND;VALUE=DATE:20310101/)
  assert.match(icsCaducidadCarnet({ ...base, fechaCaducidad: '2028-02-29' })!, /DTEND;VALUE=DATE:20280301/)
})

test('alarmas a 90, 30 y 7 días y el texto de qué hacer; ningún dato personal', () => {
  const ics = icsCaducidadCarnet(base)!
  for (const d of [90, 30, 7]) assert.match(ics, new RegExp(`TRIGGER:-P${d}D`))
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 3)
  assert.match(ics.replace(/\r\n /g, ''), /centro de reconocimiento de conductores/)
  assert.doesNotMatch(ics, /nacimiento|DNI\b|ATTENDEE|ORGANIZER/i)
})

test('🪤 fecha inválida o id vacío → null (no se inventa un evento)', () => {
  for (const f of ['2030-02-30', '30/02/2030', '', 'x']) assert.equal(icsCaducidadCarnet({ ...base, fechaCaducidad: f }), null, f)
  assert.equal(icsCaducidadCarnet({ ...base, id: '  ' }), null)
  assert.equal(icsCaducidadCarnet({ ...base, ahora: new Date('x') }), null)
})

test('el texto se escapa y el id no puede colar saltos de línea en el UID', () => {
  const ics = icsCaducidadCarnet({ ...base, tipo: 'B;C,1', id: 'ab\r\nBEGIN:EVIL' })!
  assert.match(ics, /UID:carnet-abBEGINEVIL@/)
  assert.doesNotMatch(ics, /\r\nBEGIN:EVIL/)
  assert.match(ics, /SUMMARY:Caduca mi carné de conducir \(B\;C\\,1\)/)
})

test('ninguna línea pasa de 75 octetos y el plegado no parte un carácter', () => {
  const ics = icsCaducidadCarnet(base)!
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, l)
  const larga = 'X:' + 'é'.repeat(100)
  assert.equal(plegarLineaIcs(larga).replace(/\r\n /g, ''), larga)
})

test('nombre de fichero seguro', () => {
  assert.equal(nombreFicheroIcsCarnet('A2'), 'caducidad-carnet-A2.ics')
  assert.equal(nombreFicheroIcsCarnet('../x y'), 'caducidad-carnet-xy.ics')
  assert.equal(nombreFicheroIcsCarnet(''), 'caducidad-carnet.ics')
})
