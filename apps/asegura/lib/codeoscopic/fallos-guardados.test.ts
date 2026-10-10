// `tarificaciones.fallos` → lo que ve la pantalla. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fallosDe } from './fallos-guardados.ts'

test('NULL (no se guardaron) ≠ [] (el vendor no devolvió errores)', () => {
  assert.equal(fallosDe(null), null)
  assert.equal(fallosDe(undefined), null)
  assert.equal(fallosDe({}), null)
  assert.deepEqual(fallosDe([]), [])
})

test('cada fallo se lee por forma; sin compañía ni motivo no se pinta', () => {
  assert.deepEqual(
    fallosDe([
      { compania: 'Generali', producto: 'Generali Autos 2025', configuracion: null, motivo: ' Error (Código 2115) ', tambienDioPrecio: false },
      { compania: 'Allianz', motivo: 'Vehículo no permitido', tambienDioPrecio: 'si' },
      { producto: 'suelto' },
      'basura',
    ]),
    [
      { compania: 'Generali', producto: 'Generali Autos 2025', configuracion: null, motivo: 'Error (Código 2115)', tambienDioPrecio: false },
      { compania: 'Allianz', producto: null, configuracion: null, motivo: 'Vehículo no permitido', tambienDioPrecio: false },
    ],
  )
})
