import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anioCumpleanos, diaMadrid, esCumpleanos } from './cumpleanos.ts'

test('hoy es su cumpleaños por el día de MADRID, no por el UTC', () => {
  // 23/09 a las 22:30 UTC ya es 24/09 en Madrid (UTC+2).
  assert.equal(diaMadrid(new Date('2026-09-23T22:30:00Z')), '2026-09-24')
  assert.equal(esCumpleanos('1980-09-24', new Date('2026-09-23T22:30:00Z')), true)
  assert.equal(esCumpleanos('1980-09-23', new Date('2026-09-23T22:30:00Z')), false)
})

test('acepta la fecha en ISO y en formato español', () => {
  const hoy = new Date('2026-09-24T09:00:00Z')
  assert.equal(esCumpleanos('1975-09-24', hoy), true)
  assert.equal(esCumpleanos('24/09/1975', hoy), true)
  assert.equal(esCumpleanos('1975-09-24T00:00:00.000Z', hoy), true)
})

test('🚨 el 29 de febrero se felicita el 28 en año no bisiesto, y el 29 en bisiesto', () => {
  assert.equal(esCumpleanos('1984-02-29', new Date('2027-02-28T10:00:00Z')), true)
  assert.equal(esCumpleanos('1984-02-29', new Date('2027-03-01T10:00:00Z')), false)
  assert.equal(esCumpleanos('1984-02-29', new Date('2028-02-28T10:00:00Z')), false)
  assert.equal(esCumpleanos('1984-02-29', new Date('2028-02-29T10:00:00Z')), true)
})

test('una fecha que no se sabe leer NO es un cumpleaños', () => {
  const hoy = new Date('2026-09-24T09:00:00Z')
  for (const f of [null, undefined, '', 'v1:abc', '1980-02-30', '0001-09-24', '2026-09-24', '2030-09-24', 'desconocido']) {
    assert.equal(esCumpleanos(f, hoy), false, String(f))
  }
})

test('el año del sello es el del día de Madrid', () => {
  assert.equal(anioCumpleanos(new Date('2026-12-31T23:30:00Z')), 2027)
})
