import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PREFIJO_CRV, decidirBotonCrv, lineaTrasPublicarCrv } from './renovacion-asegura.ts'

const P = '11111111-1111-4111-8111-111111111111'

test('✅ de la renovación: solo el titular exacto, la acción `pub` y un uuid', () => {
  assert.equal(decidirBotonCrv({ from: { id: 5 } }, 'pub', [P], undefined).ok, false, 'sin chat configurado, nadie')
  assert.equal(decidirBotonCrv({ from: { id: 6 } }, 'pub', [P], '5').ok, false)
  assert.equal(decidirBotonCrv({ from: { id: 5 } }, 'pub', ['no-uuid'], '5').ok, false)
  assert.equal(decidirBotonCrv({ from: { id: 5 } }, 'emitir', [P], '5').ok, false, 'el botón no emite')
  assert.deepEqual(decidirBotonCrv({ from: { id: 5 } }, 'pub', [P.toUpperCase()], '5'), { ok: true, presupuestoId: P, canal: 'app' })
  // 05/11/2026: ✅ por correo / WhatsApp cuando nadie elige en la app (misma puerta del titular).
  assert.deepEqual(decidirBotonCrv({ from: { id: 5 } }, 'cor', [P], '5'), { ok: true, presupuestoId: P, canal: 'email' })
  assert.deepEqual(decidirBotonCrv({ from: { id: 5 } }, 'wa', [P], '5'), { ok: true, presupuestoId: P, canal: 'whatsapp_enlace' })
  assert.equal(decidirBotonCrv({ from: { id: 6 } }, 'wa', [P], '5').ok, false)
  assert.equal(decidirBotonCrv({ from: { id: 5 } }, 'toString', [P], '5').ok, false)
})

test('los callbacks de correo y WhatsApp son los MISMOS que emite asegura; el wa.me solo si lo es', async () => {
  const { whatsappDe } = await import('./renovacion-asegura.ts')
  const asegura = readFileSync(new URL('../../asegura/lib/renovacion-alternativas-reglas.ts', import.meta.url), 'utf8')
  assert.match(asegura, /CALLBACK_CORREO = `\$\{PREFIJO_RENOVACION_TG\}_cor`/)
  assert.match(asegura, /CALLBACK_WHATSAPP = `\$\{PREFIJO_RENOVACION_TG\}_wa`/)
  assert.equal(whatsappDe({ status: 200, json: { estado: 'enlace', whatsapp: 'https://wa.me/34600000000?text=x' } }), 'https://wa.me/34600000000?text=x')
  assert.equal(whatsappDe({ status: 200, json: { estado: 'enlace', whatsapp: 'javascript:alert(1)' } }), null)
  const ruta = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const i = ruta.indexOf('if (prefix === PREFIJO_CRV)')
  assert.match(ruta.slice(i, i + 3000), /canal: d\.canal/)
})

test('el prefijo y la acción son los MISMOS que emite asegura (callback_data ≤ 64 bytes)', () => {
  const asegura = readFileSync(new URL('../../asegura/lib/renovacion-alternativas-reglas.ts', import.meta.url), 'utf8')
  assert.match(asegura, new RegExp(`PREFIJO_RENOVACION_TG = '${PREFIJO_CRV}'`))
  assert.match(asegura, /CALLBACK_PUBLICAR = `\$\{PREFIJO_RENOVACION_TG\}_pub`/)
  assert.ok(Buffer.byteLength(`${PREFIJO_CRV}_pub:${P}`) <= 64)
})

test('503 canal_no_disponible ≠ fallo; un estado desconocido NO se pinta como publicado', () => {
  assert.match(lineaTrasPublicarCrv('canal_no_disponible'), /Nadie que pueda elegir usa la app/)
  assert.match(lineaTrasPublicarCrv('http_502'), /No sé si se ha publicado/)
  assert.doesNotMatch(lineaTrasPublicarCrv('http_502'), /✅/)
})

test('el webhook enruta `crv` con la puerta del titular y sin reintentar', () => {
  const ruta = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const i = ruta.indexOf('if (prefix === PREFIJO_CRV)')
  assert.ok(i > 0)
  const bloque = ruta.slice(i, ruta.indexOf('return NextResponse.json({ ok: true })\n    }', i))
  assert.match(bloque, /decidirBotonCrv\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
  assert.match(bloque, /telegramMessageId: mensajeId/)
  assert.equal((bloque.match(/publicarRenovacionAsegura\(/g) ?? []).length, 1, 'una sola llamada: no se reintenta')
})

test('🪤 publicar dice SU vía: Telegram (asegura exige el message_id) o la pantalla con sesión', () => {
  const lib = readFileSync(new URL('./renovacion-asegura.ts', import.meta.url), 'utf8')
  assert.match(lib, /via: e\.via/)
  const ruta = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const i = ruta.indexOf('if (prefix === PREFIJO_CRV)')
  assert.match(ruta.slice(i, i + 2500), /via: 'telegram'/)
  const pantalla = readFileSync(new URL('../app/api/correduria/renovacion/publicar/route.ts', import.meta.url), 'utf8')
  assert.match(pantalla, /via: 'pantalla'/)
})
