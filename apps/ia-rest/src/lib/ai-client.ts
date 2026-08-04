import { cleanJSON, nimText, nimVision, geminiSearch, geminiVision, nimChatTools, groqText, groqChatTools, openrouterChat, openrouterChatTools, gatewayChat, gatewaySearch, gatewayVision, gatewayTools, gatewayVideo } from '@central/core-ai'
import type { ImageInput, NimConfig, GroqConfig, OpenRouterConfig, NimToolMessage, NimToolResult, GatewayConfig, GatewayVideoOpts } from '@central/core-ai'

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
 * │   Modelo: NIM llama-3.3-70b → Groq (gratis) → OpenRouter   │
 * │   Fallback automático: Groq = mismo modelo/otra infra;      │
 * │   OpenRouter = agregador (última red si caen NIM y Groq).   │
 * │   noFallback: legacy (ya no bloquea el fallback gratis Groq)│
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
 *  Disponibilidad: callAI() intenta NIM y, si falla, cae a Groq (mismo Llama
 *  3.3 70B, gratis) de forma automática. `noFallback` es legacy — antaño evitaba
 *  el fallback de PAGO (Anthropic, retirado); ya no bloquea el fallback gratis.
 *
 *  ¿Output muy corto (<20 tokens) con alta precisión requerida?
 *    NIM/Groq (Llama 3.3 70B) rinden bien; si quieres comparar modelos,
 *    fuerza uno concreto con el parámetro `model` y mide en ia_training_log.
 *
 * PARA EVALUAR QUÉ MODELO ES MEJOR EN UNA TAREA NUEVA:
 *   1. Implementar con callAI()
 *   2. Loguear en ia_training_log: modelo usado + output + calidad
 *   3. Comparar calidad tras 100+ ejecuciones reales
 *   4. Decidir si forzar un modelo concreto (param `model`) o dejar el fallback
 */

// Re-export para no romper importadores existentes (`@/lib/ai-client`).
export { cleanJSON }
export type { ImageInput }

// Modelos por defecto (sobrescribibles via env var si hace falta)
const TEXT_MODEL_NVIDIA   = process.env.NVIDIA_BRAIN_MODEL      ?? 'meta/llama-3.3-70b-instruct'
const VISION_MODEL_NVIDIA = process.env.NVIDIA_VISION_MODEL     ?? 'meta/llama-3.2-11b-vision-instruct'
// Fallback de texto GRATIS: Groq sirve el MISMO Llama 3.3 70B que NIM, en otra infra.
const TEXT_MODEL_GROQ     = process.env.GROQ_BRAIN_MODEL        ?? 'openai/gpt-oss-120b'

// Config NIM desde el entorno de ESTA app (el paquete core-ai no lee process.env).
function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')
  return { apiKey, textModel: TEXT_MODEL_NVIDIA, visionModel: VISION_MODEL_NVIDIA }
}

// Config Groq (fallback de texto). `GROQ_API_KEY` ya existe en producción (la usa el EAR/Whisper).
// Devuelve null si no está configurada, para no romper si el operador no la define.
function groqConfig(): GroqConfig | null {
  const apiKey = process.env.GROQ_API_KEY
  return apiKey ? { apiKey, textModel: TEXT_MODEL_GROQ } : null
}

// Config OpenRouter (agregador con fallback NATIVO entre proveedores) — ÚLTIMA red cuando NIM
// y Groq caen a la vez (los 3 gratis directos pueden apagarse simultáneamente). Devuelve null
// si no hay OPENROUTER_API_KEY, así que el camino de siempre no cambia sin la env.
// OPENROUTER_MODEL = modelo por defecto; OPENROUTER_FALLBACK_MODELS = suplentes csv.
function openrouterConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  return {
    apiKey,
    textModel: process.env.OPENROUTER_MODEL || undefined,
    fallbackModels: fallbacks.length ? fallbacks : undefined,
    referer: process.env.OPENROUTER_REFERER || undefined,
    title: process.env.OPENROUTER_TITLE || undefined,
  }
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

// ── Gemini: visión/OCR de calidad (delega en @central/core-ai) ────────────────
// Gemini Flash lee mucho mejor que NIM y acepta imágenes grandes (NIM cae a ~180 KB
// inline). Es el camino preferido para OCR (etiquetas, albaranes, sondas).
async function geminiVisionCall(system: string, images: ImageInput[], userText: string, maxTokens = 2000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')
  return geminiVision({ apiKey }, system, images, userText, { maxTokens })
}

// ── Groq: llamada texto de FALLBACK (delega en @central/core-ai) ──────────────
// Mismo modelo Llama 3.3 70B que NIM, servido gratis por Groq desde otra infra.
async function groqTextFallback(system: string, user: string, maxTokens = 600): Promise<string | null> {
  const cfg = groqConfig()
  if (!cfg) return null
  return groqText(cfg, system, user, maxTokens)
}

// ── OpenRouter: llamada texto de ÚLTIMO fallback (delega en @central/core-ai) ──
// Agregador: una key da acceso a decenas de proveedores con fallback nativo entre modelos,
// así que sobrevive a un apagón simultáneo de NIM + Groq. Devuelve null si no hay key.
async function openrouterTextFallback(system: string, user: string, maxTokens = 600): Promise<string | null> {
  const cfg = openrouterConfig()
  if (!cfg) return null
  return openrouterChat(cfg, [{ role: 'user', content: user }], { system, maxTokens })
}

// Nota: el fallback a Anthropic (texto y visión) se RETIRÓ el 17/06/2026 (cuenta sin saldo). El
// fallback de TEXTO se restauró con **Groq** (mismo Llama 3.3 70B que NIM, gratis) — ver
// `groqTextFallback`/`callAI`. VISIÓN sigue NIM-only (Groq no tiene vision model equivalente gratis).
// `noFallback` ya NO bloquea el fallback gratuito a Groq; solo evita reintentos de pago (que ya no hay).

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

  // Pasarela central primero (si configurada). Si el llamante fuerza un `model` concreto
  // (p. ej. el 8B rápido de blog-seo para caber en el límite de ~60s de Vercel), saltamos la
  // pasarela —que usa su modelo por defecto e ignora `model`— y vamos directos a NIM, que sí
  // lo respeta. Si falla, sigue el camino directo de abajo.
  const cfg = model ? null : gatewayCfg()
  if (cfg) {
    try {
      return await gatewayChat(cfg, messages, { system, maxTokens, timeoutMs })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela chat falló, fallback directo:', (e as Error).message)
    }
  }

  const hasNvidia = !!process.env.NVIDIA_API_KEY

  // NIM y Groq solo aceptan un mensaje user sin historial multi-turn robusto: para multi-turn
  // concatenamos el historial en el system prompt (mismo prompt efectivo para ambos proveedores).
  let effectiveSystem = system
  if (messages.length > 1) {
    const history = messages.slice(0, -1).map(m => `[${m.role === 'user' ? 'Usuario' : 'Asistente'}]: ${m.content}`).join('\n')
    effectiveSystem = system + `\n\nCONVERSACIÓN PREVIA:\n${history}`
  }

  if (hasNvidia) {
    try {
      return await Promise.race([
        nvidiaText(effectiveSystem, user, maxTokens, model),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('NVIDIA timeout')), timeoutMs)),
      ])
    } catch (e) {
      const msg = (e as Error).message
      console.warn('[AI-CLIENT] NVIDIA falló:', msg)
      // Fallback GRATIS a Groq (mismo Llama 3.3 70B). Solo lanzamos error si Groq tampoco está.
      try {
        const groqRes = await Promise.race([
          groqTextFallback(effectiveSystem, user, maxTokens),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('Groq timeout')), timeoutMs)),
        ])
        if (groqRes !== null) {
          console.warn('[AI-CLIENT] NVIDIA falló → fallback Groq OK')
          return groqRes
        }
        // groqRes === null → GROQ_API_KEY no configurada; sigue al fallback OpenRouter.
      } catch (ge) {
        console.warn('[AI-CLIENT] Groq fallback también falló:', (ge as Error).message)
      }
      // Última red: OpenRouter (agregador) cuando NIM y Groq caen a la vez. Inactivo sin
      // OPENROUTER_API_KEY, así que no altera el camino de siempre.
      try {
        const orRes = await Promise.race([
          openrouterTextFallback(effectiveSystem, user, maxTokens),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('OpenRouter timeout')), timeoutMs)),
        ])
        if (orRes !== null) {
          console.warn('[AI-CLIENT] NVIDIA+Groq fallaron → fallback OpenRouter OK')
          return orRes
        }
      } catch (oe) {
        console.warn('[AI-CLIENT] OpenRouter fallback también falló:', (oe as Error).message)
      }
      throw new Error(`NIM falló y sin fallback (Groq/OpenRouter) disponible: ${msg}`)
    }
  }

  // NIM no disponible (sin key): Groq y luego OpenRouter antes de rendirse.
  const groqRes = await groqTextFallback(effectiveSystem, user, maxTokens)
  if (groqRes !== null) return groqRes
  const orRes = await openrouterTextFallback(effectiveSystem, user, maxTokens)
  if (orRes !== null) return orRes
  throw new Error('Texto IA no disponible: NIM (NVIDIA_API_KEY), Groq (GROQ_API_KEY) y OpenRouter (OPENROUTER_API_KEY) ausentes')
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

  // Gemini directo APAGADO por defecto (02/08/2026): la key lleva meses con 429 de cuota
  // permanente (Check 12 del health-check de plataforma) y este intento solo pagaba un timeout
  // antes de caer a callAI. Reactivar con GEMINI_WEBSEARCH=1 cuando haya key con cuota (mismo
  // gate que lib/websearch.ts de plataforma).
  const geminiKey = process.env.GEMINI_WEBSEARCH === '1' ? process.env.GEMINI_API_KEY : undefined

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
  try {
    return await nimChatTools(nimConfig(), messages, tools, { system, maxTokens })
  } catch (e) {
    // Fallback GRATIS a Groq (mismo Llama 3.3 70B, también soporta function-calling OpenAI).
    const groqCfg = groqConfig()
    if (groqCfg) {
      try {
        console.warn('[AI-CLIENT] NIM tools falló → fallback Groq:', (e as Error).message)
        return await groqChatTools({ ...groqCfg, textModel: TEXT_MODEL_GROQ }, messages, tools, { system, maxTokens })
      } catch (ge) {
        console.warn('[AI-CLIENT] Groq tools también falló:', (ge as Error).message)
      }
    }
    // Última red: OpenRouter (agregador con function-calling OpenAI). Inactivo sin OPENROUTER_API_KEY.
    const orCfg = openrouterConfig()
    if (orCfg) {
      console.warn('[AI-CLIENT] NIM+Groq tools fallaron → fallback OpenRouter')
      return openrouterChatTools(orCfg, messages, tools, { system, maxTokens })
    }
    throw e
  }
}

/**
 * Generación de vídeo IA a través de la pasarela central.
 * FAL_API_KEY vive solo en plataforma; ia-rest solo necesita AI_GATEWAY_URL + AI_GATEWAY_SECRET.
 */
export async function callAIVideo(
  prompt: string,
  opts: Omit<GatewayVideoOpts, 'timeoutMs'> = {},
): Promise<string> {
  const cfg = gatewayCfg()
  if (!cfg) throw new Error('AI_GATEWAY_URL o AI_GATEWAY_SECRET no configurados en ia-rest')
  return gatewayVideo(cfg, prompt, { ...opts, timeoutMs: 110_000 })
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
  // Legacy: antaño evitaba el fallback de PAGO a Anthropic (retirado el 17/06/2026).
  // Ya NO bloquea nada — se conserva por compatibilidad de firma con los llamantes.
  noFallback = true
): Promise<string> {
  void noFallback
  // 1) Pasarela central (NIM vision por debajo) si está configurada.
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return await gatewayVision(cfg, system, images, userText, { maxTokens })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela vision falló, fallback directo:', (e as Error).message)
    }
  }

  // 2) Gemini Flash: mejor OCR y acepta imágenes grandes → camino preferido directo.
  if (process.env.GEMINI_API_KEY) {
    try {
      return await Promise.race([
        geminiVisionCall(system, images, userText, maxTokens),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini-Vision timeout')), timeoutMs)),
      ])
    } catch (e) {
      console.warn('[AI-CLIENT] Gemini-Vision falló, fallback NIM:', (e as Error).message)
    }
  }

  // 3) NIM como último recurso (límite ~180 KB inline).
  if (process.env.NVIDIA_API_KEY) {
    try {
      return await Promise.race([
        nvidiaVision(system, images, userText, maxTokens),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('NVIDIA-Vision timeout')), timeoutMs)),
      ])
    } catch (e) {
      console.warn('[AI-CLIENT] NVIDIA-Vision falló:', (e as Error).message)
    }
  }

  throw new Error('[AI-CLIENT] Sin proveedor de visión disponible (Gemini/NIM)')
}
