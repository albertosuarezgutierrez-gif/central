import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { crearClienteMedia, debeEncolarMedia, decidirDniLeido, maxPolizasDia, mimeAdmitido, urlMediaDeMeta, type FetchLike } from './media.ts'
import { crudoMinimizado, mediaDeMensaje } from './payload.ts'

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
const DIR = new URL('./', import.meta.url)
const fuentes = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

// ── Cepos de NO-ENVÍO (spec §1 y §10.1) ─────────────────────────────────────────

test('CEPO no-envío: ningún fichero de lib/whatsapp llama a /messages ni a /register', () => {
  for (const f of fuentes) {
    const codigo = sinComentarios(readFileSync(new URL(f, DIR), 'utf8'))
    assert.ok(!/\/messages\b/.test(codigo), `${f} llama a /messages`)
    assert.ok(!/\/register\b/.test(codigo), `${f} llama a /register`)
  }
})

test('CEPO no-envío: solo graph.ts y media.ts hablan con graph.facebook.com', () => {
  const conGraph = fuentes.filter((f) => /graph\.facebook\.com/.test(sinComentarios(readFileSync(new URL(f, DIR), 'utf8'))))
  assert.deepEqual(conGraph.sort(), ['graph.ts', 'media.ts'])
})

test('CEPO no-envío: media.ts SOLO hace GET (ni POST/PUT/PATCH/DELETE ni cuerpo)', () => {
  const codigo = sinComentarios(readFileSync(new URL('./media.ts', DIR), 'utf8'))
  assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/i.test(codigo), 'media.ts no puede usar otro método que GET')
  assert.ok(!/\bbody:/.test(codigo), 'media.ts no manda cuerpo')
  assert.ok(/method:\s*'GET'/.test(codigo))
})

test('descarga con fetch falso: dos GET con Bearer, y el segundo SOLO a una URL de Meta', async () => {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    if (llamadas.length === 1) return new Response(JSON.stringify({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', mime_type: 'application/pdf', file_size: 10 }), { status: 200 })
    return new Response(Buffer.from('%PDF-1.4'), { status: 200 })
  }
  const r = await crearClienteMedia({ version: 'v24.0', fetch: f }).descargar('123456', 'TOKEN')
  assert.equal(r.ok, true)
  assert.equal(llamadas.length, 2)
  assert.equal(llamadas[0].url, 'https://graph.facebook.com/v24.0/123456')
  for (const l of llamadas) assert.equal(l.init?.method, 'GET')
})

test('descarga: URL que no es de Meta → el token NO viaja (no hay segunda llamada)', async () => {
  const llamadas: string[] = []
  const f: FetchLike = async (url) => {
    llamadas.push(url)
    return new Response(JSON.stringify({ url: 'https://evil.example.com/x', mime_type: 'application/pdf' }), { status: 200 })
  }
  const r = await crearClienteMedia({ version: 'v24.0', fetch: f }).descargar('123', 'TOKEN')
  assert.deepEqual(r, { ok: false, motivo: 'url_no_meta' })
  assert.equal(llamadas.length, 1)
})

test('descarga: mime fuera de lista o >10 MB → no se descarga', async () => {
  const f = (cuerpo: object): FetchLike => async () => new Response(JSON.stringify(cuerpo), { status: 200 })
  const url = 'https://lookaside.fbsbx.com/x'
  assert.deepEqual(await crearClienteMedia({ version: 'v24.0', fetch: f({ url, mime_type: 'audio/ogg' }) }).descargar('1', 'T'), { ok: false, motivo: 'mime_no_admitido' })
  assert.deepEqual(await crearClienteMedia({ version: 'v24.0', fetch: f({ url, mime_type: 'image/jpeg', file_size: 11 * 1024 * 1024 }) }).descargar('1', 'T'), { ok: false, motivo: 'demasiado_grande' })
  assert.deepEqual(await crearClienteMedia({ version: 'v24.0' }).descargar('../etc', 'T'), { ok: false, motivo: 'id_invalido' })
})

test('URL de Meta: https y dominio de Meta; nada de http ni de dominios parecidos', () => {
  assert.equal(urlMediaDeMeta('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'), true)
  assert.equal(urlMediaDeMeta('http://lookaside.fbsbx.com/x'), false)
  assert.equal(urlMediaDeMeta('https://fbsbx.com.evil.net/x'), false)
  assert.equal(urlMediaDeMeta('https://user:pw@lookaside.fbsbx.com/x'), false)
  assert.equal(urlMediaDeMeta('no es url'), false)
})

// ── Encolado: una ficha exacta o nada, opt-out, mime ────────────────────────────

const MEDIA = { id: '999', mime: 'application/pdf' }

test('CEPO una ficha exacta o nada: sin ficha única no se descarga el media', () => {
  assert.equal(debeEncolarMedia({ direccion: 'entrante', media: MEDIA, fichaUnica: true, optOut: false, personal: false }), true)
  assert.equal(debeEncolarMedia({ direccion: 'entrante', media: MEDIA, fichaUnica: false, optOut: false, personal: false }), false)
})

test('opt-out / personal / saliente / mime fuera de lista → no se descarga', () => {
  assert.equal(debeEncolarMedia({ direccion: 'entrante', media: MEDIA, fichaUnica: true, optOut: true, personal: false }), false)
  assert.equal(debeEncolarMedia({ direccion: 'entrante', media: MEDIA, fichaUnica: true, optOut: false, personal: true }), false)
  assert.equal(debeEncolarMedia({ direccion: 'saliente', media: MEDIA, fichaUnica: true, optOut: false, personal: false }), false)
  assert.equal(debeEncolarMedia({ direccion: 'entrante', media: { id: '1', mime: 'video/mp4' }, fichaUnica: true, optOut: false, personal: false }), false)
  assert.equal(debeEncolarMedia({ direccion: 'entrante', media: null, fichaUnica: true, optOut: false, personal: false }), false)
  assert.equal(mimeAdmitido('image/heic'), true)
})

test('DNI del tomador leído en OTRA ficha → revisar; en la suya o en ninguna → seguir; no comprobable → revisar', () => {
  assert.equal(decidirDniLeido('A', []), 'seguir')
  assert.equal(decidirDniLeido('A', ['A']), 'seguir')
  assert.equal(decidirDniLeido('A', ['B']), 'revisar')
  assert.equal(decidirDniLeido('A', ['A', 'B']), 'revisar')
  assert.equal(decidirDniLeido('A', null), 'revisar')
})

test('tope diario de lecturas: por defecto 10; mal formado → 0 (no se lee)', () => {
  assert.equal(maxPolizasDia({}), 10)
  assert.equal(maxPolizasDia({ ASEGURA_WHATSAPP_POLIZAS_MAX_DIA: '3' }), 3)
  assert.equal(maxPolizasDia({ ASEGURA_WHATSAPP_POLIZAS_MAX_DIA: 'muchas' }), 0)
})

test('payload: el crudo minimizado CONSERVA id/mime/sha256 del media y nada más (ni nombre de fichero ni pie)', () => {
  const crudo = {
    field: 'messages',
    metadata: { phone_number_id: '555' },
    message: { id: 'wamid.X', type: 'document', timestamp: '1', document: { id: '777', mime_type: 'application/pdf', sha256: 'abc', filename: 'poliza Juan Pérez 12345678Z.pdf', caption: 'mi DNI 12345678Z' } },
  }
  const min = crudoMinimizado(crudo) as { message: Record<string, unknown> }
  assert.deepEqual(min.message.media, { id: '777', mime: 'application/pdf', sha256: 'abc' })
  assert.ok(!JSON.stringify(min).includes('12345678Z'))
  assert.equal(mediaDeMensaje({ type: 'audio', audio: { id: '1' } }), null)
  assert.equal(mediaDeMensaje({ type: 'image', image: { id: 'no-numerico' } }), null)
})
