import test from 'node:test'
import assert from 'node:assert/strict'
import {
  accesoDesdeRefresh, canjearCodigo, emailDeIdToken, People, SyncTokenCaducado, TokenRevocado, urlAutorizacion,
  SCOPE_CONTACTOS, type Red,
} from './google-people.ts'

type Paso = { status: number; body?: unknown; headers?: Record<string, string> }
function red(pasos: Paso[]) {
  const llamadas: { url: string; init: RequestInit }[] = []
  const esperas: number[] = []
  const r: Red = {
    fetch: (async (url: string, init: RequestInit) => {
      llamadas.push({ url: String(url), init })
      const p = pasos.shift()
      if (!p) throw new Error('llamada de más')
      return new Response(p.body === undefined ? '' : JSON.stringify(p.body), { status: p.status, headers: p.headers })
    }) as typeof fetch,
    dormir: async (ms) => { esperas.push(ms) },
  }
  return { r, llamadas, esperas }
}
const cred = { clientId: 'cid', clientSecret: 'csec', redirectUri: 'https://x/api/google-contactos/callback' }

test('la URL de autorización pide offline + consent, el scope de contactos y lleva el state', () => {
  const u = new URL(urlAutorizacion(cred, 'st.firma'))
  assert.equal(u.searchParams.get('access_type'), 'offline')
  assert.equal(u.searchParams.get('prompt'), 'consent')
  assert.ok(u.searchParams.get('scope')!.split(' ').includes(SCOPE_CONTACTOS))
  assert.equal(u.searchParams.get('state'), 'st.firma')
})

test('canje: sin el scope de contactos (casilla desmarcada) NO se acepta', async () => {
  const { r } = red([{ status: 200, body: { refresh_token: 'rt', scope: 'openid email' } }])
  await assert.rejects(canjearCodigo(cred, 'code', r), /permiso de contactos/)
})

test('canje: sin refresh token NO se acepta', async () => {
  const { r } = red([{ status: 200, body: { scope: SCOPE_CONTACTOS } }])
  await assert.rejects(canjearCodigo(cred, 'code', r), /refresh token/)
})

test('canje correcto: refresh token, scopes y la cuenta del id_token', async () => {
  const idt = `x.${Buffer.from(JSON.stringify({ email: 'alberto@gmail.com' })).toString('base64url')}.y`
  const { r } = red([{ status: 200, body: { refresh_token: 'rt', scope: `${SCOPE_CONTACTOS} openid`, id_token: idt } }])
  const t = await canjearCodigo(cred, 'code', r)
  assert.equal(t.refreshToken, 'rt')
  assert.equal(t.cuentaGoogle, 'alberto@gmail.com')
  assert.equal(emailDeIdToken('basura'), null)
})

test('refresh revocado (invalid_grant) se distingue de un fallo de red', async () => {
  const { r } = red([{ status: 400, body: { error: 'invalid_grant' } }])
  await assert.rejects(accesoDesdeRefresh(cred, 'rt', r), TokenRevocado)
})

test('🪤 429 con Retry-After se reintenta (con espera) y luego sigue', async () => {
  const { r, esperas, llamadas } = red([
    { status: 429, headers: { 'retry-after': '2' } },
    { status: 200, body: { connections: [{ resourceName: 'people/1' }], nextSyncToken: 'st2', totalPeople: 1 } },
  ])
  const out = await new People('tok', r).listar(null)
  assert.deepEqual(esperas, [2000])
  assert.equal(llamadas.length, 2)
  assert.equal(out.nextSyncToken, 'st2')
  assert.equal(out.totalCuenta, 1)
})

test('🪤 syncToken caducado (410) → SyncTokenCaducado para hacer el resync completo', async () => {
  const { r } = red([{ status: 410, body: { error: { status: 'FAILED_PRECONDITION' } } }])
  await assert.rejects(new People('tok', r).listar('viejo'), SyncTokenCaducado)
})

test('listado por páginas con requestSyncToken; el token de acceso no sale en ningún error', async () => {
  const { r, llamadas } = red([
    { status: 200, body: { connections: [{ resourceName: 'people/1' }], nextPageToken: 'p2' } },
    { status: 200, body: { connections: [{ resourceName: 'people/2' }], nextSyncToken: 's' } },
  ])
  const out = await new People('SECRETO-ACCESO', r).listar(null)
  assert.equal(out.personas.length, 2)
  assert.match(llamadas[0].url, /requestSyncToken=true/)
  assert.match(llamadas[1].url, /pageToken=p2/)
  const { r: r2 } = red([{ status: 403, body: { error: 'denegado' } }])
  await assert.rejects(new People('SECRETO-ACCESO', r2).listar(null), (e: Error) => !e.message.includes('SECRETO-ACCESO'))
})

test('actualizar por lote manda solo la máscara gestionada y marca los que fallan', async () => {
  const { r, llamadas } = red([{ status: 200, body: { updateResult: { 'people/1': { person: { resourceName: 'people/1', etag: 'e2' }, httpStatusCode: 200 } } } }])
  const persona = { names: [], phoneNumbers: [], emailAddresses: [], organizations: [], externalIds: [] }
  const out = await new People('t', r).actualizarLote({ 'people/1': persona, 'people/2': persona })
  assert.equal(out['people/1']?.etag, 'e2')
  assert.equal(out['people/2'], null)
  assert.equal(JSON.parse(String(llamadas[0].init.body)).updateMask, 'names,phoneNumbers,emailAddresses,organizations,externalIds')
})
