// Cliente NVIDIA NIM (endpoint OpenAI-compatible), identity-agnostic.
// La config (apiKey, modelos, baseUrl) la inyecta la app consumidora — el
// paquete NUNCA lee process.env ni secretos.

import type { ImageInput, NimConfig } from './types'

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const DEFAULT_TEXT_MODEL = 'meta/llama-3.3-70b-instruct'
const DEFAULT_VISION_MODEL = 'meta/llama-3.2-11b-vision-instruct'

function requireKey(config: NimConfig): string {
  if (!config.apiKey) throw new Error('NIM: apiKey requerida')
  return config.apiKey
}

/** Llamada de texto a NVIDIA NIM. Devuelve el contenido del primer choice. */
export async function nimText(
  config: NimConfig,
  system: string,
  user: string,
  maxTokens = 600,
): Promise<string> {
  const key = requireKey(config)
  const res = await fetch(config.baseUrl ?? DEFAULT_BASE_URL, {
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
  })
  if (!res.ok) throw new Error(`NVIDIA HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('NVIDIA: respuesta vacía')
  return text
}

/** Mensaje estilo OpenAI para conversaciones multi-turno. */
export interface NimChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Opciones por llamada de `nimChat` (la POLÍTICA —timeout/modelo— la pone la app). */
export interface NimChatOptions {
  system?: string
  model?: string
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

/**
 * Llamada de texto **multi-turno** a NVIDIA NIM (array de mensajes estilo OpenAI).
 * Variante de `nimText` para chats/agentes conversacionales. `opts.system` se
 * antepone como mensaje de sistema. La app inyecta `signal` para su propio timeout.
 */
export async function nimChat(
  config: NimConfig,
  messages: NimChatMessage[],
  opts: NimChatOptions = {},
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
  if (!res.ok) throw new Error(`NVIDIA HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('NVIDIA: respuesta vacía')
  return text
}

/**
 * Llamada de visión (multi-imagen) a NVIDIA NIM. Formato image_url base64.
 *
 * `opts.temperature` permite afinar el determinismo (p. ej. OCR de facturas usa
 * 0.05); por defecto 0.1. `opts.signal` permite cancelar/timeout. Si `system` va
 * vacío, NO se envía mensaje de sistema (el prompt completo viaja en `userText`,
 * junto a la imagen) — replica el patrón "single user message" de algunos agentes.
 */
export async function nimVision(
  config: NimConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  maxTokens = 2000,
  opts: { temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const key = requireKey(config)
  const imageContent = images.map(img => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.mediaType};base64,${img.data}` },
  }))

  const messages: Array<Record<string, unknown>> = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: [...imageContent, { type: 'text', text: userText }] })

  const res = await fetch(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: config.visionModel ?? DEFAULT_VISION_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.1,
      stream: false,
    }),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`NVIDIA-Vision HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('NVIDIA-Vision: respuesta vacía')
  return text
}
