import { test } from 'node:test'
import assert from 'node:assert/strict'

import { crearClienteGraph, versionGraph, VERSION_GRAPH_DEFECTO, type FetchLike } from './graph.ts'

type Llamada = { url: string; init?: RequestInit }

function fetchFalso(respuestas: Array<{ status: number; json: unknown }>): { f: FetchLike; llamadas: Llamada[] } {
  const llamadas: Llamada[] = []
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    const r = respuestas.shift() ?? { status: 500, json: null }
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  return { f, llamadas }
}

test('versionGraph: ausente → defecto; mal formada → null (no se adivina)', () => {
  assert.equal(versionGraph({}), VERSION_GRAPH_DEFECTO)
  assert.equal(versionGraph({ WHATSAPP_GRAPH_API_VERSION: 'v25.0' }), 'v25.0')
  assert.equal(versionGraph({ WHATSAPP_GRAPH_API_VERSION: '25' }), null)
})

test('canje del code: GET oauth/access_token con client_id, client_secret y code; devuelve el token', async () => {
  const { f, llamadas } = fetchFalso([{ status: 200, json: { access_token: 'EAAG-token-de-negocio', token_type: 'bearer' } }])
  const g = crearClienteGraph({ version: 'v24.0', fetch: f })
  const r = await g.canjearCodigo({ appId: '111', appSecret: 'secreto', code: 'CODIGO123' })
  assert.deepEqual(r, { ok: true, datos: { token: 'EAAG-token-de-negocio', expiraEnSeg: null } })
  const u = new URL(llamadas[0].url)
  assert.equal(u.origin + u.pathname, 'https://graph.facebook.com/v24.0/oauth/access_token')
  assert.equal(u.searchParams.get('client_id'), '111')
  assert.equal(u.searchParams.get('client_secret'), 'secreto')
  assert.equal(u.searchParams.get('code'), 'CODIGO123')
  assert.equal(llamadas[0].init?.method, 'GET')
})

test('canje fallido: el error de Meta (código y mensaje) sin el secreto', async () => {
  const { f } = fetchFalso([{ status: 400, json: { error: { code: 100, error_subcode: 36007, message: 'This authorization code has expired.' } } }])
  const r = await crearClienteGraph({ version: 'v24.0', fetch: f }).canjearCodigo({ appId: '1', appSecret: 'NO-DEBE-SALIR', code: 'c0d3c0d3' })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.codigo, 100)
    assert.equal(r.subcodigo, 36007)
    assert.equal(r.http, 400)
    assert.ok(!JSON.stringify(r).includes('NO-DEBE-SALIR'))
  }
})

test('red caída → error «red», nunca excepción', async () => {
  const g = crearClienteGraph({ version: 'v24.0', fetch: async () => { throw new Error('ECONNRESET') } })
  const r = await g.suscribirApp('123', 'tok')
  assert.deepEqual(r, { ok: false, http: 0, codigo: null, subcodigo: null, mensaje: 'red' })
})

test('suscripción: POST /{waba_id}/subscribed_apps con Bearer del token de negocio', async () => {
  const { f, llamadas } = fetchFalso([{ status: 200, json: { success: true } }])
  const r = await crearClienteGraph({ version: 'v24.0', fetch: f }).suscribirApp('987654321', 'TOKEN')
  assert.deepEqual(r, { ok: true, datos: { suscrita: true } })
  assert.equal(llamadas[0].url, 'https://graph.facebook.com/v24.0/987654321/subscribed_apps')
  assert.equal(llamadas[0].init?.method, 'POST')
  assert.equal((llamadas[0].init?.headers as Record<string, string>).authorization, 'Bearer TOKEN')
})

test('ids con forma rara no llegan a la URL (ni path traversal ni query)', async () => {
  const { f, llamadas } = fetchFalso([])
  const g = crearClienteGraph({ version: 'v24.0', fetch: f })
  assert.equal((await g.suscribirApp('123/../me', 't')).ok, false)
  assert.equal((await g.sincronizarSmb('1?x=1', 't', 'history')).ok, false)
  assert.equal((await g.estadoNumero('', 't')).ok, false)
  assert.equal(llamadas.length, 0)
})

test('smb_app_data: cuerpo exacto de cada sync y request_id devuelto', async () => {
  const { f, llamadas } = fetchFalso([
    { status: 200, json: { messaging_product: 'whatsapp', request_id: 'REQ-CONTACTOS' } },
    { status: 200, json: { messaging_product: 'whatsapp', request_id: 'REQ-HIST' } },
  ])
  const g = crearClienteGraph({ version: 'v24.0', fetch: f })
  assert.deepEqual(await g.sincronizarSmb('555', 'T', 'smb_app_state_sync'), { ok: true, datos: { requestId: 'REQ-CONTACTOS' } })
  assert.deepEqual(await g.sincronizarSmb('555', 'T', 'history'), { ok: true, datos: { requestId: 'REQ-HIST' } })
  assert.equal(llamadas[0].url, 'https://graph.facebook.com/v24.0/555/smb_app_data')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), { messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' })
  assert.deepEqual(JSON.parse(String(llamadas[1].init?.body)), { messaging_product: 'whatsapp', sync_type: 'history' })
})

test('verificación: is_on_biz_app y platform_type; campo ausente = null (no false)', async () => {
  const { f, llamadas } = fetchFalso([
    { status: 200, json: { is_on_biz_app: true, platform_type: 'CLOUD_API', id: '555' } },
    { status: 200, json: { id: '555' } },
  ])
  const g = crearClienteGraph({ version: 'v24.0', fetch: f })
  assert.deepEqual(await g.estadoNumero('555', 'T'), { ok: true, datos: { isOnBizApp: true, platformType: 'CLOUD_API' } })
  assert.deepEqual(await g.estadoNumero('555', 'T'), { ok: true, datos: { isOnBizApp: null, platformType: null } })
  assert.equal(llamadas[0].url, 'https://graph.facebook.com/v24.0/555?fields=is_on_biz_app,platform_type')
})

test('cepo: el cliente Graph no tiene NINGUNA llamada de envío de mensajes', async () => {
  const { readFileSync } = await import('node:fs')
  const fuente = readFileSync(new URL('./graph.ts', import.meta.url), 'utf8')
  const codigo = fuente.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.ok(!/\/messages\b/.test(codigo), 'graph.ts no debe llamar a /{phone_number_id}/messages')
  assert.ok(!/\/register\b/.test(codigo), 'en Coexistence el número NO se registra')
})
