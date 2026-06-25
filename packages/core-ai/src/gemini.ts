// Google Gemini con Google Search grounding — adaptador puro, identity-agnostic.
// Para tareas que necesitan datos actuales de internet (research/leads). Lanza
// error si falla; la POLÍTICA de fallback (p. ej. a NIM) la decide la app.

import type { ImageInput } from './types'

export interface GeminiConfig {
  apiKey: string
  model?: string   // default: gemini-2.0-flash
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

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
