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

/** Llamada de visión (multi-imagen) a NVIDIA NIM. Formato image_url base64. */
export async function nimVision(
  config: NimConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  maxTokens = 2000,
): Promise<string> {
  const key = requireKey(config)
  const imageContent = images.map(img => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.mediaType};base64,${img.data}` },
  }))

  const res = await fetch(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: config.visionModel ?? DEFAULT_VISION_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [...imageContent, { type: 'text', text: userText }] },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`NVIDIA-Vision HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('NVIDIA-Vision: respuesta vacía')
  return text
}
