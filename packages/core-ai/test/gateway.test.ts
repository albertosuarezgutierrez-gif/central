// gatewayChat debe ENVIAR timeoutMs en el body: la pasarela lo usa contra el proveedor (sin él, 25 s).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatewayChat } from '../src/gateway.ts'

async function capturar(opts: Parameters<typeof gatewayChat>[2]) {
  const orig = globalThis.fetch
  let body: Record<string, unknown> = {}
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return { ok: true, status: 200, json: async () => ({ text: 'ok' }), text: async () => '' } as unknown as Response
  }) as typeof fetch
  try {
    await gatewayChat({ url: 'https://x.test', secret: 's', app: 'a' }, [{ role: 'user', content: 'hola' }], opts)
  } finally { globalThis.fetch = orig }
  return body
}

test('gatewayChat envía timeoutMs y categoria en el body', async () => {
  const b = await capturar({ timeoutMs: 50_000, categoria: 'contexto' })
  assert.equal(b.timeoutMs, 50_000)
  assert.equal(b.categoria, 'contexto')
  assert.equal(b.app, 'a')
})

test('gatewayChat sin timeoutMs no lo envía (la pasarela usa su default)', async () => {
  const b = await capturar({})
  assert.equal('timeoutMs' in b, false)
})
