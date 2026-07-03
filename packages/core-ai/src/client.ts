// Wrapper de alto nivel que lee NVIDIA_API_KEY del entorno (con fallback gratis a Groq).
// Las apps que necesiten config explícita (tests, multi-proveedor) siguen usando
// nimChat/nimText directamente con su NimConfig inyectado.
//
// Política de fallback de TEXTO (compartida por todas las verticales que usan este
// wrapper, incluida la PASARELA de plataforma, cuyas rutas /api/ai/chat y /api/ai/tools
// llaman aquí): NIM → Groq (mismo Llama 3.3 70B, gratis, otra infra). Si NIM falla o no
// hay NVIDIA_API_KEY, y existe GROQ_API_KEY, se sirve por Groq. En la pasarela esto
// encadena además con su fallback a Gemini → NIM → Groq → Gemini.

import { nimChat, nimChatTools } from './nim'
import { groqChat, groqChatTools } from './groq'
import { moonshotChat } from './moonshot'
import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import type { NimConfig } from './types'
import type { GroqConfig } from './groq'
import type { MoonshotConfig } from './moonshot'

const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct'
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2-0711-preview'

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

// Config Moonshot/Kimi de 3er fallback desde el entorno. null si no hay MOONSHOT_API_KEY (queda
// inactivo sin romper nada, igual que Groq). Modelo override: MOONSHOT_MODEL.
function moonshotEnvConfig(): MoonshotConfig | null {
  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) return null
  return { apiKey, textModel: process.env.MOONSHOT_MODEL ?? DEFAULT_MOONSHOT_MODEL, baseUrl: process.env.MOONSHOT_BASE_URL || undefined }
}

/**
 * Completion de texto: NVIDIA NIM (gratis) → Groq (gratis, mismo modelo) de fallback.
 * Acepta string (prompt directo) o array de mensajes (multi-turn).
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
  try {
    return await nimChat(envConfig(model), messages, { system, maxTokens, temperature, signal: sig() })
  } catch (eNim) {
    // Fallback 1: Groq GRATIS (mismo Llama 3.3 70B). Señal nueva (la de NIM pudo abortar).
    const groq = groqEnvConfig()
    if (groq) {
      try {
        return await groqChat(groq, messages, { system, maxTokens, temperature, signal: sig() })
      } catch { /* cae a Kimi */ }
    }
    // Fallback 2: Moonshot/Kimi (otra infra) → capacidad extra cuando NIM+Groq están saturados.
    const kimi = moonshotEnvConfig()
    if (kimi) return await moonshotChat(kimi, messages, { system, maxTokens, temperature, signal: sig() })
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
