// Wrapper de alto nivel que lee NVIDIA_API_KEY del entorno (con fallback gratis a Groq).
// Las apps que necesiten config explícita (tests, multi-proveedor) siguen usando
// nimChat/nimText directamente con su NimConfig inyectado.
//
// Política de fallback de TEXTO (compartida por todas las verticales que usan este
// wrapper, incluida la PASARELA de plataforma, cuyas rutas /api/ai/chat y /api/ai/tools
// llaman aquí): OpenRouter (agregador con fallback nativo entre modelos, si hay key) →
// [NIM, APAGADO por defecto] → Groq (gpt-oss-120b, gratis, otra infra) → Cerebras (gratis,
// infra WSE independiente) → [Gemini, APAGADO por defecto]
// → Kimi/Moonshot (de pago, último recurso). Cada eslabón queda inactivo si no está su
// API key, sin romper nada. Objetivo: que "IA no disponible" sea casi imposible.
//
// 🚨 NVIDIA NIM APAGADO POR DEFECTO (28/08/2026). Decisión de Alberto: «ya NIM nada, todo
// OpenRouter». El motivo no es una avería puntual sino un patrón medido: TRES ids de NIM
// muertos por EOL en 11 días —`meta/llama-4-maverick-17b-128e-instruct` (17/08),
// `z-ai/glm-5.2` (21/08) y `meta/llama-3.1-70b-instruct` (EOL 2026-08-26T09:00, 410 Gone)—
// y cada muerte costaba un PR de ~15 ficheros más el redespliegue de 5 edge functions.
// Enfrente, el dato de `ai_usos`: en los 7 días previos a la decisión OpenRouter sirvió el
// 100% del tráfico de texto con éxito y NIM no sirvió ni una sola respuesta real (solo su
// propia sonda). Un eslabón que no salva ninguna llamada pero exige mantenimiento semanal
// no es resiliencia, es deuda. Mismo tratamiento que Gemini el 02/08: el código se conserva
// ENTERO y el eslabón se reactiva con `NVIDIA_TEXTO=1` + `NVIDIA_BRAIN_MODEL` (un id vivo,
// verificado con llamada real — la ficha del catálogo NO prueba que el modelo viva).
//
// ⚠️ Esto NO toca la VISIÓN (`nimVision`), que usa otro modelo y no consta muerto.
//
// 🚨 GEMINI APAGADO POR DEFECTO (02/08/2026). Hallazgo del health-check (Check 12):
// `GEMINI_API_KEY` acumulaba 544 llamadas en 30 días y CERO éxitos (429 de cuota en todos
// los endpoints y modelos) — no es una racha, es una key sin cuota. El eslabón no salvaba
// nada y cada caída de NIM+Groq pagaba además su timeout antes de llegar a Kimi/OpenRouter.
// Decisión de Alberto: «usa OpenRouter». El código se conserva entero; se reactiva con
// `GEMINI_TEXTO=1` cuando haya una key con cuota (mismo patrón que `GEMINI_WEBSEARCH` en
// `apps/plataforma/lib/websearch.ts`).

import { nimChat, nimChatTools } from './nim.ts'
import { groqChat, groqChatTools } from './groq.ts'
import { cerebrasChat } from './cerebras.ts'
import { moonshotChat } from './moonshot.ts'
import { geminiChat } from './gemini.ts'
import { openrouterChatEx, openrouterChatTools } from './openrouter.ts'
import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import type { NimConfig } from './types'
import type { GroqConfig } from './groq'
import type { CerebrasConfig } from './cerebras'
import type { MoonshotConfig } from './moonshot'
import type { GeminiConfig } from './gemini'
import type { OpenRouterConfig } from './openrouter'

// `z-ai/glm-5.2` (nuestro default desde el 17/08) murió por HTTP 410 el 21/08/2026 — EOL real,
// antes incluso de la fecha 24/08/2026 que anunciaba su ficha. Repite el patrón del swap
// anterior (llama-4-maverick con ficha viva y 410 en el API): la ficha NO prueba que el modelo
// viva. Reemplazo elegido del listado REAL `/v1/models` (102 vivos, ni un solo `z-ai/*`) y
// verificado con llamadas en vivo (22/08/2026): responde directo, sin razonamiento parásito,
// rápido (a diferencia de `openai/gpt-oss-120b` y `minimaxai/minimax-m3`, que en NIM tardaron
// >25s en esta prueba).
const DEFAULT_MODEL = 'meta/llama-3.1-70b-instruct'
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b'
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2.6'
// `gemini-2.5-flash` da 404 en la API directa desde el 09/07/2026; alias rodante vigente.
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest'

/**
 * ¿Está el eslabón NIM enchufado? APAGADO por defecto (ver cabecera): requiere `NVIDIA_TEXTO=1`
 * ADEMÁS de la key. Se exige también un `NVIDIA_BRAIN_MODEL` explícito porque `DEFAULT_MODEL`
 * está MUERTO (410 desde el 26/08/2026): reactivar sin nombrar un id vivo solo compraría el
 * mismo 410 otra vez, y esta función es la que decide si se gasta la llamada.
 */
function nimActivo(): boolean {
  return process.env.NVIDIA_TEXTO === '1' && !!process.env.NVIDIA_API_KEY && !!process.env.NVIDIA_BRAIN_MODEL
}

function envConfig(model?: string): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')
  return { apiKey, textModel: model ?? process.env.NVIDIA_BRAIN_MODEL ?? DEFAULT_MODEL }
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

/** Proveedor que REALMENTE sirvió una completion de texto por la cadena clásica/Director. */
export type ProveedorTexto = 'openrouter' | 'nim' | 'groq' | 'cerebras' | 'gemini' | 'kimi'

export interface AiCompleteResult {
  text: string
  /** Proveedor que sirvió la respuesta de verdad — NUNCA asumas 'nim' solo porque es el
   *  primario de la cadena clásica: cualquier fallback (Groq/Cerebras/Gemini/Kimi) puede
   *  haber respondido en su lugar. Ver el LANDMINE de cabecera del fichero. */
  proveedor: ProveedorTexto
  modelo: string
}

/**
 * Completion de texto CON PROCEDENCIA: igual que `aiComplete`, pero devuelve qué proveedor/
 * modelo sirvió de verdad la respuesta, en vez de un `string` opaco.
 *
 * 🚨 Por qué existe (25/08/2026): `aiComplete` era una caja negra — el caller (la pasarela de
 * plataforma) no tenía forma de saber si la respuesta vino de NIM, Groq, Cerebras, Gemini o
 * Kimi, así que TODO éxito se registraba en `ai_usos` como `proveedor:'nim'` — el mismo patrón
 * que dejó a Gemini acumulando fallos fantasma en el Check 12 del health-check (25/08/2026),
 * pero al revés: aquí un NIM muerto podía quedar tapado indefinidamente por Groq/Cerebras
 * sirviendo en su lugar bajo la etiqueta 'nim', y una respuesta de Kimi (DE PAGO) se contaba
 * como gasto de NIM (gratis). Ver `apps/plataforma/lib/pasarela.ts::chatConDirector`.
 *
 * Completion de texto: OpenRouter (agregador, si hay key) → NVIDIA NIM (gratis) → Groq (gratis)
 * → Cerebras (gratis) → [Gemini, solo con GEMINI_TEXTO=1] → Kimi (de pago). Cada eslabón se activa solo si está su API key.
 * Acepta string (prompt) o array de mensajes.
 *
 * OJO con `options.model`: es un id de NIM (p. ej. `deepseek-ai/deepseek-v4-flash-0731`), NO un slug de
 * OpenRouter. Si el caller fija modelo, se respeta NIM como primario (comportamiento de siempre)
 * y OpenRouter pasa a ser un fallback más (con SU propio modelo por defecto).
 */
export async function aiCompleteConProveedor(
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
): Promise<AiCompleteResult> {
  const { system, maxTokens = 800, temperature = 0.3, timeoutMs = 30_000, model } = options
  const messages: NimChatMessage[] = typeof promptOrMessages === 'string'
    ? [{ role: 'user', content: promptOrMessages }]
    : promptOrMessages
  const sig = () => (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  // Primario: OpenRouter. Su fallback nativo `models` ya prueba varios modelos dentro de la misma
  // petición; si aun así falla, cadena directa.
  // El `model` pinneado (id de NIM) solo lo aparta cuando NIM está REALMENTE enchufado: con NIM
  // apagado ese id no lo puede servir nadie, así que respetarlo solo conseguiría saltarse el único
  // proveedor vivo. Era el fallo que rompía a rrhh y a ia-rest, que pinnean el 70B muerto.
  const openrouter = options.skipOpenRouter ? null : openrouterEnvConfig()
  const nimEnabled = nimActivo()
  if (openrouter && (!model || !nimEnabled)) {
    try {
      const res = await openrouterChatEx(openrouter, messages, { system, maxTokens, temperature, signal: sig() })
      return { text: res.text, proveedor: 'openrouter', modelo: res.model }
    } catch (eOr) { console.warn(`[aiComplete] OpenRouter (primario) falló: ${msg(eOr)}; probando cadena directa`) }
  }
  try {
    // Apagado por defecto (ver cabecera). Se lanza en vez de ramificar para no duplicar la cadena
    // de fallbacks entera: el motivo viaja en el error y acaba en el log igual que un fallo real.
    if (!nimEnabled) throw new Error('NIM inactivo: apagado por defecto el 28/08/2026 (requiere NVIDIA_TEXTO=1 + NVIDIA_BRAIN_MODEL con un id vivo)')
    const cfgNim = envConfig(model)
    const text = await nimChat(cfgNim, messages, { system, maxTokens, temperature, signal: sig() })
    return { text, proveedor: 'nim', modelo: cfgNim.textModel ?? DEFAULT_MODEL }
  } catch (eNim) {
    // Los fallbacks NO deben fallar en SILENCIO: si todos caen, "IA no disponible" era un misterio
    // (p.ej. NIM con timeout + Gemini con 429) porque estos catch tragaban el error. Cada eslabón
    // deja rastro en logs — qué proveedor falló y por qué, o si estaba inactivo por falta de key.
    console.warn(`[aiComplete] NIM falló (${msg(eNim)}); probando fallbacks`)
    // Fallback 1: Groq GRATIS (gpt-oss-120b). Señal nueva (la de NIM pudo abortar).
    const groq = groqEnvConfig()
    if (groq) {
      try {
        const text = await groqChat(groq, messages, { system, maxTokens, temperature, signal: sig() })
        return { text, proveedor: 'groq', modelo: groq.textModel ?? DEFAULT_GROQ_MODEL }
      } catch (eGroq) { console.warn(`[aiComplete] fallback Groq falló: ${msg(eGroq)}`) }
    } else {
      console.warn('[aiComplete] fallback Groq inactivo: falta GROQ_API_KEY')
    }
    // Fallback 2: Cerebras GRATIS. Mismo modelo `gpt-oss-120b` que Groq pero hardware y cuenta
    // independientes, así que un apagón de Groq no lo arrastra. Inactivo sin CEREBRAS_API_KEY.
    const cerebras = cerebrasEnvConfig()
    if (cerebras) {
      try {
        const text = await cerebrasChat(cerebras, messages, { system, maxTokens, temperature, signal: sig() })
        return { text, proveedor: 'cerebras', modelo: cerebras.textModel ?? DEFAULT_CEREBRAS_MODEL }
      } catch (eCer) { console.warn(`[aiComplete] fallback Cerebras falló: ${msg(eCer)}`) }
    } else {
      console.warn('[aiComplete] fallback Cerebras inactivo: falta CEREBRAS_API_KEY')
    }
    // Fallback 3: Gemini, APAGADO por defecto (key sin cuota, ver cabecera). Solo entra con
    // GEMINI_TEXTO=1 + GEMINI_API_KEY.
    const gemini = geminiEnvConfig()
    if (gemini) {
      try {
        const text = await geminiChat(gemini, messages, { system, maxTokens, temperature, timeoutMs })
        return { text, proveedor: 'gemini', modelo: gemini.model ?? DEFAULT_GEMINI_MODEL }
      } catch (eGem) { console.warn(`[aiComplete] fallback Gemini falló: ${msg(eGem)}`) }
    } else {
      console.warn('[aiComplete] fallback Gemini inactivo (requiere GEMINI_TEXTO=1 + GEMINI_API_KEY)')
    }
    // Fallback 4: OpenRouter si NO se probó como primario (caller con modelo NIM pinneado).
    // Usa SU modelo por defecto: en un escenario de fallo total, una respuesta de otro modelo
    // vale más que "IA no disponible" (misma filosofía que el salto a Groq/Gemini).
    if (openrouter && model && nimEnabled) {
      try {
        const res = await openrouterChatEx(openrouter, messages, { system, maxTokens, temperature, signal: sig() })
        return { text: res.text, proveedor: 'openrouter', modelo: res.model }
      } catch (eOr2) { console.warn(`[aiComplete] OpenRouter (fallback) falló: ${msg(eOr2)}`) }
    }
    // Fallback 5: Moonshot/Kimi (de pago, último recurso) → capacidad extra cuando todo lo demás falla.
    const kimi = moonshotEnvConfig()
    if (kimi) {
      try {
        const text = await moonshotChat(kimi, messages, { system, maxTokens, temperature, signal: sig() })
        return { text, proveedor: 'kimi', modelo: kimi.textModel ?? DEFAULT_MOONSHOT_MODEL }
      } catch (eKimi) { console.warn(`[aiComplete] fallback Kimi falló: ${msg(eKimi)}`) }
    } else {
      console.warn('[aiComplete] fallback Kimi inactivo: falta MOONSHOT_API_KEY')
    }
    console.error(`[aiComplete] TODOS los proveedores fallaron. Origen: ${msg(eNim)}`)
    throw eNim
  }
}

/**
 * Completion de texto: mismo contrato de siempre (devuelve solo el `string`). Atajo de
 * `aiCompleteConProveedor` para los ~70 callers del monorepo a los que no les importa QUÉ
 * proveedor sirvió — solo la pasarela de plataforma (que SÍ registra el uso en `ai_usos` y
 * necesita saberlo) usa la variante con procedencia.
 */
export async function aiComplete(
  promptOrMessages: string | NimChatMessage[],
  options: {
    system?: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
    model?: string
    skipOpenRouter?: boolean
  } = {},
): Promise<string> {
  return (await aiCompleteConProveedor(promptOrMessages, options)).text
}

export interface AiToolsResult extends NimToolResult {
  proveedor: 'openrouter' | 'nim' | 'groq'
  modelo: string
}

/**
 * Function-calling CON PROCEDENCIA: mismo mecanismo que `aiCompleteConProveedor` — devuelve
 * qué proveedor/modelo sirvió de verdad, en vez de dejar que el caller adivine (ver el
 * LANDMINE en la cabecera de `aiCompleteConProveedor`; aquí es el mismo patrón para tools).
 *
 * OpenRouter (si hay key) → NVIDIA NIM (gratis) → Groq (gratis) de fallback.
 * Lee `OPENROUTER_API_KEY`/`NVIDIA_API_KEY`/`GROQ_API_KEY` del entorno. Wrapper usado por la
 * pasarela central (endpoint `/api/ai/tools`) y por el camino directo de las verticales.
 * Igual que en `aiComplete`, un `model` pinneado es id de NIM → OpenRouter solo va primero
 * cuando no hay modelo fijado.
 */
export async function aiToolsConProveedor(
  messages: NimToolMessage[],
  tools: unknown[],
  options: { system?: string; maxTokens?: number; model?: string; skipOpenRouter?: boolean } = {},
): Promise<AiToolsResult> {
  // Mismo criterio que en `aiCompleteConProveedor`: con NIM apagado, un `model` pinneado (id de
  // NIM) no aparta a OpenRouter — nadie más puede servir ese id.
  const openrouter = options.skipOpenRouter ? null : openrouterEnvConfig()
  const nimEnabled = nimActivo()
  if (openrouter && (!options.model || !nimEnabled)) {
    try {
      const res = await openrouterChatTools(openrouter, messages, tools, {
        system: options.system,
        maxTokens: options.maxTokens,
      })
      return { content: res.content, tool_calls: res.tool_calls, proveedor: 'openrouter', modelo: res.model }
    } catch { /* cae a la cadena directa NIM → Groq */ }
  }
  try {
    if (!nimEnabled) throw new Error('NIM inactivo: apagado por defecto el 28/08/2026 (requiere NVIDIA_TEXTO=1 + NVIDIA_BRAIN_MODEL con un id vivo)')
    const cfgNim = envConfig(options.model)
    const res = await nimChatTools(cfgNim, messages, tools, {
      system: options.system,
      model: options.model,
      maxTokens: options.maxTokens,
    })
    return { ...res, proveedor: 'nim', modelo: cfgNim.textModel ?? DEFAULT_MODEL }
  } catch (e) {
    const groq = groqEnvConfig()
    if (!groq) throw e
    // No reenviamos `model` (id de NIM): Groq usa su propio modelo (config.textModel).
    const res = await groqChatTools(groq, messages, tools, {
      system: options.system,
      maxTokens: options.maxTokens,
    })
    return { ...res, proveedor: 'groq', modelo: groq.textModel ?? DEFAULT_GROQ_MODEL }
  }
}

/**
 * Function-calling: mismo contrato de siempre (`NimToolResult`, sin procedencia). Atajo de
 * `aiToolsConProveedor` para los callers a los que no les importa qué proveedor sirvió.
 */
export async function aiTools(
  messages: NimToolMessage[],
  tools: unknown[],
  options: { system?: string; maxTokens?: number; model?: string; skipOpenRouter?: boolean } = {},
): Promise<NimToolResult> {
  const res = await aiToolsConProveedor(messages, tools, options)
  return { content: res.content, tool_calls: res.tool_calls }
}
