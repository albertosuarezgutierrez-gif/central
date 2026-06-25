// Tests del adaptador geminiVision (OCR con imágenes grandes). PURO: fetch inyectable.
// Se ejecuta con el runner de Node (type-stripping): `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { geminiVision } from '../src/gemini.ts'

const IMG = { data: 'AAAA', mediaType: 'image/jpeg' }

test('geminiVision envía inline_data y devuelve el texto', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const fakeFetch = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }) }
  }) as unknown as typeof fetch

  const out = await geminiVision({ apiKey: 'k' }, 'sys', [IMG], 'lee', { fetchImpl: fakeFetch })
  assert.equal(out, '{"ok":true}')
  const contents = calls[0].body.contents as Array<{ parts: Array<Record<string, unknown>> }>
  const part = contents[0].parts.find(p => p.inline_data) as { inline_data: { mime_type: string; data: string } }
  assert.equal(part.inline_data.mime_type, 'image/jpeg')
  assert.equal(part.inline_data.data, 'AAAA')
})

test('geminiVision lanza si no hay apiKey', async () => {
  await assert.rejects(() => geminiVision({ apiKey: '' }, 's', [IMG], 'x'))
})

test('geminiVision lanza si la respuesta viene vacía', async () => {
  const fakeFetch = (async () => ({ ok: true, json: async () => ({ candidates: [] }) })) as unknown as typeof fetch
  await assert.rejects(() => geminiVision({ apiKey: 'k' }, 's', [IMG], 'x', { fetchImpl: fakeFetch }))
})
