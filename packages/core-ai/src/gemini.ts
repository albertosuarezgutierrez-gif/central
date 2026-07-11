// Google Gemini con Google Search grounding — adaptador puro, identity-agnostic.
// Para tareas que necesitan datos actuales de internet (research/leads). Lanza
// error si falla; la POLÍTICA de fallback (p. ej. a NIM) la decide la app.

import type { ImageInput } from './types'

export interface GeminiConfig {
  apiKey: string
  model?: string   // default: gemini-2.5-flash
}

// gemini-2.0-flash llegó a EOL el 01/06/2026; gemini-2.5-flash es el sucesor (ojo: su EOL es 16/10/2026).
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

export async function geminiSearch(
  config: GeminiConfig,
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!config.apiKey) throw new Error('Gemini: apiKey requerida')
  const maxTokens = opts.maxTokens ?? 1500
  const timeoutMs = opts.timeoutMs ?? 45_000
  const model = config.model ?? DEFAULT_GEMINI_MODEL

  const res = await Promise.race([
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
        }),
      },
    ),
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini timeout')), timeoutMs)),
  ])

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new Error('Gemini: respuesta vacía')
  return text
}

/**
 * Chat de TEXTO con Gemini Flash, SIN grounding (sin google_search). Espejo funcional de
 * `groqChat`/`moonshotChat` para usarlo como fallback GRATIS en la cadena de `aiComplete`
 * (la POLÍTICA vive en `client.ts`). Convierte los mensajes al formato de Gemini: el rol
 * `assistant` pasa a `model`, y los mensajes de sistema (más `opts.system`) van a
 * `system_instruction`. Adaptador PURO: la app inyecta la config.
 */
export async function geminiChat(
  config: GeminiConfig,
  messages: { role: string; content: string }[],
  opts: { system?: string; maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!config.apiKey) throw new Error('Gemini: apiKey requerida')
  const maxTokens = opts.maxTokens ?? 800
  const timeoutMs = opts.timeoutMs ?? 30_000
  const model = config.model ?? DEFAULT_GEMINI_MODEL

  const sysParts = [
    ...(opts.system ? [opts.system] : []),
    ...messages.filter(m => m.role === 'system').map(m => m.content),
  ]
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: opts.temperature ?? 0.3 },
  }
  if (sysParts.length) body.system_instruction = { parts: [{ text: sysParts.join('\n\n') }] }

  const res = await Promise.race([
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini timeout')), timeoutMs)),
  ])

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new Error('Gemini: respuesta vacía')
  return text
}

/**
 * Visión/OCR con Gemini Flash. Acepta imágenes grandes (muy por encima del tope
 * inline de ~180 KB de NIM). Adaptador PURO: la política de fallback la decide la
 * app. `fetchImpl` permite inyectar fetch en tests.
 */
export async function geminiVision(
  config: GeminiConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  opts: { maxTokens?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  if (!config.apiKey) throw new Error('Gemini: apiKey requerida')
  const maxTokens = opts.maxTokens ?? 2000
  const timeoutMs = opts.timeoutMs ?? 45_000
  const model = config.model ?? DEFAULT_GEMINI_MODEL
  const doFetch = opts.fetchImpl ?? fetch

  const parts = [
    ...images.map(img => ({ inline_data: { mime_type: img.mediaType, data: img.data } })),
    { text: userText },
  ]

  const res = await Promise.race([
    doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
        }),
      },
    ),
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini-Vision timeout')), timeoutMs)),
  ])

  if (!res.ok) throw new Error(`Gemini-Vision HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new Error('Gemini-Vision: respuesta vacía')
  return text
}
