import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fechaMadrid, inicioDiaMadrid } from './dia-madrid.ts'

const iso = (d: Date) => d.toISOString()

test('verano (UTC+2): el día empieza a las 22:00Z del día anterior', () => {
  assert.equal(iso(inicioDiaMadrid(new Date('2026-07-15T12:00:00Z'))), '2026-07-14T22:00:00.000Z')
})

test('invierno (UTC+1): el día empieza a las 23:00Z del día anterior', () => {
  assert.equal(iso(inicioDiaMadrid(new Date('2026-01-15T12:00:00Z'))), '2026-01-14T23:00:00.000Z')
})

test('23:30Z en verano ya es el día SIGUIENTE en Madrid (a las 01:30): con UTC no se reiniciaría el tope', () => {
  const ahora = new Date('2026-07-15T23:30:00Z')
  assert.equal(fechaMadrid(ahora), '2026-07-16')
  assert.equal(iso(inicioDiaMadrid(ahora)), '2026-07-15T22:00:00.000Z')
  // Una factura subida a las 21:59Z (23:59 de Madrid, día 15) NO cuenta en el día 16.
  assert.ok(new Date('2026-07-15T21:59:00Z') < inicioDiaMadrid(ahora))
})

test('22:00:00Z exacto en verano ya es el día nuevo; 21:59:59Z sigue siendo el anterior', () => {
  assert.equal(iso(inicioDiaMadrid(new Date('2026-07-15T22:00:00Z'))), '2026-07-15T22:00:00.000Z')
  assert.equal(iso(inicioDiaMadrid(new Date('2026-07-15T21:59:59Z'))), '2026-07-14T22:00:00.000Z')
})

test('cambios de hora: el día del cambio (29/03 y 25/10/2026) empieza a medianoche local', () => {
  assert.equal(iso(inicioDiaMadrid(new Date('2026-03-29T12:00:00Z'))), '2026-03-28T23:00:00.000Z') // aún UTC+1 a las 00:00
  assert.equal(iso(inicioDiaMadrid(new Date('2026-10-25T12:00:00Z'))), '2026-10-24T22:00:00.000Z') // aún UTC+2 a las 00:00
  assert.equal(iso(inicioDiaMadrid(new Date('2026-10-26T12:00:00Z'))), '2026-10-25T23:00:00.000Z') // ya UTC+1
})
