import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { EMISOR_FACTURAS_HUESPED, cuentaPuedeFacturar, lineasEmisor } from './emisor.ts'
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

// El emisor es SIEMPRE Alberto: solo su cuenta (mismo criterio que el libro de gastos) puede crear solicitudes.
test('solo la cuenta de Alberto factura; si no se puede determinar, nadie (fail-closed)', () => {
  const A = { id: 'a', email: 'alberto@x.es', esDemo: false }
  const B = { id: 'b', email: 'otra@x.es', esDemo: false }
  const D = { id: 'd', email: null, esDemo: true }
  assert.equal(cuentaPuedeFacturar('a', [A, B, D], { gmailUser: 'Alberto@x.es' }), true)
  assert.equal(cuentaPuedeFacturar('b', [A, B, D], { gmailUser: 'alberto@x.es' }), false)
  assert.equal(cuentaPuedeFacturar('b', [A, B], { facturaCuentaId: 'b' }), true)
  assert.equal(cuentaPuedeFacturar('a', [A, B], {}), false, 'dos cuentas reales y sin criterio: nadie')
  assert.equal(cuentaPuedeFacturar('a', [A, D], {}), true, 'única cuenta real')
  assert.equal(cuentaPuedeFacturar('d', [A, D], {}), false, 'la demo nunca')
})

test('asegurarSolicitud comprueba la cuenta emisora ANTES de crear la solicitud', () => {
  const src = readFileSync(new URL('./servicio.ts', import.meta.url), 'utf8')
  const cuerpo = src.slice(src.indexOf('export async function asegurarSolicitud'))
  const chequeo = cuerpo.indexOf('if (!(await esCuentaEmisora(cuentaId)))')
  assert.ok(chequeo > 0, 'falta el chequeo de cuenta emisora')
  assert.ok(chequeo < cuerpo.indexOf('sivraFacturaSolicitud.findFirst'), 'el chequeo debe ir antes de reutilizar/crear')
  assert.ok(chequeo < cuerpo.indexOf('sivraFacturaSolicitud.create'), 'el chequeo debe ir antes de crear')
})
