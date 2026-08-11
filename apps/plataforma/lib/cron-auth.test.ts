import test from 'node:test'
import assert from 'node:assert/strict'
import { autorizaCron } from './cron-auth.ts'

// El caso que motivó estos tests (08/08/2026): `if (!secret) return true`. La ausencia del secreto
// autorizaba a cualquiera, y no se veía porque en local es justo lo que quieres. Se descubrió al
// revés — la rutina de Booking escribía comparables con su campo de token VACÍO: si las escrituras
// entran sin token, el token no es lo que las está abriendo.

test('sin secreto en PRODUCCIÓN: se deniega', () => {
  assert.equal(autorizaCron({ secret: undefined, bearer: null, qs: null, produccion: true }), false)
  assert.equal(autorizaCron({ secret: '', bearer: 'lo-que-sea', qs: null, produccion: true }), false)
})

test('sin secreto en DEV: paso franco (levantar en local sin envs sigue funcionando)', () => {
  assert.equal(autorizaCron({ secret: undefined, bearer: null, qs: null, produccion: false }), true)
})

test('con secreto: solo pasa quien lo trae', () => {
  const secret = 's3cr3t'
  assert.equal(autorizaCron({ secret, bearer: secret, qs: null, produccion: true }), true)
  assert.equal(autorizaCron({ secret, bearer: null, qs: secret, produccion: true }), true)
  assert.equal(autorizaCron({ secret, bearer: 'otro', qs: 'otro', produccion: true }), false)
  assert.equal(autorizaCron({ secret, bearer: null, qs: null, produccion: true }), false)
})

test('un bearer vacío nunca casa con un secreto definido', () => {
  // Es lo que manda una rutina cuyo campo de token está vacío: `Authorization: Bearer `.
  assert.equal(autorizaCron({ secret: 's3cr3t', bearer: '', qs: null, produccion: true }), false)
  assert.equal(autorizaCron({ secret: 's3cr3t', bearer: '', qs: null, produccion: false }), false)
})
