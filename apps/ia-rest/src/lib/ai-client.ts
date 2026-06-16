import { cleanJSON, nimText, nimVision, geminiSearch, nimChatTools, gatewayChat, gatewaySearch, gatewayVision } from '@central/core-ai'
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
const TEXT_MODEL_ANTHROPIC = 'claude-haiku-4-5-20251001'

// Config NIM desde el entorno de ESTA app (el paquete core-ai no lee process.env).
function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')
  return { apiKey, textModel: TEXT_MODEL_NVIDIA, visionModel: VISION_MODEL_NVIDIA }
}

// PASARELA central (plataforma): si está configurada (env de equipo en Vercel), las llamadas de
// texto/búsqueda/visión van por ahí (keys de proveedor y control de coste viven en plataforma).
// Si no está, o si falla, se cae al camino directo NIM→Anthropic de abajo. callAITools NO pasa por
// la pasarela (no expone function-calling) → sigue directo a NIM.
const APP = 'ia-rest'
function gatewayCfg(): GatewayConfig | null {
  const url = process.env.AI_GATEWAY_URL
  const secret = process.env.AI_GATEWAY_SECRET
  return url && secret ? { url, secret, app: APP } : null
}

// ── NVIDIA: llamada texto (delega en @central/core-ai) ────────────────────────
async function nvidiaText(system: string, user: string, maxTokens = 600): Promise<string> {
  return nimText(nimConfig(), system, user, maxTokens)
}

// ── NVIDIA: llamada visión (multi-imagen, delega en @central/core-ai) ─────────
async function nvidiaVision(system: string, images: ImageInput[], userText: string, maxTokens = 2000): Promise<string> {
  return nimVision(nimConfig(), system, images, userText, maxTokens)
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
  // Default NIM puro: la cuenta de Anthropic (fallback) está SIN SALDO, así que caer
  // a ella solo da "credit balance too low". Pasa noFallback=false explícito para
  // reactivar el fallback (cuando Anthropic tenga crédito de nuevo).
  noFallback = true
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

  if (noFallback) throw new Error('[AI-CLIENT] NVIDIA no disponible y noFallback=true')
  return anthropicVision(system, images, userText, maxTokens)
}
