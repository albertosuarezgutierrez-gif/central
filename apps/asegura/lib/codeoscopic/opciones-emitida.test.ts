import assert from 'node:assert/strict'
import { test } from 'node:test'

import { opcionesOfertaAceptada } from './opciones-emitida.ts'

test('opciones de la oferta aceptada: se leen de mainQuote.product; un fallo o sin oferta es null, no []', async () => {
  const oferta = { mainQuote: { product: { formattedOptions: [{ label: 'Asistencia en Viaje', formattedValue: 'Estándar' }] } } }
  assert.deepEqual(await opcionesOfertaAceptada('1', 'Q1', async () => oferta), [{ etiqueta: 'Asistencia en Viaje', valor: 'Estándar' }])
  assert.equal(await opcionesOfertaAceptada('1', null, async () => oferta), null)
  assert.equal(await opcionesOfertaAceptada('1', 'Q1', async () => { throw new Error('timeout') }), null)
})
