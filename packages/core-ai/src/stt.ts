// Cliente de transcripción de voz (Speech-to-Text), identity-agnostic.
// Groq sirve Whisper (`whisper-large-v3`) por su endpoint OpenAI-compatible, GRATIS y rápido —
// misma clave/infra que el fallback de texto (`groq.ts`). La app inyecta la config con su
// GROQ_API_KEY; el paquete NUNCA lee process.env ni secretos.

const DEFAULT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const DEFAULT_MODEL = 'whisper-large-v3'

export interface GroqSttConfig {
  apiKey: string
  baseUrl?: string   // default: endpoint de transcripciones de Groq
  model?: string     // default: whisper-large-v3
}

export interface AudioInput {
  data: Uint8Array | ArrayBuffer
  fileName: string       // Groq usa la extensión para inferir el formato (.ogg, .mp3, .m4a…)
  mimeType?: string
}

/** Transcribe un audio a texto. Devuelve '' si el modelo no reconoce nada. */
export async function groqTranscribe(
  config: GroqSttConfig,
  audio: AudioInput,
  opts: { language?: string; signal?: AbortSignal } = {},
): Promise<string> {
  if (!config.apiKey) throw new Error('Groq STT: apiKey requerida')
  const bytes = audio.data instanceof ArrayBuffer ? new Uint8Array(audio.data) : audio.data
  // `bytes as BlobPart`: TS 5.7 estrechó BlobPart a ArrayBufferView<ArrayBuffer>; un Uint8Array
  // genérico (ArrayBufferLike) es válido en runtime pero el compilador lo rechaza sin este assert.
  const blob = new Blob([bytes as unknown as BlobPart], { type: audio.mimeType || 'application/octet-stream' })

  const form = new FormData()
  form.append('file', blob, audio.fileName || 'audio.ogg')
  form.append('model', config.model ?? DEFAULT_MODEL)
  form.append('response_format', 'json')
  form.append('temperature', '0')
  if (opts.language) form.append('language', opts.language)

  const res = await fetch(config.baseUrl ?? DEFAULT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` }, // NO fijar Content-Type: lo pone FormData con boundary
    body: form,
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`Groq STT HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`)
  const data = await res.json().catch(() => null)
  return String(data?.text ?? '').trim()
}
