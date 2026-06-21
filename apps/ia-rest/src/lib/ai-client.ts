import { cleanJSON, nimText, nimVision, geminiSearch, nimChatTools, gatewayChat, gatewaySearch, gatewayVision, gatewayTools } from '@central/core-ai'
import type { ImageInput, NimConfig, NimToolMessage, NimToolResult, GatewayConfig } from '@central/core-ai'

/**
 * ai-client.ts
 * Cliente IA centralizado: NVIDIA NIM (gratis) primero → Anthropic Claude (fallback)
 *
 * El cliente NIM canónico vive en el paquete compartido `@central/core-ai`
 * (casa de marcas, identity-agnostic). Este módulo conserva la API pública del
 * proyecto (callAI/callAISearch/callAIVision/cleanJSON/ImageInput), la config de
 * entorno y el fallback a Claude — solo delega la llamada NIM en el paquete.
 *
 * Uso:
 *   import { callAI, callAIVision, callAISearch } from '@/lib/ai-client'
 *   const text = await callAI(systemPrompt, userText)
 *   const text = await callAIVision(systemPrompt, images, userText)
 *
 * Sin config para el dueño — todo gestionado por el operador via env vars Vercel.
 */

/**
 * ═══════════════════════════════════════════════════════════════
 * GUÍA DE SELECCIÓN DE MODELO — leer antes de añadir cualquier
 * llamada a IA en el proyecto
 * ═══════════════════════════════════════════════════════════════
 *
 * REGLA GENERAL: NUNCA llamar NIM/Anthropic/Gemini directamente.
 * Usar siempre las funciones de este módulo.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ callAI()  — texto, sin internet                             │
 * │   Cuándo: generación, clasificación, extracción, resúmenes  │
 * │   Cuándo NO: cuando necesitas datos actuales de internet    │
 * │   Modelo: NIM llama-3.3-70b → Haiku fallback               │
 * │   noFallback=true (default): agentes críticos sin créditos  │
 * │   noFallback=false: tareas auxiliares (aliases, sugerencias)│
 * ├─────────────────────────────────────────────────────────────┤
 * │ callAISearch() — texto + búsqueda web (Gemini + Google)     │
 * │   Cuándo: research de leads, noticias, datos actuales       │
 * │   Cuándo NO: generación pura sin necesidad de internet      │
 * │   Gemini NO gana a NIM en tareas sin búsqueda web           │
 * │   Fallback automático a callAI() si Gemini no disponible    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ callAIVision() — análisis de imágenes                       │
 * │   Cuándo: OCR albaranes, clasificación docs, cartas         │
 * │   Modelo: NIM llama-3.2-11b-vision → Haiku fallback         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * CRITERIOS DE ELECCIÓN PARA NUEVAS TAREAS:
 *
 *  ¿Necesita datos actuales de internet?
 *    SÍ  → callAISearch()
 *    NO  → callAI() o callAIVision()
 *
 *  ¿Analiza imágenes?
 *    SÍ  → callAIVision()
 *
 *  ¿Es tarea auxiliar (puede fallar sin crítica)?
 *    SÍ  → callAI(..., noFallback=false)  ← usa Haiku si NIM falla
 *    NO  → callAI(..., noFallback=true)   ← lanza error si NIM falla
 *
 *  ¿Output muy corto (<20 tokens) con alta precisión requerida?
 *    Haiku supera a NIM en clasificación binaria/ternaria corta.
 *    Para esos casos usar callAI con noFallback=false — si NIM falla
 *    el fallback a Haiku dará mejor resultado.
 *
 * PARA EVALUAR QUÉ MODELO ES MEJOR EN UNA TAREA NUEVA:
 *   1. Implementar con callAI() (noFallback=false)
 *   2. Loguear en ia_training_log: modelo usado + output + calidad
 *   3. Comparar calidad NIM vs Haiku tras 100+ ejecuciones reales
 *   4. Decidir si forzar un modelo concreto o mantener el fallback
 */

// Re-export para no romper importadores existentes (`@/lib/ai-client`).
export { cleanJSON }
export type { ImageInput }

// Modelos por defecto (sobrescribibles via env var si hace falta)
const TEXT_MODEL_NVIDIA   = process.env.NVIDIA_BRAIN_MODEL      ?? 'meta/llama-3.3-70b-instruct'
const VISION_MODEL_NVIDIA = process.env.NVIDIA_VISION_MODEL     ?? 'meta/llama-3.2-11b-vision-instruct'

// Config NIM desde el entorno de ESTA app (el paquete core-ai no lee process.env).
function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')
  return { apiKey, textModel: TEXT_MODEL_NVIDIA, visionModel: VISION_MODEL_NVIDIA }
}

// PASARELA central (plataforma): si está configurada (env de equipo en Vercel), las llamadas de
// texto/búsqueda/visión/function-calling van por ahí (keys de proveedor y control de coste viven en
// plataforma). Si no está, o si falla, se cae al camino directo NIM→Anthropic/Gemini de abajo.
const APP = 'ia-rest'
function gatewayCfg(): GatewayConfig | null {
  const url = process.env.AI_GATEWAY_URL
  const secret = process.env.AI_GATEWAY_SECRET
  return url && secret ? { url, secret, app: APP } : null
}

// ── NVIDIA: llamada texto (delega en @central/core-ai) ────────────────────────
// `model` permite forzar un modelo concreto por llamada (p. ej. el 8B rápido para
// tareas con presupuesto de tiempo ajustado). Por defecto usa el de nimConfig().
async function nvidiaText(system: string, user: string, maxTokens = 600, model?: string): Promise<string> {
  const config = model ? { ...nimConfig(), textModel: model } : nimConfig()
  return nimText(config, system, user, maxTokens)
}

// ── NVIDIA: llamada visión (multi-imagen, delega en @central/core-ai) ─────────
async function nvidiaVision(system: string, images: ImageInput[], userText: string, maxTokens = 2000): Promise<string> {
  return nimVision(nimConfig(), system, images, userText, maxTokens)
}

// Nota: el fallback a Anthropic (texto y visión) se RETIRÓ el 17/06/2026 — la cuenta estaba sin
// saldo y la IA ya va por NVIDIA NIM + Gemini (directo o por la pasarela central). `noFallback`
// se mantiene en las firmas por compatibilidad, pero ya no existe proveedor de fallback de pago.

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
  // Default NIM puro: la cuenta de Anthropic (fallback) está SIN SALDO, así que caer
  // a ella solo da "credit balance too low". Pasa noFallback=false explícito para
  // reactivar el fallback (cuando Anthropic tenga crédito de nuevo).
  noFallback = true,
  // Modelo NIM concreto para esta llamada (p. ej. 'meta/llama-3.1-8b-instruct' rápido
  // cuando hay poco presupuesto de tiempo). Por defecto, el modelo de nimConfig().
  model?: string
): Promise<string> {
  const messages: { role: 'user' | 'assistant'; content: string }[] =
    typeof userOrMessages === 'string'
      ? [{ role: 'user', content: userOrMessages }]
      : userOrMessages

  const user = messages[messages.length - 1]?.content ?? ''

  // Pasarela central primero (si configurada). Si falla, sigue el camino directo de abajo.
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return await gatewayChat(cfg, messages, { system, maxTokens, timeoutMs })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela chat falló, fallback directo:', (e as Error).message)
    }
  }

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
        nvidiaText(effectiveSystem, user, maxTokens, model),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('NVIDIA timeout')), timeoutMs)),
      ])
    } catch (e) {
      const msg = (e as Error).message
      console.warn('[AI-CLIENT] NVIDIA falló:', msg)
      if (noFallback) throw new Error(`NIM falló: ${msg}`)
    }
  }

  // Sin fallback Anthropic (retirado). Si NIM no está disponible, error.
  throw new Error('NIM no disponible (NVIDIA_API_KEY ausente o falló) y sin fallback Anthropic')
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
  // Pasarela central primero (Gemini por debajo). Si falla, intenta Gemini directo y luego NIM.
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return await gatewaySearch(cfg, system, user, { maxTokens, timeoutMs })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela search falló, fallback directo:', (e as Error).message)
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY

  if (geminiKey) {
    try {
      // Adaptador Gemini (búsqueda web) en el núcleo compartido @central/core-ai.
      return await geminiSearch({ apiKey: geminiKey }, system, user, { maxTokens, timeoutMs })
    } catch (e) {
      console.warn('[AI-CLIENT] Gemini Search falló, fallback callAI:', (e as Error).message)
    }
  }

  // Fallback a NIM puro sin search grounding (sin tocar Anthropic, que está sin saldo)
  return callAI(system, user, maxTokens, timeoutMs, true)
}

/**
 * Function-calling con NVIDIA NIM (sustituye al tool-calling de Anthropic en los agentes del
 * god-panel). `tools` en formato OpenAI. Devuelve el mensaje del modelo (texto y/o tool_calls);
 * la ruta ejecuta las herramientas y reenvía los resultados como mensajes `role:'tool'`.
 */
export async function callAITools(
  system: string,
  messages: NimToolMessage[],
  tools: unknown[],
  maxTokens = 1024,
): Promise<NimToolResult> {
  // Pasarela central primero (registra uso/coste en plataforma). Si no está o falla, NIM directo.
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return await gatewayTools(cfg, messages, tools, { system, maxTokens })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela tools falló, fallback NIM directo:', (e as Error).message)
    }
  }
  return nimChatTools(nimConfig(), messages, tools, { system, maxTokens })
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
  noFallback = true // NIM puro por defecto (el fallback Anthropic está sin saldo)
): Promise<string> {
  // Pasarela central primero (NIM vision por debajo). Si falla, sigue el camino directo de abajo.
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return await gatewayVision(cfg, system, images, userText, { maxTokens })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela vision falló, fallback directo:', (e as Error).message)
    }
  }

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

  // Sin fallback Anthropic (retirado). Si NIM no está disponible, error.
  throw new Error('[AI-CLIENT] NVIDIA-Vision no disponible y sin fallback Anthropic')
}
