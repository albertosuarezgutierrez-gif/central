import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MEDIADOR } from '@central/module-seguros'
import {
  borradorEditado, botonesPeticion, decidirBotonClp, idDeEdicion, interpretarEnvioPeticion, leerDatosPeticion, lineaTrasEnviar,
  textoBorradorTelegram, textoPedirEdicion,
} from './lead-correduria-peticion.ts'

const CHAT = '12345'

test('🪤 solo la PERSONA autorizada pulsa, con acción conocida e id numérico', () => {
  assert.deepEqual(decidirBotonClp({ from: { id: 12345 } }, 'env', ['7'], CHAT), { ok: true, accion: 'env', id: 7, quien: '12345' })
  assert.equal(decidirBotonClp({ from: { id: 999 } }, 'env', ['7'], CHAT).ok, false, 'otra persona (un grupo) no envía a un cliente')
  assert.equal(decidirBotonClp({ from: { id: 12345 } }, 'env', ['7'], undefined).ok, false, 'sin chat configurado: nadie')
  assert.equal(decidirBotonClp({ from: { id: 12345 } }, 'borrar', ['7'], CHAT).ok, false)
  assert.equal(decidirBotonClp({ from: { id: 12345 } }, 'env', ['7x'], CHAT).ok, false)
  assert.equal(decidirBotonClp({ from: { id: 12345 } }, 'env', ['0'], CHAT).ok, false)
})

test('🪤 callback_data ≤ 64 bytes y sin datos personales: solo el id corto', () => {
  for (const fila of botonesPeticion(123456789012)) for (const b of fila) {
    assert.ok(Buffer.byteLength(b.callback ?? '') <= 64)
    assert.match(b.callback ?? '', /^clp_(env|edt|no):\d+$/)
  }
})

test('🪤 lo que contesta el puerto: lo desconocido es «incierto», nunca «no salió»', () => {
  assert.equal(interpretarEnvioPeticion(200, { estado: 'enviado', historial: true, hilo: 'ok' }).estado, 'enviado')
  assert.equal(interpretarEnvioPeticion(409, { estado: 'email_no_es_de_la_ficha' }).estado, 'no_enviado')
  assert.equal(interpretarEnvioPeticion(502, { estado: 'rechazado', motivo: 'x' }).estado, 'no_enviado')
  assert.equal(interpretarEnvioPeticion(500, { estado: 'error' }).estado, 'incierto')
  assert.equal(interpretarEnvioPeticion(502, { motivo: 'red' }).estado, 'incierto', 'un corte de red tras pedirlo puede haber salido')
  assert.equal(interpretarEnvioPeticion(200, { estado: 'raro' }).estado, 'incierto')
  assert.match(lineaTrasEnviar({ estado: 'incierto', motivo: 'red' }), /No sé si ha salido/)
  assert.match(lineaTrasEnviar({ estado: 'enviado', historial: false, hilo: 'ok' }), /no lo repitas/)
})

test('datos del pendiente: algo raro = null (no se envía)', () => {
  const ok = { clienteId: '11111111-1111-4111-8111-111111111111', oportunidadIds: ['x', '22222222-2222-4222-8222-222222222222'], to: 'a@b.es', asunto: 'Re: x', messageId: '<m@x.es>', references: ['<r@x.es>', 'mal'], pila: 'Ana', ramos: ['hogar'] }
  const d = leerDatosPeticion(ok)
  assert.deepEqual(d?.oportunidadIds, ['22222222-2222-4222-8222-222222222222'])
  assert.deepEqual(d?.references, ['<r@x.es>'])
  assert.equal(leerDatosPeticion({ ...ok, messageId: 'sin-angulos' }), null)
  assert.equal(leerDatosPeticion({ ...ok, clienteId: 'x' }), null)
  assert.equal(leerDatosPeticion(null), null)
})

test('🪤 ✏️: la edición sin pie legal lo recibe; la marca se reconoce', () => {
  const t = borradorEditado('Hola Ana: mándame la matrícula y la fecha del carné, por favor.')!
  assert.ok(t.includes(MEDIADOR.identidad.claveDgsfp), 'la información previa del mediador va SIEMPRE')
  assert.ok(t.includes('/legal/privacidad'))
  assert.equal(borradorEditado('ok'), null)
  assert.equal(idDeEdicion(textoPedirEdicion(42)), 42)
  assert.equal(idDeEdicion('otra cosa'), null)
})

test('el mensaje de Telegram: nombre de pila, ramos y conteo; el borrador plegado y escapado', () => {
  const t = textoBorradorTelegram({ id: 9, datos: { pila: 'Ana <b>', ramos: ['hogar', 'vida'], asunto: 'Re: x' }, borrador: 'Hola <Ana>', preguntas: 11 })
  assert.match(t, /pidiéndole 11 datos/)
  assert.match(t, /hogar, vida/)
  assert.ok(!t.includes('<b>Ana <b>'))
  assert.match(t, /<blockquote expandable>/)
  assert.ok(t.length < 4096)
})

test('🪤 el ✅ es de un solo uso y el envío va por el puerto con idempotencia (lee el fuente)', () => {
  const src = readFileSync(new URL('./lead-correduria-pendiente.ts', import.meta.url), 'utf8')
  assert.match(src, /SET estado = 'enviando'[\s\S]{0,200}WHERE id = \$\{d\.id\} AND tipo NOT IN \('tarificar', 'discrepancia', 'propuesta'\) AND estado = 'pendiente' AND caduca_at > now\(\)/)
  assert.match(src, /idempotencia: `clp-\$\{d\.id\}`/)
  const hook = readFileSync(new URL('../../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(hook, /if \(prefix === PREFIJO_CLP\) \{\s*const d = decidirBotonClp\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
})

test('🪤 un pendiente CERRADO (enviado, descartado, caducado) se purga: sin email, asunto, nombre ni texto (lee el fuente)', async () => {
  const { CLAVES_PII_PENDIENTE } = await import('./lead-correduria-peticion.ts')
  assert.deepEqual([...CLAVES_PII_PENDIENTE].sort(), ['asunto', 'pila', 'to'])
  const src = readFileSync(new URL('./lead-correduria-pendiente.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  assert.match(src, /const PURGA = Prisma\.sql`datos = datos - \$\{\[\.\.\.CLAVES_PII_PENDIENTE\]\}::text\[\], borrador = ''`/)
  const cierres = [...src.matchAll(/UPDATE correduria_pendiente_tg SET estado = '(descartado|caducado)'[^`]*/g)]
  assert.ok(cierres.length >= 4, `esperaba ≥4 cierres descartado/caducado, hay ${cierres.length}`)
  for (const c of cierres) assert.match(c[0], /\$\{PURGA\}/, `cierre sin purga: ${c[0].slice(0, 120)}`)
  // El cierre tras ✅ purga según `purgaAlCerrar` (enviado: todo; fallido/incierto: sin email ni nombre).
  assert.match(src, /resultado = \$\{JSON\.stringify\(resultado \?\? null\)\}::jsonb\$\{purgaDe\('peticion_datos', estado\)\}/)
  assert.match(src, /await purgarCaducados\(\)/)
})

test('🪤 reintento deduplicado (repetido) → «ya enviado antes», nunca «no se pudo anotar»; hilo sin oportunidad / sin tabla → aviso breve', () => {
  const rep = interpretarEnvioPeticion(200, { estado: 'enviado', historial: false, repetido: true, hilo: 'ok' })
  const l1 = lineaTrasEnviar(rep)
  assert.match(l1, /ya enviado antes, no se repite/)
  assert.doesNotMatch(l1, /No se pudo anotar/)
  assert.match(lineaTrasEnviar(interpretarEnvioPeticion(200, { estado: 'enviado', historial: false, hilo: 'ok' })), /No se pudo anotar/)
  assert.match(lineaTrasEnviar(interpretarEnvioPeticion(200, { estado: 'enviado', historial: true, hilo: 'sin_oportunidad' })), /oportunidad/i)
  assert.match(lineaTrasEnviar(interpretarEnvioPeticion(200, { estado: 'enviado', historial: true, hilo: 'sin_tabla' })), /SQL del hilo/)
  assert.doesNotMatch(lineaTrasEnviar(interpretarEnvioPeticion(200, { estado: 'enviado', historial: true, hilo: 'ok' })), /oportunidad|SQL/)
})

test('🪤 F3b: al cerrar, fallido/incierto ya NO guardan email ni nombre; lo que no envía al cliente se purga entero', async () => {
  const { purgaAlCerrar } = await import('./lead-correduria-peticion.ts')
  assert.deepEqual(purgaAlCerrar('peticion_datos', 'enviado'), { claves: ['to', 'asunto', 'pila'], borrador: true })
  assert.deepEqual(purgaAlCerrar('repregunta', 'fallido'), { claves: ['to', 'pila'], borrador: false })
  assert.deepEqual(purgaAlCerrar('peticion_datos', 'incierto'), { claves: ['to', 'pila'], borrador: false })
  assert.deepEqual(purgaAlCerrar('tarificar', 'fallido'), { claves: ['to', 'asunto', 'pila'], borrador: true })
  assert.deepEqual(purgaAlCerrar('tarificar', 'incierto'), { claves: ['to', 'asunto', 'pila'], borrador: true })
  assert.deepEqual(purgaAlCerrar('discrepancia', 'enviado'), { claves: ['to', 'asunto', 'pila'], borrador: true })
  const tar = readFileSync(new URL('./lead-correduria-tarificar-proceso.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  assert.match(tar, /const p = purgaAlCerrar\('tarificar', estado\)[^`]*`[^`]*datos = datos - \$\{p\.claves\}::text\[\], borrador = ''/)
})

test('🪤 F3b: botones de fallo y de discrepancia solo para el titular y con forma cerrada', () => {
  assert.deepEqual(decidirBotonClp({ from: { id: 12345 } }, 'fal', ['7'], '12345'), { ok: true, accion: 'fal', id: 7, quien: '12345' })
  assert.deepEqual(decidirBotonClp({ from: { id: 12345 } }, 'dis', ['7', '2', 'c'], '12345'), { ok: true, accion: 'dis', id: 7, indice: 2, eleccion: 'correo', quien: '12345' })
  assert.equal(decidirBotonClp({ from: { id: 12345 } }, 'dis', ['7', '2', 'x'], '12345').ok, false)
  assert.equal(decidirBotonClp({ from: { id: 999 } }, 'dis', ['7', '0', 'f'], '12345').ok, false)
  assert.equal(decidirBotonClp({ from: { id: 999 } }, 'fal', ['7'], '12345').ok, false)
})
