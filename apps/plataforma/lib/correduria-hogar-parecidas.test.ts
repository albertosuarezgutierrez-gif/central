import { test } from 'node:test'
import assert from 'node:assert/strict'
import { direccionesParecidas } from './correduria-hogar.ts'

test('la calle sugerida conserva el número y el piso que escribió la persona', () => {
  const vias = [{ tipo: 'AV', nombre: "JUAN ANT RUIZ 'ESPARTACO'" }]
  assert.deepEqual(direccionesParecidas(vias, { numero: '43' }), [
    { etiqueta: "AV JUAN ANT RUIZ 'ESPARTACO', 43", direccion: "AV JUAN ANT RUIZ 'ESPARTACO' 43" },
  ])
  assert.equal(direccionesParecidas(vias, { numero: '4', planta: '2', puerta: 'B' })[0].direccion, "AV JUAN ANT RUIZ 'ESPARTACO' 4, PLANTA 2, PUERTA B")
})
