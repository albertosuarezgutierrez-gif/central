// Cliente Groq (endpoint OpenAI-compatible), identity-agnostic.
// Espejo de `nim.ts`: la config (apiKey, modelo, baseUrl) la inyecta la app
// consumidora — el paquete NUNCA lee process.env ni secretos.
//
// ¿Por qué Groq? Sirve modelos abiertos GRATIS (rate-limited) sobre su LPU —
// infraestructura DISTINTA de NIM, ideal como fallback de texto. Default
// `openai/gpt-oss-120b` (el anterior `llama-3.3-70b-versatile` quedó DEPRECADO
// en Groq el 17/06/2026). La POLÍTICA de fallback (NIM → Groq) vive en cada app.

import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import { fetchAI } from './http.ts'

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b'

/**
 * Configuración para el cliente Groq.
 *
 * Identity-agnostic igual que `NimConfig`: la app construye esta config con su
 * `GROQ_API_KEY` y la pasa. Reutiliza el mismo contrato que NIM (apiKey/baseUrl/
 * textModel) para que `groqText`/`groqChatTools` sean drop-in de `nimText`/`nimChatTools`.
 */
export interface GroqConfig {
  apiKey: string
  baseUrl?: string    // default: endpoint OpenAI-compatible de Groq
  textModel?: string  // default: openai/gpt-oss-120b
}

function requireKey(config: GroqConfig): string {
  if (!config.apiKey) throw new Error('Groq: apiKey requerida')
  return config.apiKey
}

/** Llamada de texto a Groq. Devuelve el contenido del primer choice. Espejo de `nimText`. */
export async function groqText(
  config: GroqConfig,
  system: string,
  user: string,
  maxTokens = 600,
): Promise<string> {
  const key = requireKey(config)
  const res = await fetchAI(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: config.textModel ?? DEFAULT_TEXT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
      stream: false,
    }),
  }, { provider: 'Groq' })
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Groq: respuesta vacía')
  return text
}

/**
 * Llamada de texto **multi-turno** a Groq (array de mensajes estilo OpenAI).
 * Espejo de `nimChat`. `opts.system` se antepone como mensaje de sistema.
 * Reutiliza el tipo `NimChatMessage` (mismo formato OpenAI).
 */
export async function groqChat(
  config: GroqConfig,
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
  }, { provider: 'Groq', signal: opts.signal })
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Groq: respuesta vacía')
  return text
}

/**
 * Function-calling con Groq (endpoint OpenAI-compatible). Espejo de `nimChatTools`:
 * mismas firmas y tipos (`NimToolMessage`/`NimToolResult`) para ser drop-in. `tools`
 * en formato OpenAI; devuelve el mensaje del modelo con `content` y/o `tool_calls`.
 */
export async function groqChatTools(
  config: GroqConfig,
  messages: NimToolMessage[],
  tools: unknown[],
  opts: { system?: string; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<NimToolResult> {
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
      tools,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    }),
  }, { provider: 'Groq-Tools', signal: opts.signal })
  const data = await res.json()
  const msg = data?.choices?.[0]?.message
  if (!msg) throw new Error('Groq-Tools: respuesta vacía')
  return { content: msg.content ?? null, tool_calls: msg.tool_calls }
}
