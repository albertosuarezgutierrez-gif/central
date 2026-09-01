import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarFalloDeRed, ErrorCodeoscopic } from './cliente.ts'

// ─── Qué cuenta como prueba de que NO nos han cobrado ────────────────────────
// Esta es la frontera que decide si el cupo se libera. Equivocarse hacia el lado
// optimista significa cotizar de más y descuadrar la factura de fin de mes.

test('los fallos previos al envío SÍ prueban que no hubo cargo', () => {
  for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'CERT_HAS_EXPIRED']) {
    const e = Object.assign(new TypeError('fetch failed'), { cause: { code } })
    assert.equal(clasificarFalloDeRed(e), 'conexion', code)
  }
})

test('un corte a media petición NO prueba nada: pudo tarificarse igual', () => {
  for (const code of ['ECONNRESET', 'UND_ERR_SOCKET', 'ERR_STREAM_PREMATURE_CLOSE']) {
    const e = Object.assign(new TypeError('fetch failed'), { cause: { code } })
    assert.equal(clasificarFalloDeRed(e), 'red-indeterminada', code)
  }
})

test('un error sin causa reconocible se trata como indeterminado, no como gratis', () => {
  assert.equal(clasificarFalloDeRed(new Error('vete a saber')), 'red-indeterminada')
  assert.equal(clasificarFalloDeRed(null), 'red-indeterminada')
  assert.equal(clasificarFalloDeRed({ cause: { code: 42 } }), 'red-indeterminada')
})

test('solo auth, conexión y validación liberan cupo', () => {
  assert.equal(new ErrorCodeoscopic('auth', 'x').pruebaQueNoHuboCargo, true)
  assert.equal(new ErrorCodeoscopic('conexion', 'x').pruebaQueNoHuboCargo, true)
  assert.equal(new ErrorCodeoscopic('validacion', 'x').pruebaQueNoHuboCargo, true)
  // Los tres que NO: en todos ellos la petición pudo llegar y facturarse.
  assert.equal(new ErrorCodeoscopic('timeout', 'x').pruebaQueNoHuboCargo, false)
  assert.equal(new ErrorCodeoscopic('servidor', 'x').pruebaQueNoHuboCargo, false)
  assert.equal(new ErrorCodeoscopic('red-indeterminada', 'x').pruebaQueNoHuboCargo, false)
})
