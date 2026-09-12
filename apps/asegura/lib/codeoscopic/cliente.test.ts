import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarFalloDeRed, ErrorCodeoscopic, peticion, olvidarToken } from './cliente.ts'
import type { ConfigCodeoscopic } from './config.ts'

function configDePrueba(clientId: string): ConfigCodeoscopic {
  return {
    baseUrl: 'https://vendor.test',
    tokenUrl: 'https://vendor.test/oauth2/token',
    clientId,
    clientSecret: 'secret',
    clientApp: 'app',
    userEmail: 'x@y.test',
    quotePath: '/insurances',
    timeoutCotizacionMs: 5000,
    timeoutGenericoMs: 5000,
    margenRefrescoTokenS: 30,
    topes: { diario: 20, mensual: 200 },
  }
}

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

// ─── Un 200 con cuerpo VACÍO es éxito, no un fallo de parseo (12/09/2026) ────
// Sexto error real: `actualizarFechaEfecto()` (PATCH) recibió un 200 sin
// cuerpo del vendor y `res.json()` reventó con «Unexpected end of JSON
// input» — un SyntaxError que NO es un `ErrorCodeoscopic`, así que se colaba
// como 500 "otro" pisando lo que en realidad fue un éxito.
test('peticion(): un 200 con cuerpo vacío devuelve null, no lanza', async () => {
  const config = configDePrueba('cid-cuerpo-vacio')
  olvidarToken(config)
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 300 }), { status: 200 })
    }
    return new Response('', { status: 200 })
  }) as typeof fetch
  try {
    const resultado = await peticion(config, {
      metodo: 'PATCH',
      path: '/insurances/1',
      cuerpo: { effectiveDate: '2026-09-12' },
      timeoutMs: 5000,
    })
    assert.equal(resultado, null)
  } finally {
    globalThis.fetch = originalFetch
    olvidarToken(config)
  }
})

test('peticion(): un 200 con JSON real lo sigue devolviendo tal cual', async () => {
  const config = configDePrueba('cid-cuerpo-json')
  olvidarToken(config)
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 300 }), { status: 200 })
    }
    return new Response(JSON.stringify({ id: 42 }), { status: 200 })
  }) as typeof fetch
  try {
    const resultado = await peticion(config, { metodo: 'GET', path: '/insurances/42', timeoutMs: 5000 })
    assert.deepEqual(resultado, { id: 42 })
  } finally {
    globalThis.fetch = originalFetch
    olvidarToken(config)
  }
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
