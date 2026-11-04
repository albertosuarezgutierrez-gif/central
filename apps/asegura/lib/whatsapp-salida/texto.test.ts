import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { crearEnviador } from './texto.ts'
import type { FetchLike } from '../whatsapp/graph.ts'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

function falso(r: { status: number; json: unknown } | 'red') {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    if (r === 'red') throw new Error('ECONNRESET')
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  return { f, llamadas }
}

const P = { phoneNumberId: '555', token: 'TOKEN-SECRETO', toE164: '+34600123456', texto: 'Recibido, Alberto lo revisa.' }

test('envía TEXTO: POST /{pnid}/messages, sin «+», preview_url false, Bearer', async () => {
  const { f, llamadas } = falso({ status: 200, json: { messages: [{ id: 'wamid.ABC123' }] } })
  const r = await crearEnviador({ version: 'v24.0', fetch: f }).enviarTexto(P)
  assert.deepEqual(r, { ok: true, wamid: 'wamid.ABC123' })
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, 'https://graph.facebook.com/v24.0/555/messages')
  assert.equal(llamadas[0].init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '34600123456', type: 'text', text: { preview_url: false, body: P.texto },
  })
})

test('CEPO error: código de Meta sin token ni número; red caída = error, nunca excepción; UN intento', async () => {
  const e = falso({ status: 400, json: { error: { code: 131047, message: 'Re-engagement message' } } })
  const r = await crearEnviador({ version: 'v24.0', fetch: e.f }).enviarTexto(P)
  assert.deepEqual(r, { ok: false, http: 400, codigo: 131047, incierto: false })
  assert.ok(!JSON.stringify(r).includes('TOKEN') && !JSON.stringify(r).includes('600123456'))
  assert.equal(e.llamadas.length, 1)
  const red = falso('red')
  assert.deepEqual(await crearEnviador({ version: 'v24.0', fetch: red.f }).enviarTexto(P), { ok: false, http: 0, codigo: null, incierto: true })
  assert.equal(red.llamadas.length, 1)
})

test('CEPO entradas raras no llegan a Meta', async () => {
  const { f, llamadas } = falso({ status: 200, json: {} })
  const g = crearEnviador({ version: 'v24.0', fetch: f })
  assert.equal((await g.enviarTexto({ ...P, phoneNumberId: '1/../me' })).ok, false)
  assert.equal((await g.enviarTexto({ ...P, toE164: '+34 600' })).ok, false)
  assert.equal((await g.enviarTexto({ ...P, texto: '   ' })).ok, false)
  assert.equal((await g.enviarTexto({ ...P, texto: 'x'.repeat(1001) })).ok, false)
  assert.equal(llamadas.length, 0)
})

test('CEPO texto.ts: solo `type: text` (ni plantillas, ni media, ni interactivos) y nada de logs', () => {
  const src = sinComentarios(readFileSync(new URL('./texto.ts', import.meta.url), 'utf8'))
  assert.deepEqual([...src.matchAll(/(?<![\w])type:\s*'([a-z_]+)'/g)].map((m) => m[1]), ['text'])
  assert.doesNotMatch(src, /template|interactive|image|document/)
  assert.doesNotMatch(src, /console\./)
})

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'generated') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) ficheros(p, salida)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) salida.push(p)
  }
  return salida
}

test('CEPO: el enviador de texto lo usa SOLO lib/whatsapp/respuesta.ts (la reserva idempotente)', () => {
  const usan = [...ficheros(join(RAIZ, 'lib')), ...ficheros(join(RAIZ, 'app'))]
    .filter((f) => /whatsapp-salida\/texto['.]/.test(sinComentarios(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(RAIZ.length))
  assert.deepEqual(usan, ['lib/whatsapp/respuesta.ts'])
})

test('CEPO incierto: 5xx de Meta = pudo salir (incierto); 4xx = no salió', async () => {
  const cinco = falso({ status: 503, json: { error: { code: 2 } } })
  assert.deepEqual(await crearEnviador({ version: 'v24.0', fetch: cinco.f }).enviarTexto(P), { ok: false, http: 503, codigo: 2, incierto: true })
  assert.equal(cinco.llamadas.length, 1)
})
