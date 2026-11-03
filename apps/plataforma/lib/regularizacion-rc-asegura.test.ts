// Botones 📑 de la regularización de RC (rrc_env / rrc_mod / rrc_no, 03/11/2026): solo el titular, bien formados y cableados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PREFIJO_RRC, decidirBotonRrc, decidirRrcCompaniaEnAsegura, idDeEdicionRrc, idDeEdicionRrcCompania, lineaTrasPulsarRrc, textoPedirEdicionRrc, textoPedirEdicionRrcCompania } from './regularizacion-rc-asegura.ts'

const ID = '3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'

test('🚨 solo pulsa el titular (from.id exacto); sin chat configurado, nadie; versión obligatoria', () => {
  assert.equal(decidirBotonRrc({ from: { id: 999 } }, 'env', [ID, '1'], '123').ok, false)
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'env', [ID, '1'], undefined).ok, false)
  assert.deepEqual(decidirBotonRrc({ from: { id: 123 } }, 'env', [ID, '2'], '123'), { ok: true, accion: 'env', id: ID, version: 2 })
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'env', [ID], '123').ok, false, 'sin versión no hay ✅')
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'enviar', [ID, '1'], '123').ok, false)
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'no', ['x', '1'], '123').ok, false)
})

test('el prefijo es el mismo que emite asegura y el webhook comprueba al titular ANTES de llamar a asegura', () => {
  const tg = readFileSync(new URL('../../asegura/lib/regularizacion-rc-telegram.ts', import.meta.url), 'utf8')
  assert.match(tg, new RegExp(`PREFIJO_RRC = '${PREFIJO_RRC}'`))
  const webhook = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const rama = webhook.slice(webhook.indexOf('if (prefix === PREFIJO_RRC)'))
  const comprueba = rama.indexOf('decidirBotonRrc(cb, action, args, process.env.TELEGRAM_CHAT_ID)')
  assert.ok(comprueba >= 0 && comprueba < rama.indexOf('decidirRrcEnAsegura('))
  // La respuesta de texto (✏️) también exige el chat autorizado antes de editar en asegura.
  const resp = webhook.slice(webhook.indexOf('const rrcEdit = idDeEdicionRrc('))
  assert.ok(resp.indexOf("String(msg.from?.id ?? '') === String(process.env.TELEGRAM_CHAT_ID ?? '')") < resp.indexOf('editarRrcEnAsegura('))
})

test('✏️: la marca liga la respuesta a su solicitud y nada más', () => {
  assert.equal(idDeEdicionRrc(textoPedirEdicionRrc(ID)), ID)
  assert.equal(idDeEdicionRrc('otra cosa [rrc 123]'), null)
  assert.equal(idDeEdicionRrc(null), null)
})

test('la línea tras pulsar no afirma un envío que no consta; 503 ≠ 502', () => {
  assert.match(lineaTrasPulsarRrc('enviada'), /enviado/)
  assert.doesNotMatch(lineaTrasPulsarRrc('HTTP 500'), /enviado al cliente/)
  assert.doesNotMatch(lineaTrasPulsarRrc('<b>x'), /<b>/)
  assert.notEqual(lineaTrasPulsarRrc('canal_no_disponible'), lineaTrasPulsarRrc('envio_fallido'))
  assert.match(lineaTrasPulsarRrc('canal_no_disponible'), /NO ha salido/)
})

// ── Fase 3: respuesta a la COMPAÑÍA (rrc_cenv / rrc_cmod / rrc_res, 03/11/2026) ──

test('🚨 fase 3: ✅ a la compañía y 🏁 solo los pulsa el titular; versión obligatoria', () => {
  for (const a of ['cenv', 'cmod', 'res']) {
    assert.equal(decidirBotonRrc({ from: { id: 999 } }, a, [ID, '1'], '123').ok, false, a)
    assert.equal(decidirBotonRrc({ from: { id: 123 } }, a, [ID, '1'], '').ok, false, a)
    assert.deepEqual(decidirBotonRrc({ from: { id: 123 } }, a, [ID, '3'], '123'), { ok: true, accion: a, id: ID, version: 3 })
    assert.equal(decidirBotonRrc({ from: { id: 123 } }, a, [ID], '123').ok, false)
  }
})

test('fase 3: el webhook comprueba al titular antes de llamar a asegura (botón y respuesta «Para:»)', () => {
  const webhook = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const rama = webhook.slice(webhook.indexOf('if (prefix === PREFIJO_RRC)'))
  assert.ok(rama.indexOf('decidirBotonRrc(cb, action, args, process.env.TELEGRAM_CHAT_ID)') < rama.indexOf('decidirRrcCompaniaEnAsegura('))
  const resp = webhook.slice(webhook.indexOf('const rrccEdit = idDeEdicionRrcCompania('))
  assert.ok(resp.indexOf("String(msg.from?.id ?? '') === String(process.env.TELEGRAM_CHAT_ID ?? '')") < resp.indexOf('editarRrcCompaniaEnAsegura('))
  // asegura emite exactamente estas acciones con el mismo prefijo.
  const tg = readFileSync(new URL('../../asegura/lib/regularizacion-rc-telegram.ts', import.meta.url), 'utf8')
  for (const a of ['cenv', 'cmod', 'res']) assert.match(tg, new RegExp(`\\$\\{PREFIJO_RRC\\}_${a}:`))
})

test('fase 3: la marca de edición de la compañía no se confunde con la del cliente', () => {
  assert.equal(idDeEdicionRrcCompania(textoPedirEdicionRrcCompania(ID)), ID)
  assert.equal(idDeEdicionRrc(textoPedirEdicionRrcCompania(ID)), null, 'la edición de la compañía no va al correo del cliente')
  assert.equal(idDeEdicionRrcCompania(textoPedirEdicionRrc(ID)), null)
})

test('fase 3: las líneas no afirman un envío que no consta; sin dirección lo dice', () => {
  assert.match(lineaTrasPulsarRrc('enviada_compania'), /enviada a la compañía/)
  assert.match(lineaTrasPulsarRrc('sin_destino_compania'), /Falta dirección/)
  assert.match(lineaTrasPulsarRrc('sin_destino_compania'), /NO ha salido/)
  assert.doesNotMatch(lineaTrasPulsarRrc('enviada'), /compañía/)
  assert.match(lineaTrasPulsarRrc('resuelta'), /resuelta/)
  assert.equal(typeof decidirRrcCompaniaEnAsegura, 'function')
})

test('🪤 línea del aviso en la app: solo con enviada, y nunca afirma un envío que no consta', async () => {
  const { lineaPushRrc } = await import('./regularizacion-rc-asegura.ts')
  assert.equal(lineaPushRrc('envio_fallido', { estado: 'enviado', dispositivos: 2 }), null)
  assert.equal(lineaPushRrc('canal_no_disponible', null), null)
  assert.match(lineaPushRrc('enviada', { estado: 'enviado', dispositivos: 2 })!, /enviado a 2 dispositivos/)
  assert.match(lineaPushRrc('enviada', { estado: 'enviado', dispositivos: 1 })!, /enviado a 1 dispositivo\./)
  assert.match(lineaPushRrc('enviada', { estado: 'sin_app' })!, /no tiene la app activada/)
  assert.match(lineaPushRrc('enviada', { estado: 'no_se_pudo', causa: 'HTTP 503' })!, /no se pudo/)
  for (const raro of [null, undefined, {}, { estado: 'enviado' }, { estado: '<b>x' }, 'enviado']) {
    assert.doesNotMatch(lineaPushRrc('enviada', raro)!, /enviado a \d/, JSON.stringify(raro))
  }
  assert.doesNotMatch(lineaPushRrc('enviada', { estado: 'no_se_pudo', causa: '<script>' })!, /<script>/)
})
