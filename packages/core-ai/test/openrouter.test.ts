// Tests del adaptador OpenRouter (agregador OpenAI-compatible con fallback nativo `models`).
// PURO: fetch inyectable. Se ejecuta con el runner de Node: `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { openrouterChat, openrouterChatEx, openrouterChatTools } from '../src/openrouter.ts'

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function fakeFetch(respuesta: unknown, calls: Call[], ok = true, status = 200) {
  return (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return { ok, status, json: async () => respuesta, text: async () => JSON.stringify(respuesta) }
  }) as unknown as typeof fetch
}

const RESP = {
  model: 'deepseek/deepseek-chat',
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  choices: [{ message: { content: 'hola' } }],
}

test('openrouterChat manda system+mensajes al endpoint y devuelve el texto', async () => {
  const calls: Call[] = []
  const out = await openrouterChat({ apiKey: 'k' }, [{ role: 'user', content: 'hey' }], {
    system: 'sé breve', fetchImpl: fakeFetch(RESP, calls),
  })
  assert.equal(out, 'hola')
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(calls[0].headers.Authorization, 'Bearer k')
  assert.equal(calls[0].body.model, 'deepseek/deepseek-chat')
  const msgs = calls[0].body.messages as Array<{ role: string; content: string }>
  assert.equal(msgs[0].role, 'system')
  assert.equal(msgs[1].content, 'hey')
})

test('openrouterChatEx devuelve modelo real y usage (para el auditor de coste)', async () => {
  const calls: Call[] = []
  const out = await openrouterChatEx({ apiKey: 'k' }, [{ role: 'user', content: 'x' }], {
    fetchImpl: fakeFetch({ ...RESP, model: 'suplente/usado' }, calls),
  })
  assert.equal(out.text, 'hola')
  assert.equal(out.model, 'suplente/usado')
  assert.equal(out.usage?.total_tokens, 15)
})

test('fallback nativo: fallbackModels de config genera body.models (y no body.model)', async () => {
  const calls: Call[] = []
  await openrouterChat(
    { apiKey: 'k', textModel: 'a/uno', fallbackModels: ['b/dos:free', 'c/tres'] },
    [{ role: 'user', content: 'x' }],
    { fetchImpl: fakeFetch(RESP, calls) },
  )
  assert.deepEqual(calls[0].body.models, ['a/uno', 'b/dos:free', 'c/tres'])
  assert.equal(calls[0].body.model, undefined)
})

test('opts.models tiene prioridad sobre la config', async () => {
  const calls: Call[] = []
  await openrouterChat({ apiKey: 'k', fallbackModels: ['z/ignorado'] }, [{ role: 'user', content: 'x' }], {
    models: ['director/elegido', 'suplente/uno'], fetchImpl: fakeFetch(RESP, calls),
  })
  assert.deepEqual(calls[0].body.models, ['director/elegido', 'suplente/uno'])
})

test('cacheSystem marca el system prompt con cache_control (prompt caching)', async () => {
  const calls: Call[] = []
  await openrouterChat({ apiKey: 'k' }, [{ role: 'user', content: 'x' }], {
    system: 'prompt largo estable', cacheSystem: true, fetchImpl: fakeFetch(RESP, calls),
  })
  const sys = (calls[0].body.messages as Array<{ role: string; content: unknown }>)[0]
  const bloque = (sys.content as Array<Record<string, unknown>>)[0]
  assert.equal(bloque.text, 'prompt largo estable')
  assert.deepEqual(bloque.cache_control, { type: 'ephemeral' })
})

test('privacidad añade provider.data_collection=deny; responseFormat pasa entero', async () => {
  const calls: Call[] = []
  const schema = { type: 'json_schema', json_schema: { name: 'm', schema: { type: 'object' } } }
  await openrouterChat({ apiKey: 'k' }, [{ role: 'user', content: 'x' }], {
    privacidad: true, responseFormat: schema, fetchImpl: fakeFetch(RESP, calls),
  })
  assert.deepEqual(calls[0].body.provider, { data_collection: 'deny' })
  assert.deepEqual(calls[0].body.response_format, schema)
})

test('headers de atribución HTTP-Referer / X-Title cuando van en config', async () => {
  const calls: Call[] = []
  await openrouterChat({ apiKey: 'k', referer: 'https://iarest.es', title: 'central' },
    [{ role: 'user', content: 'x' }], { fetchImpl: fakeFetch(RESP, calls) })
  assert.equal(calls[0].headers['HTTP-Referer'], 'https://iarest.es')
  assert.equal(calls[0].headers['X-Title'], 'central')
})

test('openrouterChat lanza en HTTP error y en respuesta vacía; y sin apiKey', async () => {
  await assert.rejects(
    () => openrouterChat({ apiKey: 'k' }, [{ role: 'user', content: 'x' }], { fetchImpl: fakeFetch({}, [], false, 429) }),
    /HTTP 429/,
  )
  await assert.rejects(
    () => openrouterChat({ apiKey: 'k' }, [{ role: 'user', content: 'x' }], { fetchImpl: fakeFetch({ choices: [] }, []) }),
    /vacía/,
  )
  await assert.rejects(() => openrouterChat({ apiKey: '' }, [{ role: 'user', content: 'x' }]))
})

test('openrouterChatTools manda tools y devuelve content/tool_calls', async () => {
  const calls: Call[] = []
  const resp = { model: 'm', choices: [{ message: { content: null, tool_calls: [{ id: 't1' }] } }] }
  const out = await openrouterChatTools({ apiKey: 'k' }, [{ role: 'user', content: 'x' }],
    [{ type: 'function', function: { name: 'f' } }], { fetchImpl: fakeFetch(resp, calls) })
  assert.equal(out.content, null)
  assert.equal((out.tool_calls as Array<{ id: string }>)[0].id, 't1')
  assert.ok(Array.isArray(calls[0].body.tools))
  assert.equal(calls[0].body.max_tokens, 1024)
})
