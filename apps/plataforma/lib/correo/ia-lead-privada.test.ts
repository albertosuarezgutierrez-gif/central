// Cepo (19/10/2026): el cuerpo de los correos de leads de la correduría (DNI, nacimiento, teléfono) SOLO va a
// OpenRouter con data_collection:'deny'. Nunca a Groq/NIM, ni con la clave caída.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { llamarIAPrivada } from './ia-lead-privada.ts'

const leer = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

type Chat = NonNullable<Parameters<typeof llamarIAPrivada>[3]>['chat']
const espia = (fallo = false) => {
  const llamadas: { config: { apiKey: string }; opts: Record<string, unknown> }[] = []
  const chat = (async (config: { apiKey: string }, _m: unknown, opts: Record<string, unknown>) => {
    llamadas.push({ config, opts })
    if (fallo) throw new Error('OpenRouter HTTP 500: boom')
    return { text: '{"a":1}', model: 'x/y' }
  }) as unknown as Chat
  return { llamadas, chat }
}

test('🪤 la llamada pide privacidad (data_collection:deny) y zdr, con la clave de OpenRouter', async () => {
  const { llamadas, chat } = espia()
  assert.equal(await llamarIAPrivada('sys', 'DNI 12345678Z', 900, { apiKey: 'k', chat }), '{"a":1}')
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].config.apiKey, 'k')
  assert.equal(llamadas[0].opts.privacidad, true, 'privacidad:true => provider.data_collection=deny en core-ai')
  assert.deepEqual(llamadas[0].opts.provider, { zdr: true })
  assert.equal(llamadas[0].opts.maxTokens, 900)
})

test('🪤 sin clave de OpenRouter lanza y NO llama a nadie (ni Groq ni NIM)', async () => {
  const antes = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  const { llamadas, chat } = espia()
  try {
    await assert.rejects(llamarIAPrivada('s', 'u', 400, { chat }))
  } finally {
    if (antes !== undefined) process.env.OPENROUTER_API_KEY = antes
  }
  assert.equal(llamadas.length, 0)
})

test('🪤 si OpenRouter falla, lanza (no hay caída a otro proveedor)', async () => {
  const { chat } = espia(true)
  await assert.rejects(llamarIAPrivada('s', 'u', 400, { apiKey: 'k', chat }), /OpenRouter HTTP 500/)
})

test('🪤 fuente: F1 y F2 usan llamarIAPrivada; el helper no toca Groq/NIM/clasificador', () => {
  for (const f of ['./lead-correduria-proceso.ts', './lead-correduria-respuesta-proceso.ts']) {
    const src = leer(f)
    assert.match(src, /await llamarIAPrivada\(/, `${f} debe llamar a llamarIAPrivada`)
    assert.doesNotMatch(src, /\bllamarIA\(|from '\.\/clasificador'|groqText|aiComplete/, `${f} no puede usar la IA general`)
  }
  const h = leer('./ia-lead-privada.ts')
  assert.match(h, /privacidad:\s*true/)
  assert.match(h, /zdr:\s*true/)
  assert.match(h, /openrouterChatEx/)
  assert.doesNotMatch(h, /groqText|aiComplete|ai-client|from '\.\/clasificador'|nimChat/)
})
