// Tests del adaptador geminiEmbed (embeddings para la caché semántica). PURO: fetch inyectable.
// Se ejecuta con el runner de Node: `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { geminiEmbed } from '../src/embeddings.ts'

test('geminiEmbed manda el texto y devuelve el vector', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const fakeFetch = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }) }
  }) as unknown as typeof fetch

  const out = await geminiEmbed({ apiKey: 'k' }, 'hola mundo', { fetchImpl: fakeFetch })
  assert.deepEqual(out, [0.1, 0.2, 0.3])
  assert.ok(calls[0].url.includes('text-embedding-004:embedContent'))
  const content = calls[0].body.content as { parts: Array<{ text: string }> }
  assert.equal(content.parts[0].text, 'hola mundo')
})

test('geminiEmbed lanza sin apiKey, con texto vacío y con respuesta sin vector', async () => {
  await assert.rejects(() => geminiEmbed({ apiKey: '' }, 'x'))
  await assert.rejects(() => geminiEmbed({ apiKey: 'k' }, '   '))
  const fakeFetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
  await assert.rejects(() => geminiEmbed({ apiKey: 'k' }, 'x', { fetchImpl: fakeFetch }), /sin vector/)
})
