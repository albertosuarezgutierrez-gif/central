// Wrapper de alto nivel que lee NVIDIA_API_KEY del entorno (con fallback gratis a Groq).
// Las apps que necesiten config explícita (tests, multi-proveedor) siguen usando
// nimChat/nimText directamente con su NimConfig inyectado.
//
// Política de fallback de TEXTO (compartida por todas las verticales que usan este
// wrapper, incluida la PASARELA de plataforma, cuyas rutas /api/ai/chat y /api/ai/tools
// llaman aquí): OpenRouter (agregador con fallback nativo entre modelos, si hay key) →
// NIM → Groq (gpt-oss-120b, gratis, otra infra) → Cerebras (gratis, infra WSE
// independiente) → [Gemini, APAGADO por defecto]
// → Kimi/Moonshot (de pago, último recurso). Cada eslabón queda inactivo si no está su
// API key, sin romper nada: sin OPENROUTER_API_KEY la cadena es EXACTAMENTE la de
// siempre. Objetivo: que "IA no disponible" sea casi imposible.
//
// 🚨 GEMINI APAGADO POR DEFECTO (02/08/2026). Hallazgo del health-check (Check 12):
// `GEMINI_API_KEY` acumulaba 544 llamadas en 30 días y CERO éxitos (429 de cuota en todos
// los endpoints y modelos) — no es una racha, es una key sin cuota. El eslabón no salvaba
// nada y cada caída de NIM+Groq pagaba además su timeout antes de llegar a Kimi/OpenRouter.
// Decisión de Alberto: «usa OpenRouter». El código se conserva entero; se reactiva con
// `GEMINI_TEXTO=1` cuando haya una key con cuota (mismo patrón que `GEMINI_WEBSEARCH` en
// `apps/plataforma/lib/websearch.ts`).

import { nimChat, nimChatTools } from './nim'
import { groqChat, groqChatTools } from './groq'
import { cerebrasChat } from './cerebras'
import { moonshotChat } from './moonshot'
import { geminiChat } from './gemini'
import { openrouterChat, openrouterChatTools } from './openrouter'
import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import type { NimConfig } from './types'
import type { GroqConfig } from './groq'
import type { CerebrasConfig } from './cerebras'
import type { MoonshotConfig } from './moonshot'
import type { GeminiConfig } from './gemini'
import type { OpenRouterConfig } from './openrouter'

// `meta/llama-3.3-70b-instruct` deja de soportarse en NIM el 25/08/2026 (aviso en su ficha
// de build.nvidia.com; NVIDIA no nombra sucesor concreto). Maverick es el sustituto elegido:
// mismo vendor, multilingüe, vivo en catálogo y gratis en el tier de build.nvidia.com.
const DEFAULT_MODEL = 'meta/llama-4-maverick-17b-128e-instruct'
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b'
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2.6'
// `gemini-2.5-flash` da 404 en la API directa desde el 09/07/2026; alias rodante vigente.
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest'

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

// Config Cerebras de fallback GRATIS desde el entorno (4º proveedor, infra WSE distinta de
// NIM/Groq: sube la resiliencia frente a un apagón simultáneo como el del 06/07/2026). null si
// no hay CEREBRAS_API_KEY → eslabón inactivo, sin romper nada. Modelo override: CEREBRAS_MODEL.
// OJO: el tier gratis limita el contexto a 8192 tokens — backstop de texto corto, no de prompts largos.
function cerebrasEnvConfig(): CerebrasConfig | null {
  const apiKey = process.env.CEREBRAS_API_KEY
  if (!apiKey) return null
  return { apiKey, textModel: process.env.CEREBRAS_MODEL ?? DEFAULT_CEREBRAS_MODEL }
}

// Config Gemini de fallback desde el entorno. APAGADO por defecto (ver cabecera: la key lleva
// meses sin cuota y el eslabón solo pagaba timeouts): requiere `GEMINI_TEXTO=1` ADEMÁS de
// GEMINI_API_KEY. Usa chat de texto SIN grounding (geminiChat). Modelo override: GEMINI_BRAIN_MODEL.
function geminiEnvConfig(): GeminiConfig | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (process.env.GEMINI_TEXTO !== '1' || !apiKey) return null
  return { apiKey, model: process.env.GEMINI_BRAIN_MODEL ?? DEFAULT_GEMINI_MODEL }
}

// Config Moonshot/Kimi de ÚLTIMO fallback (de pago) desde el entorno. null si no hay
// MOONSHOT_API_KEY (queda inactivo sin romper nada). Modelo override: MOONSHOT_MODEL.
function moonshotEnvConfig(): MoonshotConfig | null {
  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) return null
  return { apiKey, textModel: process.env.MOONSHOT_MODEL ?? DEFAULT_MOONSHOT_MODEL, baseUrl: process.env.MOONSHOT_BASE_URL || undefined }
}

// Config OpenRouter PRIMARIO desde el entorno. null si no hay OPENROUTER_API_KEY (queda
// inactivo y la cadena arranca en NIM como siempre → rollout por proyecto poniendo la env).
// OPENROUTER_MODEL = modelo por defecto; OPENROUTER_FALLBACK_MODELS = suplentes csv para el
// fallback NATIVO de OpenRouter (conmuta solo dentro de la misma petición).
function openrouterEnvConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? '')
    .split(',').map((s: string) => s.trim()).filter(Boolean)
  return {
    apiKey,
    textModel: process.env.OPENROUTER_MODEL || undefined,
    fallbackModels: fallbacks.length ? fallbacks : undefined,
    baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
    referer: process.env.OPENROUTER_REFERER || undefined,
    title: process.env.OPENROUTER_TITLE || undefined,
  }
}

/**
 * Completion de texto: OpenRouter (agregador, si hay key) → NVIDIA NIM (gratis) → Groq (gratis)
 * → Cerebras (gratis) → [Gemini, solo con GEMINI_TEXTO=1] → Kimi (de pago). Cada eslabón se activa solo si está su API key.
 * Acepta string (prompt) o array de mensajes.
 *
 * OJO con `options.model`: es un id de NIM (p. ej. `deepseek-ai/deepseek-v3`), NO un slug de
 * OpenRouter. Si el caller fija modelo, se respeta NIM como primario (comportamiento de siempre)
 * y OpenRouter pasa a ser un fallback más (con SU propio modelo por defecto).
 */
export async function aiComplete(
  promptOrMessages: string | NimChatMessage[],
  options: {
    system?: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
    model?: string
    /** La PASARELA lo pone a true cuando ya intentó/bloqueó OpenRouter (presupuesto): evita reintentarlo aquí. */
    skipOpenRouter?: boolean
  } = {},
): Promise<string> {
  const { system, maxTokens = 800, temperature = 0.3, timeoutMs = 30_000, model } = options
  const messages: NimChatMessage[] = typeof promptOrMessages === 'string'
    ? [{ role: 'user', content: promptOrMessages }]
    : promptOrMessages
  const sig = () => (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  // Primario: OpenRouter (solo sin modelo NIM pinneado — ids incompatibles). Su fallback nativo
  // `models` ya prueba varios modelos dentro de la misma petición; si aun así falla, cadena directa.
  const openrouter = options.skipOpenRouter ? null : openrouterEnvConfig()
  if (openrouter && !model) {
    try {
      return await openrouterChat(openrouter, messages, { system, maxTokens, temperature, signal: sig() })
    } catch (eOr) { console.warn(`[aiComplete] OpenRouter (primario) falló: ${msg(eOr)}; probando cadena directa`) }
  }
  try {
    return await nimChat(envConfig(model), messages, { system, maxTokens, temperature, signal: sig() })
  } catch (eNim) {
    // Los fallbacks NO deben fallar en SILENCIO: si todos caen, "IA no disponible" era un misterio
    // (p.ej. NIM con timeout + Gemini con 429) porque estos catch tragaban el error. Cada eslabón
    // deja rastro en logs — qué proveedor falló y por qué, o si estaba inactivo por falta de key.
    console.warn(`[aiComplete] NIM falló (${msg(eNim)}); probando fallbacks`)
    // Fallback 1: Groq GRATIS (gpt-oss-120b). Señal nueva (la de NIM pudo abortar).
    const groq = groqEnvConfig()
    if (groq) {
      try {
        return await groqChat(groq, messages, { system, maxTokens, temperature, signal: sig() })
      } catch (eGroq) { console.warn(`[aiComplete] fallback Groq falló: ${msg(eGroq)}`) }
    } else {
      console.warn('[aiComplete] fallback Groq inactivo: falta GROQ_API_KEY')
    }
    // Fallback 2: Cerebras GRATIS. Mismo modelo `gpt-oss-120b` que Groq pero hardware y cuenta
    // independientes, así que un apagón de Groq no lo arrastra. Inactivo sin CEREBRAS_API_KEY.
    const cerebras = cerebrasEnvConfig()
    if (cerebras) {
      try {
        return await cerebrasChat(cerebras, messages, { system, maxTokens, temperature, signal: sig() })
      } catch (eCer) { console.warn(`[aiComplete] fallback Cerebras falló: ${msg(eCer)}`) }
    } else {
      console.warn('[aiComplete] fallback Cerebras inactivo: falta CEREBRAS_API_KEY')
    }
    // Fallback 3: Gemini, APAGADO por defecto (key sin cuota, ver cabecera). Solo entra con
    // GEMINI_TEXTO=1 + GEMINI_API_KEY.
    const gemini = geminiEnvConfig()
    if (gemini) {
      try {
        return await geminiChat(gemini, messages, { system, maxTokens, temperature, timeoutMs })
      } catch (eGem) { console.warn(`[aiComplete] fallback Gemini falló: ${msg(eGem)}`) }
    } else {
      console.warn('[aiComplete] fallback Gemini inactivo (requiere GEMINI_TEXTO=1 + GEMINI_API_KEY)')
    }
    // Fallback 4: OpenRouter si NO se probó como primario (caller con modelo NIM pinneado).
    // Usa SU modelo por defecto: en un escenario de fallo total, una respuesta de otro modelo
    // vale más que "IA no disponible" (misma filosofía que el salto a Groq/Gemini).
    if (openrouter && model) {
      try {
        return await openrouterChat(openrouter, messages, { system, maxTokens, temperature, signal: sig() })
      } catch (eOr2) { console.warn(`[aiComplete] OpenRouter (fallback) falló: ${msg(eOr2)}`) }
    }
    // Fallback 5: Moonshot/Kimi (de pago, último recurso) → capacidad extra cuando todo lo demás falla.
    const kimi = moonshotEnvConfig()
    if (kimi) {
      try {
        return await moonshotChat(kimi, messages, { system, maxTokens, temperature, signal: sig() })
      } catch (eKimi) { console.warn(`[aiComplete] fallback Kimi falló: ${msg(eKimi)}`) }
    } else {
      console.warn('[aiComplete] fallback Kimi inactivo: falta MOONSHOT_API_KEY')
    }
    console.error(`[aiComplete] TODOS los proveedores fallaron. Origen: ${msg(eNim)}`)
    throw eNim
  }
}

/**
 * Function-calling: OpenRouter (si hay key) → NVIDIA NIM (gratis) → Groq (gratis) de fallback.
 * Lee `OPENROUTER_API_KEY`/`NVIDIA_API_KEY`/`GROQ_API_KEY` del entorno. Wrapper usado por la
 * pasarela central (endpoint `/api/ai/tools`) y por el camino directo de las verticales.
 * Igual que en `aiComplete`, un `model` pinneado es id de NIM → OpenRouter solo va primero
 * cuando no hay modelo fijado.
 */
export async function aiTools(
  messages: NimToolMessage[],
  tools: unknown[],
  options: { system?: string; maxTokens?: number; model?: string; skipOpenRouter?: boolean } = {},
): Promise<NimToolResult> {
  const openrouter = options.skipOpenRouter ? null : openrouterEnvConfig()
  if (openrouter && !options.model) {
    try {
      return await openrouterChatTools(openrouter, messages, tools, {
        system: options.system,
        maxTokens: options.maxTokens,
      })
    } catch { /* cae a la cadena directa NIM → Groq */ }
  }
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
