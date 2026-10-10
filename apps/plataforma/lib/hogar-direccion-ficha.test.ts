import assert from 'node:assert/strict'
import { test } from 'node:test'

import { direccionDeFicha } from './hogar-direccion-ficha.ts'

test('con calle legible: la propone, con municipio y provincia en mayúsculas (como el buscador)', () => {
  assert.deepEqual(
    direccionDeFicha({ direccion: '  Calle San Vicente 40,  2º 14 ', direccionIlegible: false, ciudad: 'Sevilla', provincia: 'Sevilla' }),
    { direccion: 'Calle San Vicente 40, 2º 14', municipio: 'SEVILLA', provincia: 'SEVILLA' },
  )
})

test('sin municipio en la ficha → null, no un «SEVILLA» que parezca del cliente', () => {
  assert.deepEqual(
    direccionDeFicha({ direccion: 'Av. Andalucía 3', direccionIlegible: false, ciudad: null, provincia: '' }),
    { direccion: 'Av. Andalucía 3', municipio: null, provincia: null },
  )
})

test('sin calle, o cifrada sin clave → null (el buscador sale vacío, como antes)', () => {
  assert.equal(direccionDeFicha({ direccion: null, direccionIlegible: false, ciudad: 'Sevilla', provincia: 'Sevilla' }), null)
  assert.equal(direccionDeFicha({ direccion: '   ', direccionIlegible: false, ciudad: 'Sevilla', provincia: 'Sevilla' }), null)
  assert.equal(direccionDeFicha({ direccion: 'Calle X 1', direccionIlegible: true, ciudad: 'Sevilla', provincia: 'Sevilla' }), null)
  assert.equal(direccionDeFicha(null), null)
})
