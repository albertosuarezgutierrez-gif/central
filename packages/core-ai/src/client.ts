// Wrapper de alto nivel que lee NVIDIA_API_KEY del entorno (con fallback gratis a Groq).
// Las apps que necesiten config explícita (tests, multi-proveedor) siguen usando
// nimChat/nimText directamente con su NimConfig inyectado.
//
// Política de fallback de TEXTO (compartida por todas las verticales que usan este
// wrapper, incluida la PASARELA de plataforma, cuyas rutas /api/ai/chat y /api/ai/tools
// llaman aquí): NIM → Groq (mismo Llama 3.3 70B, gratis, otra infra) → Gemini (GRATIS, otra
// infra distinta) → Kimi/Moonshot (de pago, último recurso). Cada eslabón queda inactivo si
// no está su API key, sin romper nada. Objetivo: que "IA no disponible" sea casi imposible —
// harían falta 3 proveedores gratis caídos a la vez para llegar al de pago.

import { nimChat, nimChatTools } from './nim'
import { groqChat, groqChatTools } from './groq'
import { moonshotChat } from './moonshot'
import { geminiChat } from './gemini'
import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import type { NimConfig } from './types'
import type { GroqConfig } from './groq'
import type { MoonshotConfig } from './moonshot'
import type { GeminiConfig } from './gemini'

const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct'
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2-0711-preview'
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

function envConfig(model?: string): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')
  return { apiKey, textModel: model ?? DEFAULT_MODEL }
}

// Config Groq de fallback desde el entorno. Devuelve null si no hay GROQ_API_KEY (el
// fallback queda inactivo sin romper nada). NO reutiliza el `model` de NIM (ids distintos):
// usa el modelo Groq propio (override `GROQ_BRAIN_MODEL`).
function groqEnvConfig(): GroqConfig | null {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  return { apiKey, textModel: process.env.GROQ_BRAIN_MODEL ?? DEFAULT_GROQ_MODEL }
}

// Config Gemini de fallback GRATIS desde el entorno. null si no hay GEMINI_API_KEY (inactivo, no
// rompe). La key ya suele estar puesta para la búsqueda web, así que este fallback se activa solo.
// Usa chat de texto SIN grounding (geminiChat). Modelo override: GEMINI_BRAIN_MODEL.
function geminiEnvConfig(): GeminiConfig | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  return { apiKey, model: process.env.GEMINI_BRAIN_MODEL ?? DEFAULT_GEMINI_MODEL }
}

// Config Moonshot/Kimi de ÚLTIMO fallback (de pago) desde el entorno. null si no hay
// MOONSHOT_API_KEY (queda inactivo sin romper nada). Modelo override: MOONSHOT_MODEL.
function moonshotEnvConfig(): MoonshotConfig | null {
  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) return null
  return { apiKey, textModel: process.env.MOONSHOT_MODEL ?? DEFAULT_MOONSHOT_MODEL, baseUrl: process.env.MOONSHOT_BASE_URL || undefined }
}

/**
 * Completion de texto: NVIDIA NIM (gratis) → Groq (gratis) → Gemini (gratis) → Kimi (de pago).
 * Cada fallback se activa solo si está su API key. Acepta string (prompt) o array de mensajes.
 */
export async function aiComplete(
  promptOrMessages: string | NimChatMessage[],
  options: {
    system?: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
    model?: string
  } = {},
): Promise<string> {
  const { system, maxTokens = 800, temperature = 0.3, timeoutMs = 30_000, model } = options
  const messages: NimChatMessage[] = typeof promptOrMessages === 'string'
    ? [{ role: 'user', content: promptOrMessages }]
    : promptOrMessages
  const sig = () => (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  try {
    return await nimChat(envConfig(model), messages, { system, maxTokens, temperature, signal: sig() })
  } catch (eNim) {
    // Los fallbacks NO deben fallar en SILENCIO: si todos caen, "IA no disponible" era un misterio
    // (p.ej. NIM con timeout + Gemini con 429) porque estos catch tragaban el error. Ahora cada
    // eslabón deja rastro en logs — qué proveedor falló y por qué, o si estaba inactivo por falta de key.
    console.warn(`[aiComplete] NIM falló (${msg(eNim)}); probando fallbacks`)
    // Fallback 1: Groq GRATIS (mismo Llama 3.3 70B). Señal nueva (la de NIM pudo abortar).
    const groq = groqEnvConfig()
    if (groq) {
      try {
        return await groqChat(groq, messages, { system, maxTokens, temperature, signal: sig() })
      } catch (eGroq) { console.warn(`[aiComplete] fallback Groq falló: ${msg(eGroq)}`) }
    } else {
      console.warn('[aiComplete] fallback Groq inactivo: falta GROQ_API_KEY')
    }
    // Fallback 2: Gemini GRATIS (otra infra distinta). Sin grounding; la key suele estar ya puesta,
    // así que este eslabón se activa solo y es el que evita "IA no disponible" sin coste alguno.
    const gemini = geminiEnvConfig()
    if (gemini) {
      try {
        return await geminiChat(gemini, messages, { system, maxTokens, temperature, timeoutMs })
      } catch (eGem) { console.warn(`[aiComplete] fallback Gemini falló: ${msg(eGem)}`) }
    } else {
      console.warn('[aiComplete] fallback Gemini inactivo: falta GEMINI_API_KEY')
    }
    // Fallback 3: Moonshot/Kimi (de pago, último recurso) → capacidad extra cuando los 3 gratis fallan.
    const kimi = moonshotEnvConfig()
    if (kimi) {
      try {
        return await moonshotChat(kimi, messages, { system, maxTokens, temperature, signal: sig() })
      } catch (eKimi) { console.warn(`[aiComplete] fallback Kimi falló: ${msg(eKimi)}`) }
    } else {
      console.warn('[aiComplete] fallback Kimi inactivo: falta MOONSHOT_API_KEY')
    }
    console.error(`[aiComplete] TODOS los proveedores fallaron (NIM+fallbacks). Origen: ${msg(eNim)}`)
    throw eNim
  }
}

/**
 * Function-calling: NVIDIA NIM (gratis) → Groq (gratis, mismo modelo) de fallback.
 * Lee `NVIDIA_API_KEY`/`GROQ_API_KEY` del entorno. Wrapper usado por la pasarela central
 * (endpoint `/api/ai/tools`) y por el camino directo de las verticales.
 */
export async function aiTools(
  messages: NimToolMessage[],
  tools: unknown[],
  options: { system?: string; maxTokens?: number; model?: string } = {},
): Promise<NimToolResult> {
  try {
    return await nimChatTools(envConfig(options.model), messages, tools, {
      system: options.system,
      model: options.model,
      maxTokens: options.maxTokens,
    })
  } catch (e) {
    const groq = groqEnvConfig()
    if (!groq) throw e
    // No reenviamos `model` (id de NIM): Groq usa su propio modelo (config.textModel).
    return await groqChatTools(groq, messages, tools, {
      system: options.system,
      maxTokens: options.maxTokens,
    })
  }
}
