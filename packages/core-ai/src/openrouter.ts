// Cliente OpenRouter (endpoint OpenAI-compatible), identity-agnostic. Espejo de `moonshot.ts`.
// ¿Por qué OpenRouter? Es un AGREGADOR: una sola API key da acceso a cientos de modelos de
// decenas de proveedores, con FALLBACK NATIVO entre modelos (parámetro `models: [...]` — si el
// primero falla o está saturado, OpenRouter conmuta solo en la misma petición). Resuelve la
// saturación de los proveedores gratis directos (NIM/Groq/Gemini). La app inyecta la config con
// su OPENROUTER_API_KEY; el paquete NUNCA lee process.env. La POLÍTICA de fallback
// (OpenRouter → NIM → Groq → Gemini → Kimi) vive en `client.ts`.
import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import type { ImageInput } from './types'

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Slug estable y barato (alias mantenido por DeepSeek en OpenRouter). El catálogo vivo lo
// cura el cron `ia-director-refresh` de plataforma; esto es solo el último default.
const DEFAULT_TEXT_MODEL = 'deepseek/deepseek-chat'

export interface OpenRouterConfig {
  apiKey: string
  baseUrl?: string           // default: https://openrouter.ai/api/v1/chat/completions
  textModel?: string         // default: deepseek/deepseek-chat (override por OPENROUTER_MODEL)
  fallbackModels?: string[]  // suplentes para el fallback NATIVO (body `models`)
  referer?: string           // header HTTP-Referer opcional (atribución en openrouter.ai)
  title?: string             // header X-Title opcional (atribución en openrouter.ai)
}

export interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/** Resultado extendido: el modelo REAL usado (puede ser un suplente) + usage para el auditor de coste. */
export interface OpenRouterChatResult {
  text: string
  model: string
  usage?: OpenRouterUsage
}

export interface OpenRouterChatOptions {
  system?: string
  model?: string
  /** Fallback nativo: lista completa [elegido, ...suplentes]. Tiene prioridad sobre model/config. */
  models?: string[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  /** Marca el system prompt con cache_control (prompt caching del proveedor → entrada repetida mucho más barata). */
  cacheSystem?: boolean
  /** Privacidad: exige proveedores que NO entrenan con los datos (provider.data_collection='deny'). */
  privacidad?: boolean
  /** Preferencias de proveedor adicionales (se fusionan; p. ej. allowlist EU del catálogo del Director). */
  provider?: Record<string, unknown>
  /** response_format passthrough (json_schema para salida estructurada, p. ej. el Director). */
  responseFormat?: Record<string, unknown>
  /** Plugins de OpenRouter (p. ej. `[{id:'web'}]` para búsqueda web). Usar `openrouterSearchEx` mejor. */
  plugins?: Array<Record<string, unknown>>
  /** Inyectable en tests. */
  fetchImpl?: typeof fetch
}

function requireKey(config: OpenRouterConfig): string {
  if (!config.apiKey) throw new Error('OpenRouter: apiKey requerida')
  return config.apiKey
}

function headers(config: OpenRouterConfig, key: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
  if (config.referer) h['HTTP-Referer'] = config.referer
  if (config.title) h['X-Title'] = config.title
  return h
}

// Construye el body OpenAI-compatible común a chat y tools. `models` (plural) activa el
// fallback nativo de OpenRouter; si va, OpenRouter ignora `model`, así que mandamos solo uno.
function buildBody(
  config: OpenRouterConfig,
  msgs: unknown[],
  opts: OpenRouterChatOptions,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const modelos = opts.models ?? (config.fallbackModels?.length
    ? [opts.model ?? config.textModel ?? DEFAULT_TEXT_MODEL, ...config.fallbackModels]
    : undefined)
  const body: Record<string, unknown> = {
    messages: msgs,
    max_tokens: opts.maxTokens ?? 800,
    temperature: opts.temperature ?? 0.3,
    stream: false,
    ...extra,
  }
  if (modelos && modelos.length > 1) body.models = modelos
  else body.model = modelos?.[0] ?? opts.model ?? config.textModel ?? DEFAULT_TEXT_MODEL
  const provider: Record<string, unknown> = { ...(opts.provider ?? {}) }
  if (opts.privacidad) provider.data_collection = 'deny'
  if (Object.keys(provider).length) body.provider = provider
  if (opts.responseFormat) body.response_format = opts.responseFormat
  if (opts.plugins?.length) body.plugins = opts.plugins
  return body
}

// System prompt como bloque multiparte con cache_control cuando opts.cacheSystem — OpenRouter
// lo traduce al prompt caching del proveedor (DeepSeek/Anthropic/Gemini). Sin la marca, string plano.
function systemMsgs(opts: OpenRouterChatOptions): unknown[] {
  if (!opts.system) return []
  if (!opts.cacheSystem) return [{ role: 'system', content: opts.system }]
  return [{
    role: 'system',
    content: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
  }]
}

/**
 * Chat con OpenRouter devolviendo también el modelo REAL usado y el usage (para registrar
 * coste exacto en el auditor de la pasarela). `openrouterChat` es el atajo que devuelve solo texto.
 */
export async function openrouterChatEx(
  config: OpenRouterConfig,
  messages: NimChatMessage[],
  opts: OpenRouterChatOptions = {},
): Promise<OpenRouterChatResult> {
  const key = requireKey(config)
  const doFetch = opts.fetchImpl ?? fetch
  const msgs = [...systemMsgs(opts), ...messages]
  const res = await doFetch(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: headers(config, key),
    body: JSON.stringify(buildBody(config, msgs, opts)),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter: respuesta vacía')
  return { text, model: data?.model ?? 'desconocido', usage: data?.usage }
}

/**
 * VISIÓN (multi-imagen) por OpenRouter. Espejo de `nimVision`, pero con el
 * agregador delante: así la app puede elegir CUALQUIER modelo multimodal del
 * catálogo (Gemini, Qwen-VL, Llama-Vision, Pixtral…) y aprovechar el fallback
 * nativo `models: [...]` cuando el primero está saturado.
 *
 * Existe porque `openrouterChatEx` recibe `NimChatMessage[]`, cuyo `content` es
 * `string`: no admite el array multiparte que exige el formato de imágenes. En
 * vez de relajar ese tipo (lo usan todas las rutas de texto), la visión tiene su
 * propia entrada.
 *
 * Devuelve el modelo REAL usado y el `usage`, para que el auditor de la pasarela
 * registre el coste exacto — una lectura de 10 páginas escaneadas no es gratis.
 */
export async function openrouterVisionEx(
  config: OpenRouterConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  opts: OpenRouterChatOptions = {},
): Promise<OpenRouterChatResult> {
  const key = requireKey(config)
  const doFetch = opts.fetchImpl ?? fetch

  const contenido = [
    ...images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mediaType};base64,${img.data}` },
    })),
    { type: 'text' as const, text: userText },
  ]

  const msgs: unknown[] = []
  if (system) msgs.push({ role: 'system', content: system })
  msgs.push({ role: 'user', content: contenido })

  const res = await doFetch(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: headers(config, key),
    // Temperatura baja por defecto: esto es transcripción/extracción, no redacción.
    body: JSON.stringify(buildBody(config, msgs, { temperature: 0.1, maxTokens: 2000, ...opts })),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`OpenRouter-Vision HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter-Vision: respuesta vacía')
  return { text, model: data?.model ?? 'desconocido', usage: data?.usage }
}

/** Atajo de `openrouterVisionEx` que devuelve solo el texto. */
export async function openrouterVision(
  config: OpenRouterConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  opts: OpenRouterChatOptions = {},
): Promise<string> {
  return (await openrouterVisionEx(config, system, images, userText, opts)).text
}

/** Llamada de chat a OpenRouter. Devuelve el contenido del primer choice. Espejo de `moonshotChat`. */
export async function openrouterChat(
  config: OpenRouterConfig,
  messages: NimChatMessage[],
  opts: OpenRouterChatOptions = {},
): Promise<string> {
  return (await openrouterChatEx(config, messages, opts)).text
}

/**
 * Búsqueda web + síntesis vía el PLUGIN `web` de OpenRouter (Exa por debajo): inyecta
 * resultados de búsqueda reales en el prompt de CUALQUIER modelo. Espejo funcional de
 * `geminiSearch` para usarlo como suplente cuando el grounding de Gemini está saturado (429).
 * OJO coste: el plugin cobra por resultados (~4$/1000 → `maxResults` 5 ≈ 0,02$/llamada),
 * APARTE de los tokens del modelo — no es gratis como Gemini; la POLÍTICA (gratis primero)
 * vive en la app. Devuelve también model/usage para el auditor de coste de la pasarela.
 */
export async function openrouterSearchEx(
  config: OpenRouterConfig,
  system: string,
  user: string,
  opts: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; maxResults?: number; fetchImpl?: typeof fetch } = {},
): Promise<OpenRouterChatResult> {
  return openrouterChatEx(config, [{ role: 'user', content: user }], {
    system: system || undefined,
    model: opts.model,
    maxTokens: opts.maxTokens ?? 1500,
    temperature: opts.temperature ?? 0.2,
    plugins: [{ id: 'web', max_results: opts.maxResults ?? 5 }],
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    fetchImpl: opts.fetchImpl,
  })
}

/**
 * Function-calling con OpenRouter (formato de tools OpenAI). Espejo de `groqChatTools`,
 * con el mismo contrato `NimToolMessage`/`NimToolResult` para ser drop-in en `aiTools`
 * — más el modelo REAL usado (puede ser un suplente del fallback nativo), para que el
 * auditor de coste de la pasarela no tenga que adivinarlo.
 */
export async function openrouterChatTools(
  config: OpenRouterConfig,
  messages: NimToolMessage[],
  tools: unknown[],
  opts: OpenRouterChatOptions = {},
): Promise<NimToolResult & { model: string }> {
  const key = requireKey(config)
  const doFetch = opts.fetchImpl ?? fetch
  const msgs = [...systemMsgs(opts), ...messages]
  const res = await doFetch(config.baseUrl ?? DEFAULT_BASE_URL, {
    method: 'POST',
    headers: headers(config, key),
    body: JSON.stringify(buildBody(config, msgs, { maxTokens: 1024, ...opts }, { tools })),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`OpenRouter-Tools HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const msg = data?.choices?.[0]?.message
  if (!msg) throw new Error('OpenRouter-Tools: respuesta vacía')
  return { content: msg.content ?? null, tool_calls: msg.tool_calls, model: data?.model ?? 'desconocido' }
}
