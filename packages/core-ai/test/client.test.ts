// Tests de `aiCompleteConProveedor`/`aiToolsConProveedor` — la variante con PROCEDENCIA de
// `aiComplete`/`aiTools`.
//
// 🚨 Por qué existen (25/08/2026): `aiComplete`/`aiTools` eran cajas negras — el caller no
// tenía forma de saber qué eslabón de la cadena clásica (NIM → Groq → Cerebras → Gemini →
// Kimi) sirvió de verdad, así que la pasarela de plataforma registraba TODO éxito como
// `proveedor:'nim'` en `ai_usos`, aunque hubiera respondido Groq/Cerebras/Kimi — mismo patrón
// que dejó a Gemini acumulando fallos fantasma en el Check 12 del health-check, pero al
// revés (un NIM muerto quedaría tapado indefinidamente por sus fallbacks, y Kimi —DE PAGO—
// se contaría como gasto de NIM —gratis—). Estos tests fijan que la procedencia devuelta es
// la del proveedor que REALMENTE respondió, probando cada escalón de la cadena.
//
// Se estuba `globalThis.fetch` por URL (cada proveedor tiene la suya) y las env vars que
// `client.ts` lee directamente (NVIDIA_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY,
// MOONSHOT_API_KEY, OPENROUTER_API_KEY) — únicas señales que decide qué eslabones están
// "activos". Los estados de fallo usan un status NO reintentable (404) para no pagar el
// backoff real de `fetchAI`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiCompleteConProveedor, aiToolsConProveedor } from '../src/client.ts'

type Ruta = { match: (url: string) => boolean; status: number; body: unknown }

function stubFetch(rutas: Ruta[]): typeof fetch {
  return (async (url: string) => {
    const ruta = rutas.find(r => r.match(String(url)))
    if (!ruta) throw new Error(`stubFetch: URL sin ruta configurada: ${url}`)
    return {
      ok: ruta.status >= 200 && ruta.status < 300,
      status: ruta.status,
      json: async () => ruta.body,
      text: async () => JSON.stringify(ruta.body),
      headers: { get: () => null },
    } as unknown as Response
  }) as unknown as typeof fetch
}

const respuestaChat = (texto: string, modelo?: string) => ({
  model: modelo,
  choices: [{ message: { content: texto } }],
})

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Ejecuta `fn` con `globalThis.fetch` y las env vars indicadas sustituidas, restaurando ambas al salir. */
async function conEntorno<T>(fetchStub: typeof fetch, envs: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const fetchOriginal = globalThis.fetch
  const envOriginal: Record<string, string | undefined> = {}
  for (const k of Object.keys(envs)) envOriginal[k] = process.env[k]
  globalThis.fetch = fetchStub
  for (const [k, v] of Object.entries(envs)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    globalThis.fetch = fetchOriginal
    for (const [k, v] of Object.entries(envOriginal)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('aiCompleteConProveedor: NIM responde → proveedor honesto es nim, no un adivinado', async () => {
  const out = await conEntorno(
    stubFetch([{ match: u => u === NIM_URL, status: 200, body: respuestaChat('hola desde nim') }]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: '1', NVIDIA_BRAIN_MODEL: 'un/modelo-vivo', GROQ_API_KEY: undefined, CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: undefined, MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola'),
  )
  assert.equal(out.text, 'hola desde nim')
  assert.equal(out.proveedor, 'nim')
})

test('aiCompleteConProveedor: NIM cae, Groq responde → proveedor es groq (NUNCA nim)', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 404, body: {} },
      { match: u => u === GROQ_URL, status: 200, body: respuestaChat('hola desde groq') },
    ]),
    { NVIDIA_API_KEY: 'k', GROQ_API_KEY: 'k', CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: undefined, MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola'),
  )
  assert.equal(out.text, 'hola desde groq')
  assert.equal(out.proveedor, 'groq')
})

test('aiCompleteConProveedor: NIM y Groq caen, Cerebras responde → proveedor es cerebras', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 404, body: {} },
      { match: u => u === GROQ_URL, status: 404, body: {} },
      { match: u => u === CEREBRAS_URL, status: 200, body: respuestaChat('hola desde cerebras') },
    ]),
    { NVIDIA_API_KEY: 'k', GROQ_API_KEY: 'k', CEREBRAS_API_KEY: 'k', OPENROUTER_API_KEY: undefined, MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola'),
  )
  assert.equal(out.text, 'hola desde cerebras')
  assert.equal(out.proveedor, 'cerebras')
})

test('aiCompleteConProveedor: OpenRouter primario responde → proveedor openrouter con el modelo REAL (no el pedido)', async () => {
  const out = await conEntorno(
    stubFetch([{ match: u => u === OPENROUTER_URL, status: 200, body: respuestaChat('hola desde or', 'suplente/usado-de-verdad') }]),
    { NVIDIA_API_KEY: undefined, GROQ_API_KEY: undefined, CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: 'k', MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola'),
  )
  assert.equal(out.proveedor, 'openrouter')
  assert.equal(out.modelo, 'suplente/usado-de-verdad')
})

test('aiComplete (atajo sin procedencia) sigue devolviendo solo el texto — no rompe a los ~70 callers existentes', async () => {
  const { aiComplete } = await import('../src/client.ts')
  const texto = await conEntorno(
    stubFetch([{ match: u => u === NIM_URL, status: 200, body: respuestaChat('solo texto') }]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: '1', NVIDIA_BRAIN_MODEL: 'un/modelo-vivo', GROQ_API_KEY: undefined, CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: undefined, MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiComplete('hola'),
  )
  assert.equal(texto, 'solo texto')
})

const respuestaTools = (modelo: string) => ({
  model: modelo,
  choices: [{ message: { content: null, tool_calls: [{ id: 't1' }] } }],
})

test('aiToolsConProveedor: OpenRouter responde → proveedor openrouter, modelo real de la respuesta', async () => {
  const out = await conEntorno(
    stubFetch([{ match: u => u === OPENROUTER_URL, status: 200, body: respuestaTools('modelo-real') }]),
    { NVIDIA_API_KEY: undefined, GROQ_API_KEY: undefined, OPENROUTER_API_KEY: 'k' },
    () => aiToolsConProveedor([{ role: 'user', content: 'x' }], [{ type: 'function', function: { name: 'f' } }]),
  )
  assert.equal(out.proveedor, 'openrouter')
  assert.equal(out.modelo, 'modelo-real')
})

test('aiToolsConProveedor: OpenRouter cae, NIM responde → proveedor nim (no openrouter)', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === OPENROUTER_URL, status: 404, body: {} },
      { match: u => u === NIM_URL, status: 200, body: respuestaTools('nim-modelo') },
    ]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: '1', NVIDIA_BRAIN_MODEL: 'un/modelo-vivo', GROQ_API_KEY: undefined, OPENROUTER_API_KEY: 'k' },
    () => aiToolsConProveedor([{ role: 'user', content: 'x' }], [{ type: 'function', function: { name: 'f' } }]),
  )
  assert.equal(out.proveedor, 'nim')
})

test('aiToolsConProveedor: NIM cae, Groq responde → proveedor groq (NUNCA nim)', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 404, body: {} },
      { match: u => u === GROQ_URL, status: 200, body: respuestaTools('groq-modelo') },
    ]),
    { NVIDIA_API_KEY: 'k', GROQ_API_KEY: 'k', OPENROUTER_API_KEY: undefined },
    () => aiToolsConProveedor([{ role: 'user', content: 'x' }], [{ type: 'function', function: { name: 'f' } }]),
  )
  assert.equal(out.proveedor, 'groq')
})

// ── Guardián de «todo OpenRouter» (28/08/2026) ────────────────────────────────
// Decisión de Alberto tras tres ids de NIM muertos por EOL en 11 días. NIM queda APAGADO por
// defecto: tener `NVIDIA_API_KEY` ya NO lo enchufa. Estos tests fijan las dos mitades — que no
// entra solo, y que un `model` pinneado (id de NIM) deja de apartar a OpenRouter, que era lo que
// desviaba a rrhh y a ia-rest hacia un modelo muerto.

test('NIM NO entra solo por tener NVIDIA_API_KEY: sin NVIDIA_TEXTO=1 la cadena salta a Groq', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 200, body: respuestaChat('esto NO debería servirse') },
      { match: u => u === GROQ_URL, status: 200, body: respuestaChat('hola desde groq') },
    ]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: undefined, NVIDIA_BRAIN_MODEL: undefined, GROQ_API_KEY: 'k', CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: undefined, MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola'),
  )
  assert.equal(out.proveedor, 'groq')
  assert.equal(out.text, 'hola desde groq')
})

test('NVIDIA_TEXTO=1 sin NVIDIA_BRAIN_MODEL tampoco enchufa NIM (reactivar exige nombrar un id vivo)', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 200, body: respuestaChat('esto NO debería servirse') },
      { match: u => u === GROQ_URL, status: 200, body: respuestaChat('hola desde groq') },
    ]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: '1', NVIDIA_BRAIN_MODEL: undefined, GROQ_API_KEY: 'k', CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: undefined, MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola'),
  )
  assert.equal(out.proveedor, 'groq')
})

test('con NIM apagado, un `model` pinneado ya NO aparta a OpenRouter de ser primario', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 200, body: respuestaChat('esto NO debería servirse') },
      { match: u => u === OPENROUTER_URL, status: 200, body: respuestaChat('hola desde openrouter', 'modelo-real') },
    ]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: undefined, NVIDIA_BRAIN_MODEL: undefined, GROQ_API_KEY: undefined, CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: 'k', MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola', { model: 'meta/llama-3.1-70b-instruct' }),
  )
  assert.equal(out.proveedor, 'openrouter')
  assert.equal(out.modelo, 'modelo-real')
})

test('con NIM ENCHUFADO se conserva el comportamiento viejo: el `model` pinneado lo sirve NIM', async () => {
  const out = await conEntorno(
    stubFetch([
      { match: u => u === NIM_URL, status: 200, body: respuestaChat('hola desde nim') },
      { match: u => u === OPENROUTER_URL, status: 200, body: respuestaChat('no', 'x') },
    ]),
    { NVIDIA_API_KEY: 'k', NVIDIA_TEXTO: '1', NVIDIA_BRAIN_MODEL: 'un/modelo-vivo', GROQ_API_KEY: undefined, CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: 'k', MOONSHOT_API_KEY: undefined, GEMINI_TEXTO: undefined },
    () => aiCompleteConProveedor('hola', { model: 'un/modelo-vivo' }),
  )
  assert.equal(out.proveedor, 'nim')
})
