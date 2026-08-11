// Cliente Cerebras (endpoint OpenAI-compatible), identity-agnostic.
// Espejo de `groq.ts`: la config (apiKey, modelo, baseUrl) la inyecta la app
// consumidora — el paquete NUNCA lee process.env ni secretos.
//
// ¿Por qué Cerebras? Infraestructura (WSE) DISTINTA de NIM/Groq/Gemini — un 4º
// proveedor gratis independiente para el escenario del incidente del 06/07/2026
// (los 3 proveedores gratis cayeron a la vez). Sirve `gpt-oss-120b` (mismo modelo
// que el fallback de Groq, ya validado en producción) a muy alta velocidad.
// OJO: el tier gratis limita el contexto a 8192 tokens — vale como backstop de
// texto corto, no para prompts largos.

import type { NimChatMessage } from './nim'
import { fetchAI } from './http.ts'

const DEFAULT_BASE_URL = 'https://api.cerebras.ai/v1/chat/completions'
const DEFAULT_TEXT_MODEL = 'gpt-oss-120b'

/** Config identity-agnostic, mismo contrato que `GroqConfig`. */
export interface CerebrasConfig {
  apiKey: string
  baseUrl?: string    // default: endpoint OpenAI-compatible de Cerebras
  textModel?: string  // default: gpt-oss-120b
}

function requireKey(config: CerebrasConfig): string {
  if (!config.apiKey) throw new Error('Cerebras: apiKey requerida')
  return config.apiKey
}

/**
 * Llamada de texto multi-turno a Cerebras (array de mensajes estilo OpenAI).
 * Espejo de `groqChat`. `opts.system` se antepone como mensaje de sistema.
 */
export async function cerebrasChat(
  config: CerebrasConfig,
  messages: NimChatMessage[],
  opts: { system?: string; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const key = requireKey(config)
  const msgs = [
    ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
    ...messages,
  ]
  const res = await fetchAI(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.model ?? config.textModel ?? DEFAULT_TEXT_MODEL,
      messages: msgs,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    }),
  }, { provider: 'Cerebras', signal: opts.signal })
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Cerebras: respuesta vacía')
  return text
}
