/**
 * ai-client.ts
 * Cliente IA centralizado: NVIDIA NIM (gratis) primero → Anthropic Claude (fallback)
 *
 * Uso:
 *   import { callAI, callAIVision } from '@/lib/ai-client'
 *   const text = await callAI(systemPrompt, userText)
 *   const text = await callAIVision(systemPrompt, images, userText)
 *
 * Sin config para el dueño — todo gestionado por el operador via env vars Vercel.
 */

export interface ImageInput {
  data: string       // base64 puro (sin prefijo data:)
  mediaType: string  // 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

// Modelos por defecto (sobrescribibles via env var si hace falta)
const TEXT_MODEL_NVIDIA   = process.env.NVIDIA_BRAIN_MODEL      ?? 'meta/llama-3.3-70b-instruct'
const VISION_MODEL_NVIDIA = process.env.NVIDIA_VISION_MODEL     ?? 'meta/llama-3.2-11b-vision-instruct'
const TEXT_MODEL_ANTHROPIC = 'claude-haiku-4-5-20251001'

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'

// ── Limpia markdown que algunos modelos añaden alrededor del JSON ──────────
export function cleanJSON(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

// ── NVIDIA: llamada texto ────────────────────────────────────────────────────
async function nvidiaText(system: string, user: string, maxTokens = 600): Promise<string> {
  const key = process.env.NVIDIA_API_KEY
  if (!key) throw new Error('NVIDIA_API_KEY no configurada')

  const res = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: TEXT_MODEL_NVIDIA,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
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

// ── NVIDIA: llamada visión (multi-imagen) ────────────────────────────────────
async function nvidiaVision(system: string, images: ImageInput[], userText: string, maxTokens = 2000): Promise<string> {
  const key = process.env.NVIDIA_API_KEY
  if (!key) throw new Error('NVIDIA_API_KEY no configurada')

  // Formato OpenAI-compatible con image_url base64
  const imageContent = images.map(img => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.mediaType};base64,${img.data}` },
  }))

  const res = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: VISION_MODEL_NVIDIA,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: [...imageContent, { type: 'text', text: userText }] },
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

// ── Anthropic: texto (fallback) ──────────────────────────────────────────────
async function anthropicText(system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens = 600): Promise<string> {
  const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: TEXT_MODEL_ANTHROPIC,
    max_tokens: maxTokens,
    system,
    messages,
  })
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Anthropic: respuesta inesperada')
  return content.text
}

// ── Anthropic: visión (fallback) ─────────────────────────────────────────────
async function anthropicVision(system: string, images: ImageInput[], userText: string, maxTokens = 2000): Promise<string> {
  const VALID_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
  type ValidType = typeof VALID_TYPES[number]

  const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const imageBlocks = images.map(img => {
    let mt = img.mediaType as string
    if (mt === 'image/jpg') mt = 'image/jpeg'
    if (!(VALID_TYPES as readonly string[]).includes(mt)) mt = 'image/jpeg'
    return {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: mt as ValidType, data: img.data },
    }
  })

  const response = await client.messages.create({
    model: TEXT_MODEL_ANTHROPIC,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: [...imageBlocks, { type: 'text' as const, text: userText }] }],
  })
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Anthropic-Vision: respuesta inesperada')
  return content.text
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Llamada texto: NVIDIA gratis → Anthropic fallback
 * Acepta historial de conversación para soporte multi-turno (soporte, chat)
 */
export async function callAI(
  system: string,
  userOrMessages: string | { role: 'user' | 'assistant'; content: string }[],
  maxTokens = 600,
  timeoutMs = 15_000,
  noFallback = true
): Promise<string> {
  const messages: { role: 'user' | 'assistant'; content: string }[] =
    typeof userOrMessages === 'string'
      ? [{ role: 'user', content: userOrMessages }]
      : userOrMessages

  const user = messages[messages.length - 1]?.content ?? ''
  const hasNvidia = !!process.env.NVIDIA_API_KEY

  if (hasNvidia) {
    try {
      // NVIDIA solo acepta un mensaje user en la API NIM sin historial multi-turn robusto
      // Para multi-turn, concatenamos el historial en el system prompt
      let effectiveSystem = system
      if (messages.length > 1) {
        const history = messages.slice(0, -1).map(m => `[${m.role === 'user' ? 'Usuario' : 'Asistente'}]: ${m.content}`).join('\n')
        effectiveSystem = system + `\n\nCONVERSACIÓN PREVIA:\n${history}`
      }
      return await Promise.race([
        nvidiaText(effectiveSystem, user, maxTokens),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('NVIDIA timeout')), timeoutMs)),
      ])
    } catch (e) {
      const msg = (e as Error).message
      console.warn('[AI-CLIENT] NVIDIA falló:', msg)
      if (noFallback) throw new Error(`NIM falló: ${msg}`)
    }
  }

  if (noFallback) throw new Error('NVIDIA_API_KEY no configurada y noFallback=true')
  return anthropicText(system, messages, maxTokens)
}

/**
 * Llamada con búsqueda web: Gemini Flash + Google Search grounding
 * Usar SOLO para agentes que necesitan datos reales de internet (Lead Hunter, research)
 * Fallback a callAI() si Gemini no disponible o falla
 */
export async function callAISearch(
  system: string,
  user: string,
  maxTokens = 1500,
  timeoutMs = 45_000
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY

  if (geminiKey) {
    try {
      const res = await Promise.race([
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              tools: [{ google_search: {} }],
              generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
            }),
          }
        ),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini timeout')), timeoutMs)),
      ])

      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
      if (!text) throw new Error('Gemini: respuesta vacía')
      return text
    } catch (e) {
      console.warn('[AI-CLIENT] Gemini Search falló, fallback callAI:', (e as Error).message)
    }
  }

  // Fallback a NIM→Haiku sin search grounding
  return callAI(system, user, maxTokens, timeoutMs, false)
}

/**
 * Llamada visión: NVIDIA gratis → Anthropic fallback
 */
export async function callAIVision(
  system: string,
  images: ImageInput[],
  userText: string,
  maxTokens = 2000,
  timeoutMs = 30_000,
  noFallback = true
): Promise<string> {
  const hasNvidia = !!process.env.NVIDIA_API_KEY

  if (hasNvidia) {
    try {
      return await Promise.race([
        nvidiaVision(system, images, userText, maxTokens),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('NVIDIA-Vision timeout')), timeoutMs)),
      ])
    } catch (e) {
      if (noFallback) throw new Error(`[AI-CLIENT] NVIDIA-Vision falló (noFallback): ${(e as Error).message}`)
      console.warn('[AI-CLIENT] NVIDIA-Vision falló, fallback Anthropic:', (e as Error).message)
    }
  }

  if (noFallback) throw new Error('[AI-CLIENT] NVIDIA no disponible y noFallback=true')
  return anthropicVision(system, images, userText, maxTokens)
}
