// Tests de claveDedup (idempotencia del agente de huéspedes). Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { claveDedup } from './clave-dedup.ts'

test('si hay msgId de Smoobu, la clave ES ese id', () => {
  assert.equal(claveDedup('130550600', '697209906', 'Saldremos sobre las 11h'), '697209906')
})

test('sin msgId, cae a clave por reserva+contenido (estable y determinista)', () => {
  const a = claveDedup('130550600', '', 'Saldremos sobre las 11h aproximadamente')
  const b = claveDedup('130550600', null, 'Saldremos sobre las 11h aproximadamente')
  assert.equal(a, b)                       // mismo mensaje → misma clave (no se reprocesa)
  assert.match(a, /^c:130550600:[0-9a-f]{16}$/)
})

test('sin msgId, normaliza espacios y mayúsculas (mismo mensaje = misma clave)', () => {
  const a = claveDedup('130550600', '', 'Saldremos sobre las 11h')
  const b = claveDedup('130550600', '', '  saldremos   SOBRE las 11h  ')
  assert.equal(a, b)
})

test('claves distintas para reservas o textos distintos', () => {
  const base = claveDedup('130550600', '', 'Saldremos sobre las 11h')
  assert.notEqual(base, claveDedup('999999999', '', 'Saldremos sobre las 11h')) // otra reserva
  assert.notEqual(base, claveDedup('130550600', '', 'Llegamos a las 13h'))       // otro texto
})
