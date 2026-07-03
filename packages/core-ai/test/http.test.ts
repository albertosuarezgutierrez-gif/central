// Tests del helper fetchAI (reintentos ante 429/5xx, Retry-After, backoff).
// PURO: fetch y sleep inyectables. Se ejecuta con `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fetchAI, AiHttpError, isRateLimitError } from '../src/http.ts'

// Respuesta falsa mínima con la superficie que usa fetchAI (ok/status/headers/text/json).
function fakeRes(
  status: number,
  { headers = {}, body = '' }: { headers?: Record<string, string>; body?: string } = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => body,
    json: async () => (body ? JSON.parse(body) : {}),
  } as unknown as Response
}

// sleep que no espera de verdad, pero registra las esperas para poder afirmarlas.
function recordingSleep() {
  const waits: number[] = []
  const sleepImpl = async (ms: number) => { waits.push(ms) }
  return { waits, sleepImpl }
}

const noJitter = () => 0 // backoff determinista: equal-jitter con random=0 → mitad fija.

test('devuelve la respuesta al primer intento si es OK', async () => {
  let calls = 0
  const fetchImpl = (async () => { calls++; return fakeRes(200, { body: '{"ok":true}' }) }) as unknown as typeof fetch
  const res = await fetchAI('u', {}, { fetchImpl })
  assert.equal(calls, 1)
  assert.equal((await res.json()).ok, true)
})

test('reintenta un 429 y triunfa en el segundo intento', async () => {
  let calls = 0
  const fetchImpl = (async () => {
    calls++
    return calls === 1 ? fakeRes(429, { body: 'rate limit' }) : fakeRes(200, { body: '{"ok":1}' })
  }) as unknown as typeof fetch
  const { waits, sleepImpl } = recordingSleep()
  const res = await fetchAI('u', {}, { fetchImpl, sleepImpl, jitter: noJitter, baseDelayMs: 500 })
  assert.equal(calls, 2)
  assert.equal(res.status, 200)
  assert.deepEqual(waits, [250]) // equal-jitter attempt 0: 500/2 + 0 = 250
})

test('respeta Retry-After (segundos) en la espera', async () => {
  let calls = 0
  const fetchImpl = (async () => {
    calls++
    return calls === 1 ? fakeRes(429, { headers: { 'retry-after': '2' } }) : fakeRes(200, { body: '{}' })
  }) as unknown as typeof fetch
  const { waits, sleepImpl } = recordingSleep()
  await fetchAI('u', {}, { fetchImpl, sleepImpl, jitter: noJitter })
  assert.deepEqual(waits, [2000])
})

test('si Retry-After supera el tope, NO espera y lanza de inmediato (para caer a otro proveedor)', async () => {
  let calls = 0
  const fetchImpl = (async () => { calls++; return fakeRes(429, { headers: { 'retry-after': '3600' }, body: 'quota' }) }) as unknown as typeof fetch
  const { waits, sleepImpl } = recordingSleep()
  await assert.rejects(
    () => fetchAI('u', {}, { fetchImpl, sleepImpl, maxRetryAfterMs: 5000, provider: 'Groq' }),
    (e: unknown) => {
      assert.ok(e instanceof AiHttpError)
      assert.equal(e.status, 429)
      assert.equal(e.retryAfterMs, 3_600_000)
      assert.ok(isRateLimitError(e))
      return true
    },
  )
  assert.equal(calls, 1)        // no reintentó
  assert.deepEqual(waits, [])   // no esperó
})

test('agota los reintentos y lanza AiHttpError con el status y formato de mensaje', async () => {
  let calls = 0
  const fetchImpl = (async () => { calls++; return fakeRes(429, { body: 'Rate limit reached' }) }) as unknown as typeof fetch
  const { sleepImpl } = recordingSleep()
  await assert.rejects(
    () => fetchAI('u', {}, { fetchImpl, sleepImpl, maxRetries: 2, provider: 'Groq' }),
    (e: unknown) => {
      assert.ok(e instanceof AiHttpError)
      assert.match((e as Error).message, /^Groq HTTP 429: Rate limit reached/)
      return true
    },
  )
  assert.equal(calls, 3) // 1 inicial + 2 reintentos
})

test('un 400 no se reintenta (no es transitorio)', async () => {
  let calls = 0
  const fetchImpl = (async () => { calls++; return fakeRes(400, { body: 'bad request' }) }) as unknown as typeof fetch
  await assert.rejects(() => fetchAI('u', {}, { fetchImpl, provider: 'NVIDIA' }))
  assert.equal(calls, 1)
})

test('reintenta un 503 transitorio', async () => {
  let calls = 0
  const fetchImpl = (async () => {
    calls++
    return calls < 3 ? fakeRes(503) : fakeRes(200, { body: '{"ok":1}' })
  }) as unknown as typeof fetch
  const { sleepImpl } = recordingSleep()
  const res = await fetchAI('u', {}, { fetchImpl, sleepImpl, jitter: noJitter })
  assert.equal(res.status, 200)
  assert.equal(calls, 3)
})

test('reintenta errores de red (fetch rechaza) y luego triunfa', async () => {
  let calls = 0
  const fetchImpl = (async () => {
    calls++
    if (calls === 1) throw new Error('ECONNRESET')
    return fakeRes(200, { body: '{"ok":1}' })
  }) as unknown as typeof fetch
  const { sleepImpl } = recordingSleep()
  const res = await fetchAI('u', {}, { fetchImpl, sleepImpl, jitter: noJitter })
  assert.equal(res.status, 200)
  assert.equal(calls, 2)
})
