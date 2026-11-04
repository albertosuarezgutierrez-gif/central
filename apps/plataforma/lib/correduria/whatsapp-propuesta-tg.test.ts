import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCallback } from '@central/core-telegram'
import { readFileSync } from 'node:fs'
import { cuerpoEditMessage } from '@central/core-telegram'
import { ACCIONES_WAP, mensajeOriginalDeCorreccionWap, resueltaParaQuitarBotones, PREFIJO_WAP, actorTitular, decidirBotonWap, idDeCorreccionWap, lineaTrasPulsarWap, resolverPropuestaEnAsegura, textoPedirCorreccionWap } from './whatsapp-propuesta-tg.ts'

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
  assert.equal(decidirBotonWap(cb(CHAT), 'xx', [ID], CHAT).ok, false)
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

// ── Aprendizaje y autonomía (✏️ wap_ed, ↩️ wap_un) ───────────────────────────────

test('wap_ed y wap_un: se parsean y se mapean a modificar / deshacer', () => {
  const ed = parseCallback(`wap_ed:${ID}`)
  assert.equal(ed.prefix, PREFIJO_WAP)
  assert.deepEqual(decidirBotonWap(cb(CHAT), ed.action, ed.args, CHAT), { ok: true, id: ID, decision: 'modificar' })
  const un = parseCallback(`wap_un:${ID}`)
  assert.deepEqual(decidirBotonWap(cb(CHAT), un.action, un.args, CHAT), { ok: true, id: ID, decision: 'deshacer' })
  assert.deepEqual([...ACCIONES_WAP], ['ok', 'no', 'ed', 'un', 'si'])
})

test('wap_si (🔇 silenciar la IA en una conversación): solo el titular, se mapea a silenciar y dice qué pasó', () => {
  const si = parseCallback(`wap_si:${ID}`)
  assert.deepEqual(decidirBotonWap(cb(CHAT), si.action, si.args, CHAT), { ok: true, id: ID, decision: 'silenciar' })
  assert.deepEqual(decidirBotonWap(cb('999'), si.action, si.args, CHAT), { ok: false, toast: 'Solo el titular puede hacerlo' })
  assert.match(lineaTrasPulsarWap('silenciar', { status: 200, estado: 'silenciada' }), /silenciada/)
  assert.match(lineaTrasPulsarWap('silenciar', { status: 503, estado: 'sin_migracion' }), /No se ha podido silenciar|asegura no está lista/)
})

test('CEPO ↩️ deshacer y ✏️ modificar: solo el titular (otro from.id o sin chat → no)', () => {
  for (const accion of ['un', 'ed']) {
    assert.deepEqual(decidirBotonWap(cb('999'), accion, [ID], CHAT), { ok: false, toast: 'Solo el titular puede hacerlo' }, accion)
    assert.equal(decidirBotonWap(cb(CHAT), accion, [ID], undefined).ok, false, accion)
    assert.equal(decidirBotonWap(cb(CHAT), accion, [ID], '').ok, false, accion)
  }
})

test('✏️: la marca liga la respuesta a su propuesta y nada más', () => {
  assert.equal(idDeCorreccionWap(textoPedirCorreccionWap(ID)), ID)
  assert.equal(idDeCorreccionWap('[wap 123]'), null)
  assert.equal(idDeCorreccionWap(`[rrc ${ID}]`), null)
  assert.equal(idDeCorreccionWap(null), null)
})

test('modificar manda la corrección; deshacer solo el id; sin actor humano no se llama', async () => {
  const mod = fetchFalso(200, { estado: 'modificada' })
  const r = await resolverPropuestaEnAsegura({ id: ID, decision: 'modificar', correccion: '20/11/2026', actor: `humano:${CUENTA}` }, ENTORNO, mod.f)
  assert.deepEqual(r, { status: 200, estado: 'modificada' })
  assert.deepEqual(JSON.parse(String(mod.llamadas[0].init.body)), { id: ID, decision: 'modificar', correccion: '20/11/2026' })
  const des = fetchFalso(200, { estado: 'deshecha' })
  await resolverPropuestaEnAsegura({ id: ID, decision: 'deshacer', actor: `humano:${CUENTA}` }, ENTORNO, des.f)
  assert.deepEqual(JSON.parse(String(des.llamadas[0].init.body)), { id: ID, decision: 'deshacer' })
  for (const decision of ['deshacer', 'modificar'] as const) {
    const x = fetchFalso(200, {})
    const res = decision === 'modificar'
      ? await resolverPropuestaEnAsegura({ id: ID, decision, correccion: 'x', actor: 'agente:whatsapp-ia-autonomo' }, ENTORNO, x.f)
      : await resolverPropuestaEnAsegura({ id: ID, decision, actor: 'agente:whatsapp-ia-autonomo' }, ENTORNO, x.f)
    assert.equal(res.estado, 'sin_actor')
    assert.equal(x.llamadas.length, 0)
  }
})

test('líneas de deshacer y modificar no afirman lo que no consta', () => {
  assert.match(lineaTrasPulsarWap('deshacer', { status: 200, estado: 'deshecha' }), /Deshecha/)
  assert.match(lineaTrasPulsarWap('deshacer', { status: 409, estado: 'ya_deshecha' }), /Ya estaba deshecha/)
  assert.match(lineaTrasPulsarWap('deshacer', { status: 409, estado: 'cambiado_despues' }), /no se pisa/)
  assert.doesNotMatch(lineaTrasPulsarWap('deshacer', { status: 500, estado: 'fallo_al_deshacer' }), /Deshecha/)
  assert.match(lineaTrasPulsarWap('modificar', { status: 200, estado: 'modificada' }), /corrección/)
  assert.match(lineaTrasPulsarWap('modificar', { status: 422, estado: 'correccion_invalida' }), /no he cambiado nada/)
})

test('CEPO webhook: la respuesta ✏️ comprueba el chat autorizado ANTES de llamar a asegura', () => {
  const webhook = readFileSync(new URL('../../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const resp = webhook.slice(webhook.indexOf('const wapEdit = idDeCorreccionWap('))
  const guarda = resp.indexOf("String(msg.from?.id ?? '') === String(process.env.TELEGRAM_CHAT_ID ?? '')")
  assert.ok(guarda > 0 && guarda < resp.indexOf('resolverPropuestaEnAsegura('))
  const rama = webhook.slice(webhook.indexOf('if (prefix === PREFIJO_WAP)'))
  assert.ok(rama.indexOf('decidirBotonWap(cb, action, args, process.env.TELEGRAM_CHAT_ID)') < rama.indexOf('tgAskForReply(textoPedirCorreccionWap('))
})

test('✏️: la marca lleva el id del mensaje original y sigue ligando la propuesta', () => {
  const t = textoPedirCorreccionWap(ID, 4321)
  assert.equal(idDeCorreccionWap(t), ID)
  assert.equal(mensajeOriginalDeCorreccionWap(t), 4321)
  assert.equal(mensajeOriginalDeCorreccionWap(textoPedirCorreccionWap(ID)), null)
  assert.equal(mensajeOriginalDeCorreccionWap(textoPedirCorreccionWap(ID, 0)), null)
  assert.equal(mensajeOriginalDeCorreccionWap(null), null)
})

test('al resolver (aplicar, descartar, modificar, deshacer, 409/410/404) se quitan los botones; pendiente → se conservan', () => {
  for (const r of [{ status: 200, estado: 'aplicada' }, { status: 200, estado: 'descartada' }, { status: 200, estado: 'modificada' }, { status: 200, estado: 'deshecha' }, { status: 409, estado: 'x' }, { status: 410, estado: 'x' }, { status: 404, estado: 'x' }]) {
    assert.equal(resueltaParaQuitarBotones(r), true, JSON.stringify(r))
  }
  for (const r of [{ status: 422, estado: 'correccion_invalida' }, { status: 502, estado: 'red' }, { status: 503, estado: 'x' }, { status: 0, estado: 'sin_actor' }]) {
    assert.equal(resueltaParaQuitarBotones(r), false, JSON.stringify(r))
  }
})

test('CEPO botones: la edición del mensaje tras resolver NO lleva inline_keyboard (con botones sí)', () => {
  const sin = cuerpoEditMessage('1', 7, 'texto\n\n✅ Aplicada')
  assert.equal('reply_markup' in sin, false)
  assert.equal(JSON.stringify(sin).includes('inline_keyboard'), false)
  assert.ok(JSON.stringify(cuerpoEditMessage('1', 7, 't', [[{ texto: 'a', callback: 'wap_ok:x' }]])).includes('inline_keyboard'))
  // Las ediciones de la rama wap_ del webhook van sin `botones`.
  const webhook = readFileSync(new URL('../../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const rama = webhook.slice(webhook.indexOf('if (prefix === PREFIJO_WAP)'), webhook.indexOf('if (prefix === PREFIJO_RRC)'))
  assert.ok(rama.includes('tgEditMessage(mensajeId,'))
  assert.equal(/botones\s*:/.test(rama), false)
  assert.ok(webhook.includes('tgQuitarBotones(originalId)'))
})
