// Cliente de la PASARELA de IA central (vive en plataforma). Las verticales NO guardan las keys de
// proveedor: llaman a la pasarela con un secreto compartido y ésta enruta a NIM/Gemini, registra el
// uso y aplica presupuesto. Adaptador puro (fetch), sin secretos hardcodeados.

import type { NimChatMessage, NimToolMessage, NimToolResult } from './nim'
import type { ImageInput } from './types'

export type GatewayConfig = {
  /** URL base de la pasarela (p. ej. la de plataforma). */
  url: string
  /** Secreto compartido (Bearer) — env AI_GATEWAY_SECRET, mismo valor en pasarela y vertical. */
  secret: string
  /** Identificador de la app que llama (para el registro de uso/coste). */
  app: string
}

async function llamar(config: GatewayConfig, path: string, payload: Record<string, unknown>, timeoutMs: number): Promise<string> {
  const res = await fetch(`${config.url.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, app: config.app }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`)
  const data = await res.json()
  if (typeof data?.text !== 'string') throw new Error('Gateway: respuesta sin campo text')
  return data.text
}

/** Completion de texto a través de la pasarela (OpenRouter+Director / cadena gratis por debajo).
 *  Opcionales: `cliente` (atribución de coste por cliente final, para refacturar), `privado`
 *  (proveedores no-training), `cache` (caché semántica opt-in; solo ámbitos de respuesta ESTABLE). */
export function gatewayChat(
  config: GatewayConfig,
  messages: NimChatMessage[],
  opts: {
    system?: string; model?: string; maxTokens?: number; timeoutMs?: number
    cliente?: string; privado?: boolean; cache?: { ambito: string; ttlHoras?: number }
  } = {},
): Promise<string> {
  return llamar(config, '/api/ai/chat', {
    messages, system: opts.system, model: opts.model, maxTokens: opts.maxTokens,
    cliente: opts.cliente, privado: opts.privado, cache: opts.cache,
  }, opts.timeoutMs ?? 25_000)
}

/** Búsqueda web + síntesis a través de la pasarela (Gemini por debajo). */
export function gatewaySearch(
  config: GatewayConfig,
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  return llamar(config, '/api/ai/search', { system, user, maxTokens: opts.maxTokens }, opts.timeoutMs ?? 45_000)
}

/**
 * Function-calling a través de la pasarela (NIM por debajo). Devuelve el mensaje del modelo
 * (`content` y/o `tool_calls`); la vertical ejecuta las herramientas y reenvía los resultados.
 * No usa `llamar` porque la respuesta no es `{text}` sino `{content, tool_calls}`.
 */
export async function gatewayTools(
  config: GatewayConfig,
  messages: NimToolMessage[],
  tools: unknown[],
  opts: { system?: string; model?: string; maxTokens?: number; timeoutMs?: number; cliente?: string; privado?: boolean } = {},
): Promise<NimToolResult> {
  const res = await fetch(`${config.url.replace(/\/$/, '')}/api/ai/tools`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: config.app, messages, tools, system: opts.system, model: opts.model, maxTokens: opts.maxTokens, cliente: opts.cliente, privado: opts.privado }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  })
  if (!res.ok) throw new Error(`Gateway-Tools HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`)
  const data = await res.json()
  return { content: data?.content ?? null, tool_calls: data?.tool_calls }
}

/** Visión (OCR / análisis de imágenes) a través de la pasarela (NIM vision por debajo). */
export function gatewayVision(
  config: GatewayConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  opts: { maxTokens?: number; model?: string; timeoutMs?: number } = {},
): Promise<string> {
  return llamar(config, '/api/ai/vision', {
    system, images, userText, maxTokens: opts.maxTokens, model: opts.model,
  }, opts.timeoutMs ?? 45_000)
}

export type GatewayVideoOpts = {
  imageUrl?: string
  duration?: number
  aspectRatio?: '9:16' | '16:9' | '1:1'
  resolution?: '480p' | '720p' | '1080p'
  timeoutMs?: number
}

/** Generación de vídeo IA a través de la pasarela (fal.ai WAN 2.1 por debajo). Devuelve la URL del MP4. */
export async function gatewayVideo(
  config: GatewayConfig,
  prompt: string,
  opts: GatewayVideoOpts = {},
): Promise<string> {
  const res = await fetch(`${config.url.replace(/\/$/, '')}/api/ai/video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app: config.app,
      prompt,
      imageUrl: opts.imageUrl,
      duration: opts.duration,
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 100_000),
  })
  if (!res.ok) throw new Error(`Gateway-Video HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`)
  const data = await res.json() as { videoUrl?: string }
  if (typeof data?.videoUrl !== 'string') throw new Error('Gateway-Video: respuesta sin campo videoUrl')
  return data.videoUrl
}
