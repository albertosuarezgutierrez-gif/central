import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BYTES_TOKEN_HOJA,
  MAX_NOMBRE_HOJA,
  normalizarTokenHoja,
  normalizarNombreHoja,
  estadoHoja,
  seleccionHoja,
  polizasDeLaHoja,
  loQueVeQuienEscanea,
} from './hoja-qr.ts'

const hex = (n: number) => 'a'.repeat(n)

test('el token solo se acepta con su forma EXACTA, sin tocar la BD', () => {
  assert.equal(normalizarTokenHoja(hex(64)), hex(64))
  assert.equal(normalizarTokenHoja(` ${'A'.repeat(64)} `), hex(64), 'espacios y mayúsculas se normalizan')
  assert.equal(normalizarTokenHoja(hex(63)), null)
  assert.equal(normalizarTokenHoja(hex(65)), null)
  assert.equal(normalizarTokenHoja('z'.repeat(64)), null, 'la z no es hex')
  assert.equal(normalizarTokenHoja(undefined), null)
  assert.equal(normalizarTokenHoja(123), null)
})

test('32 bytes de token son 64 caracteres hex: la forma que valida el normalizador', () => {
  assert.equal(BYTES_TOKEN_HOJA * 2, 64)
})

test('el nombre es opcional, se recorta y no se guarda vacío', () => {
  assert.equal(normalizarNombreHoja('  Coche   de Pilar '), 'Coche de Pilar')
  assert.equal(normalizarNombreHoja('   '), null, 'un nombre en blanco es no tener nombre')
  assert.equal(normalizarNombreHoja(null), null)
  assert.equal(normalizarNombreHoja('x'.repeat(200))?.length, MAX_NOMBRE_HOJA)
})

test('una hoja sin fecha de anulación está viva; con fecha, anulada', () => {
  assert.equal(estadoHoja({ anuladaEn: null }), 'viva')
  assert.equal(estadoHoja({ anuladaEn: new Date('2026-09-05T00:00:00Z') }), 'anulada')
})

test('una selección VACÍA no es «todas»: se rechaza', () => {
  // 🚨 El cepo que más importa de este fichero. Colapsar la lista vacía en
  // «todas» convierte un formulario mal enviado en el acceso más amplio posible.
  assert.deepEqual(seleccionHoja(false, []), { sel: null, error: 'sin_seleccion' })
  assert.deepEqual(seleccionHoja(undefined, undefined), { sel: null, error: 'sin_seleccion' })
  assert.deepEqual(seleccionHoja(false, ['  ', '']), { sel: null, error: 'sin_seleccion' })
})

test('«todas» solo lo activa un true explícito, y quita los duplicados de la lista', () => {
  assert.deepEqual(seleccionHoja(true, undefined), { sel: { todas: true }, error: 'ok' })
  // Un `'true'` de texto NO cuenta: el formulario manda booleanos.
  assert.equal(seleccionHoja('true', []).sel, null)
  assert.deepEqual(seleccionHoja(false, ['p1', 'p1', ' p2 ']), {
    sel: { todas: false, polizaIds: ['p1', 'p2'] },
    error: 'ok',
  })
})

test('lo que se enseña sale de lo que HOY es suyo, no de la selección guardada', () => {
  // La póliza p9 estaba elegida y ya no es suya: no puede seguir en la hoja.
  const suyas = [{ id: 'p1' }, { id: 'p2' }]
  assert.deepEqual(polizasDeLaHoja(suyas, { todas: false, polizaIds: ['p1', 'p9'] }), [{ id: 'p1' }])
})

test('«todas» arrastra lo que haya HOY, incluida una póliza posterior al QR', () => {
  const suyas = [{ id: 'p1' }, { id: 'nueva' }]
  assert.deepEqual(polizasDeLaHoja(suyas, { todas: true }), suyas)
})

test('si ya no queda ninguna suya, la hoja sale vacía en vez de con datos viejos', () => {
  assert.deepEqual(polizasDeLaHoja([], { todas: false, polizaIds: ['p1'] }), [])
  assert.deepEqual(polizasDeLaHoja([], { todas: true }), [])
})

test('quien escanea distingue las CUATRO situaciones, y anulada no es «no existe»', () => {
  assert.equal(loQueVeQuienEscanea(null, 0), 'no_existe')
  assert.equal(loQueVeQuienEscanea({ anuladaEn: new Date('2026-09-05T00:00:00Z') }, 3), 'anulada')
  assert.equal(loQueVeQuienEscanea({ anuladaEn: null }, 0), 'vacia')
  assert.equal(loQueVeQuienEscanea({ anuladaEn: null }, 2), 'hoja')
})

test('una hoja anulada NO enseña sus pólizas aunque le queden', () => {
  // El caso del papel viejo en la guantera: el estado manda sobre el contenido.
  assert.equal(loQueVeQuienEscanea({ anuladaEn: new Date('2026-01-01T00:00:00Z') }, 5), 'anulada')
})
