import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDeLectura, DIAS_DOC_ANTIGUO } from './revision-lectura.ts'

const TITULARES = [{ nif: '00000000T', nombre: 'Titular Ejemplo Uno' }, { nif: 'B00000000', nombre: 'EMPRESA DE PRUEBA, S.L.' }]
const HOY = new Date('2026-11-03T08:00:00Z')

test('la dirección del piso tomada como proveedor salta (caso «SOCORRO», 03/11/2026)', () => {
  const a = avisosDeLectura({ proveedor: 'SOCORRO', fecha: '2026-11-01' }, TITULARES, HOY)
  assert.equal(a.length, 1)
  assert.match(a[0], /direcci[oó]n de un piso/)
  assert.equal(avisosDeLectura({ proveedor: 'Calle Socorro 24', fecha: '2026-11-01' }, TITULARES, HOY).length, 1)
})

test('un proveedor que solo CONTIENE el nombre de la calle no salta', () => {
  assert.deepEqual(avisosDeLectura({ proveedor: 'Farmacia Socorro', fecha: '2026-11-01' }, TITULARES, HOY), [])
})

test('el titular como proveedor salta (emisor y destinatario confundidos)', () => {
  const a = avisosDeLectura({ proveedor: 'TITULAR EJEMPLO UNO', cliente: 'Otra Persona', fecha: '2026-11-01' }, TITULARES, HOY)
  assert.match(a[0], /titulares/)
  assert.equal(avisosDeLectura({ proveedor: 'Titular Ejemplo', fecha: '2026-11-01' }, TITULARES, HOY).length, 1)
})

test('proveedor igual al cliente salta', () => {
  const a = avisosDeLectura({ proveedor: 'Comercial Pérez', cliente: 'COMERCIAL PEREZ', fecha: '2026-11-01' }, [], HOY)
  assert.match(a[0], /coinciden/)
})

test('documento de hace meses salta; uno reciente o sin fecha, no', () => {
  assert.equal(avisosDeLectura({ proveedor: 'Booking.com B.V.', fecha: '2024-12-03' }, [], HOY).length, 1)
  const borde = new Date(HOY.getTime() - DIAS_DOC_ANTIGUO * 86_400_000).toISOString().slice(0, 10)
  assert.deepEqual(avisosDeLectura({ proveedor: 'Booking.com B.V.', fecha: borde }, [], HOY), [])
  assert.deepEqual(avisosDeLectura({ proveedor: 'Vercel Inc.', fecha: null }, [], HOY), [])
})

test('una factura normal no tiene avisos', () => {
  assert.deepEqual(avisosDeLectura({ proveedor: 'IONOS Cloud S.L.U.', cliente: 'Titular Ejemplo Uno', fecha: '2026-10-28' }, TITULARES, HOY), [])
})

test('la antigüedad no se mira si se pide (subida manual)', () => {
  assert.deepEqual(avisosDeLectura({ proveedor: 'Booking.com B.V.', fecha: '2024-12-03' }, [], HOY, { antiguedad: false }), [])
})
