// Cliente Moonshot / Kimi (endpoint OpenAI-compatible), identity-agnostic. Espejo de `groq.ts`.
// ¿Por qué Kimi? Kimi K2 (moonshotai) es un modelo fuerte servido por OTRA infraestructura → añade
// CAPACIDAD real como tercer fallback de texto cuando NIM y Groq están rate-limited a la vez (el
// fallo que sufrió Alberto). La app inyecta la config con su MOONSHOT_API_KEY; el paquete NUNCA
// lee process.env. La POLÍTICA de fallback (NIM → Groq → Kimi) vive en `client.ts`.
import type { NimChatMessage } from './nim'

const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1/chat/completions'
const DEFAULT_TEXT_MODEL = 'kimi-k2.6'

export interface MoonshotConfig {
  apiKey: string
  baseUrl?: string    // default: endpoint OpenAI-compatible de Moonshot (.ai; usa .cn si aplica)
  textModel?: string  // default: kimi-k2.6 (la serie k2-0711 se discontinuó el 25/05/2026; override por MOONSHOT_MODEL)
}

function requireKey(config: MoonshotConfig): string {
  if (!config.apiKey) throw new Error('Moonshot: apiKey requerida')
  return config.apiKey
}

/** Llamada de chat a Moonshot/Kimi. Devuelve el contenido del primer choice. Espejo de `groqChat`. */
export async function moonshotChat(
  config: MoonshotConfig,
  messages: NimChatMessage[],
  opts: { system?: string; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const key = requireKey(config)
  const msgs = [
    ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
    ...messages,
  ]
  const res = await fetch(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.model ?? config.textModel ?? DEFAULT_TEXT_MODEL,
      messages: msgs,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    }),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`Moonshot HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Moonshot: respuesta vacía')
  return text
}
