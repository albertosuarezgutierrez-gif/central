import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCallback } from '@central/core-telegram'
import { PREFIJO_WAP, actorTitular, decidirBotonWap, lineaTrasPulsarWap, resolverPropuestaEnAsegura } from './whatsapp-propuesta-tg.ts'

const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const CUENTA = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'
const CHAT = '12345'
const cb = (from: unknown) => ({ from: { id: from } })

test('parseo: los callbacks de asegura (`wap_ok:<uuid>` / `wap_no:<uuid>`) llegan con prefijo wap', () => {
  const ok = parseCallback(`wap_ok:${ID}`)
  assert.equal(ok.prefix, PREFIJO_WAP)
  assert.deepEqual(decidirBotonWap(cb(CHAT), ok.action, ok.args, CHAT), { ok: true, id: ID, decision: 'aplicar' })
  const no = parseCallback(`wap_no:${ID.toUpperCase()}`)
  assert.deepEqual(decidirBotonWap(cb(CHAT), no.action, no.args, CHAT), { ok: true, id: ID, decision: 'descartar' })
})

test('parseo: acción o id raros → botón no válido', () => {
  assert.equal(decidirBotonWap(cb(CHAT), 'si', [ID], CHAT).ok, false)
  assert.equal(decidirBotonWap(cb(CHAT), 'ok', ['no-es-uuid'], CHAT).ok, false)
  assert.equal(decidirBotonWap(cb(CHAT), 'ok', [ID, 'extra'], CHAT).ok, false)
  assert.equal(decidirBotonWap(cb(CHAT), 'ok', [], CHAT).ok, false)
})

test('solo el titular: otro from.id o sin chat configurado → no', () => {
  assert.deepEqual(decidirBotonWap(cb('999'), 'ok', [ID], CHAT), { ok: false, toast: 'Solo el titular puede hacerlo' })
  assert.equal(decidirBotonWap(cb(CHAT), 'ok', [ID], undefined).ok, false)
  assert.equal(decidirBotonWap(cb(undefined), 'ok', [ID], CHAT).ok, false)
})

test('actorTitular: humano:<uuid> o null', () => {
  assert.equal(actorTitular(CUENTA), `humano:${CUENTA}`)
  assert.equal(actorTitular(null), null)
  assert.equal(actorTitular('alberto@correo.es'), null)
})

function fetchFalso(status: number, json: unknown) {
  const llamadas: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init })
    return new Response(JSON.stringify(json), { status })
  }) as unknown as typeof fetch
  return { f, llamadas }
}
const ENTORNO = { secret: 's3', base: 'https://asegura.test/' }

test('actor: llama a asegura con Bearer y x-actor humano:<cuenta>, y el cuerpo {id, decision}', async () => {
  const { f, llamadas } = fetchFalso(200, { estado: 'aplicada' })
  const r = await resolverPropuestaEnAsegura({ id: ID, decision: 'aplicar', actor: `humano:${CUENTA}` }, ENTORNO, f)
  assert.deepEqual(r, { status: 200, estado: 'aplicada' })
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, 'https://asegura.test/api/operador/whatsapp/propuesta')
  const h = llamadas[0].init.headers as Record<string, string>
  assert.equal(h.Authorization, 'Bearer s3')
  assert.equal(h['x-actor'], `humano:${CUENTA}`)
  assert.deepEqual(JSON.parse(String(llamadas[0].init.body)), { id: ID, decision: 'aplicar' })
})

// 🚨 Cepo: sin x-actor humano NO se aplica (ni siquiera se llama a asegura).
test('cepo: sin actor humano no se llama a asegura', async () => {
  for (const actor of [null, 'sistema:plataforma', 'agente:asistente-telegram', 'humano:alberto']) {
    const { f, llamadas } = fetchFalso(200, { estado: 'aplicada' })
    const r = await resolverPropuestaEnAsegura({ id: ID, decision: 'aplicar', actor }, ENTORNO, f)
    assert.equal(r.estado, 'sin_actor', `actor ${actor}`)
    assert.equal(llamadas.length, 0, `actor ${actor} no debe llamar`)
  }
})

test('respuestas de asegura: 409 ya resuelta y 410 caducada se pintan como tales', async () => {
  const r409 = await resolverPropuestaEnAsegura({ id: ID, decision: 'aplicar', actor: `humano:${CUENTA}` }, ENTORNO, fetchFalso(409, { estado: 'ya_resuelta' }).f)
  assert.deepEqual(r409, { status: 409, estado: 'ya_resuelta' })
  assert.match(lineaTrasPulsarWap('aplicar', r409), /Ya estaba resuelta/)
  const r410 = await resolverPropuestaEnAsegura({ id: ID, decision: 'aplicar', actor: `humano:${CUENTA}` }, ENTORNO, fetchFalso(410, { estado: 'caducada' }).f)
  assert.match(lineaTrasPulsarWap('aplicar', r410), /Caducada/)
})

test('líneas: aplicada, descartada, sin actor, red', () => {
  assert.match(lineaTrasPulsarWap('aplicar', { status: 200, estado: 'aplicada' }), /✅/)
  assert.match(lineaTrasPulsarWap('descartar', { status: 200, estado: 'descartada' }), /❌/)
  assert.match(lineaTrasPulsarWap('aplicar', { status: 0, estado: 'sin_actor' }), /no se aplica nada/)
  assert.match(lineaTrasPulsarWap('aplicar', { status: 502, estado: 'red' }), /Sigue pendiente/)
})

test('sin secreto o con la red caída: no lanza', async () => {
  assert.equal((await resolverPropuestaEnAsegura({ id: ID, decision: 'aplicar', actor: `humano:${CUENTA}` }, {}, fetchFalso(200, {}).f)).estado, 'puerto_sin_configurar')
  const roto = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
  assert.deepEqual(await resolverPropuestaEnAsegura({ id: ID, decision: 'aplicar', actor: `humano:${CUENTA}` }, ENTORNO, roto), { status: 502, estado: 'red' })
})
