// Tests de evaluaReceptor. Runner: `node --test` (type-stripping; receptor.ts es puro).
// Fijan la asimetría que importa: se descarta SOLO con identificación positiva por NIF, y
// cualquier duda cae en 'desconocido' (la factura sigue su curso) en vez de en 'ajeno'.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { evaluaReceptor, nifProveedorEsNuestro, normalizaNombreReceptor } from './receptor.ts'

const TITULARES = [
  { nif: '28823484E', nombre: 'Alberto Suárez Gutiérrez' },
  { nif: 'B90446683', nombre: 'PUNTO Y COMA GESTION, S.L.' },
]

test('factura de un tercero identificado por NIF → ajena', () => {
  // Caso real: obra del tejado de la Hacienda El Triunfo (LUANSA, factura nº 4 de abril-2026),
  // facturada a "El Triunfo CB" y colada en la bandeja por un reenvío del hilo con MAPFRE.
  const d = evaluaReceptor({ cliente: 'El Triunfo CB', nif_cliente: 'E26631895' }, TITULARES)
  assert.equal(d.veredicto, 'ajeno')
  assert.equal(d.receptor, 'El Triunfo CB')
})

test('factura a nombre de la SL → nuestra, aunque cambie la forma jurídica y los acentos', () => {
  // DIGI factura a "Punto Y Coma Gestion Sl"; en sociedades está como "PUNTO Y COMA GESTION, S.L.".
  const d = evaluaReceptor({ cliente: 'Punto Y Coma Gestion Sl', nif_cliente: null }, TITULARES)
  assert.equal(d.veredicto, 'nuestro')
})

test('factura a nombre propio por NIF → nuestra', () => {
  const d = evaluaReceptor({ cliente: 'Alberto Suarez', nif_cliente: '28.823.484-E' }, TITULARES)
  assert.equal(d.veredicto, 'nuestro')
})

test('sin receptor legible → desconocido, NO ajeno', () => {
  assert.equal(evaluaReceptor({}, TITULARES).veredicto, 'desconocido')
  assert.equal(evaluaReceptor({ cliente: null, nif_cliente: null }, TITULARES).veredicto, 'desconocido')
})

test('nombre genérico de cliente sin NIF → desconocido', () => {
  // "Cliente Varios" es literalmente lo que ponía la factura de LUANSA: no identifica a nadie.
  assert.equal(evaluaReceptor({ cliente: 'Varios' }, TITULARES).veredicto, 'desconocido')
})

test('nombre desconocido SIN NIF → desconocido: el nombre nunca descarta por sí solo', () => {
  const d = evaluaReceptor({ cliente: 'Hormigones del Sur' }, TITULARES)
  assert.equal(d.veredicto, 'desconocido')
})

test('sin lista de titulares no se descarta nada', () => {
  assert.equal(evaluaReceptor({ cliente: 'El Triunfo CB', nif_cliente: 'E26631895' }, []).veredicto, 'desconocido')
})

test('NIF de cliente idéntico al del proveedor → desconocido (extractor confundido)', () => {
  const d = evaluaReceptor(
    { cliente: 'IONOS Cloud S.L.U.', nif_cliente: 'B85049435', nif_proveedor: 'B-85049435' },
    TITULARES,
  )
  assert.equal(d.veredicto, 'desconocido')
})

test('nifProveedorEsNuestro pilla el NIF del cliente colado como emisor', () => {
  // Caso real IONOS (29/07/2026): guardó 28823484E — el NIF de Alberto — como CIF de IONOS.
  assert.equal(nifProveedorEsNuestro('28823484E', TITULARES), true)
  assert.equal(nifProveedorEsNuestro('B-85049435', TITULARES), false)
  assert.equal(nifProveedorEsNuestro(null, TITULARES), false)
  assert.equal(nifProveedorEsNuestro('28823484E', []), false)
})

test('normalizaNombreReceptor quita forma jurídica, acentos y puntuación', () => {
  assert.equal(normalizaNombreReceptor('PUNTO Y COMA GESTION, S.L.'), 'punto y coma gestion')
  assert.equal(normalizaNombreReceptor('El Triunfo CB'), 'el triunfo')
})
