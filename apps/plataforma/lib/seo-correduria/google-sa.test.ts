import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { cargarClavePrivada, tokenCuentaServicio, GOOGLE_TOKEN_URL } from './google-sa.ts'
import type { FetchLike } from './tipos.ts'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const CFG = {
  clientEmail: 'seo@proyecto.iam.gserviceaccount.com',
  privateKey: PEM,
  scope: 'https://www.googleapis.com/auth/webmasters.readonly',
}

function decodificarPayload(jwt: string): Record<string, unknown> {
  const partes = jwt.split('.')
  assert.equal(partes.length, 3, 'la assertion no es un JWT de tres partes')
  return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
}

function fetchFalso(respuesta: { status: number; body: string }) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    return new Response(respuesta.body, { status: respuesta.status })
  }
  return { fetch, llamadas }
}

test('tokenCuentaServicio firma la assertion con iss/aud/scope y exp-iat=3600 y devuelve access_token', async () => {
  const { fetch, llamadas } = fetchFalso({ status: 200, body: JSON.stringify({ access_token: 'ya29.token-falso', expires_in: 3599 }) })
  const ahora = Date.parse('2026-09-08T08:30:00Z')

  const token = await tokenCuentaServicio(CFG, fetch, ahora)

  assert.equal(token, 'ya29.token-falso')
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, GOOGLE_TOKEN_URL)
  assert.equal(llamadas[0].init?.method, 'POST')
  const headers = llamadas[0].init?.headers as Record<string, string>
  assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded')

  const params = new URLSearchParams(String(llamadas[0].init?.body))
  assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  const assertion = params.get('assertion')
  assert.ok(assertion, 'falta la assertion en el body')

  const cabecera = JSON.parse(Buffer.from(assertion.split('.')[0], 'base64url').toString('utf8'))
  assert.equal(cabecera.alg, 'RS256')
  assert.equal(cabecera.typ, 'JWT')

  const payload = decodificarPayload(assertion)
  assert.equal(payload.iss, CFG.clientEmail)
  assert.equal(payload.aud, GOOGLE_TOKEN_URL)
  assert.equal(payload.scope, CFG.scope)
  assert.equal(payload.iat, Math.floor(ahora / 1000))
  assert.equal((payload.exp as number) - (payload.iat as number), 3600)
})

test('cargarClavePrivada acepta el PEM limpio, con \\n escapados y con comillas envolventes', () => {
  const limpio = cargarClavePrivada(PEM)
  assert.equal(limpio.type, 'private')
  assert.equal(limpio.asymmetricKeyType, 'rsa')

  const escapado = cargarClavePrivada(PEM.replace(/\n/g, '\\n'))
  assert.equal(escapado.asymmetricKeyType, 'rsa')

  const conComillas = cargarClavePrivada(`"${PEM.replace(/\n/g, '\\n')}"`)
  assert.equal(conComillas.asymmetricKeyType, 'rsa')

  const enUnaLinea = cargarClavePrivada(PEM.replace(/\n/g, ' '))
  assert.equal(enUnaLinea.asymmetricKeyType, 'rsa')
})

test('tokenCuentaServicio lanza con el status cuando Google responde !ok', async () => {
  const { fetch } = fetchFalso({ status: 401, body: '{"error":"invalid_grant","error_description":"Invalid JWT Signature."}' })
  await assert.rejects(
    () => tokenCuentaServicio(CFG, fetch),
    (e: Error) => {
      assert.match(e.message, /^google token 401: /)
      assert.match(e.message, /invalid_grant/)
      return true
    },
  )
})

test('tokenCuentaServicio lanza si la respuesta ok no trae access_token', async () => {
  const { fetch } = fetchFalso({ status: 200, body: '{}' })
  await assert.rejects(() => tokenCuentaServicio(CFG, fetch), /sin access_token/)
})
