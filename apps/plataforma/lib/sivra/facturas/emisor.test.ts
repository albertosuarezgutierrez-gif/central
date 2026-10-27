import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { EMISOR_FACTURAS_HUESPED, lineasEmisor } from './emisor.ts'
import { MEDIADOR } from '@central/module-seguros'
import { validarNifCif } from '@central/core-fiscal/validacion'

// 🚨 Guardián del EMISOR de las facturas a huéspedes. Domicilio: Calle Socorro 24, 41003 Sevilla. NO Bustos Tavera 22.
test('emisor: Alberto, NIF 28823484E, Calle Socorro 24, 41003 Sevilla', () => {
  assert.equal(EMISOR_FACTURAS_HUESPED.nombre, 'Alberto Suárez Gutiérrez')
  assert.equal(EMISOR_FACTURAS_HUESPED.nif, '28823484E')
  assert.equal(EMISOR_FACTURAS_HUESPED.domicilio, 'Calle Socorro 24')
  assert.equal(EMISOR_FACTURAS_HUESPED.cp, '41003')
  assert.equal(EMISOR_FACTURAS_HUESPED.municipio, 'Sevilla')
  assert.ok(validarNifCif(EMISOR_FACTURAS_HUESPED.nif).ok)
  assert.ok(Object.isFrozen(EMISOR_FACTURAS_HUESPED))
})

test('emisor: NUNCA Bustos Tavera ni el domicilio de la correduría', () => {
  const todo = lineasEmisor().join(' ')
  assert.doesNotMatch(todo, /bustos|tavera/i)
  assert.doesNotMatch(todo, /san juan de la palma/i)
  const fuente = readFileSync(new URL('./emisor.ts', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(fuente, /bustos|tavera/i)
})

test('emisor: nombre y NIF idénticos a MEDIADOR.identidad (duplicado a propósito, vigilado aquí)', () => {
  assert.equal(EMISOR_FACTURAS_HUESPED.nombre, MEDIADOR.identidad.nombre)
  assert.equal(EMISOR_FACTURAS_HUESPED.nif, MEDIADOR.identidad.nif)
})
