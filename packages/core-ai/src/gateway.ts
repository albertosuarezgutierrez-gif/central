// Cliente de la PASARELA de IA central (vive en plataforma). Las verticales NO guardan las keys de
// proveedor: llaman a la pasarela con un secreto compartido y ésta enruta a NIM/Gemini, registra el
// uso y aplica presupuesto. Adaptador puro (fetch), sin secretos hardcodeados.

import type { NimChatMessage } from './nim'

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

/** Completion de texto a través de la pasarela (NIM por debajo). */
export function gatewayChat(
  config: GatewayConfig,
  messages: NimChatMessage[],
  opts: { system?: string; model?: string; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  return llamar(config, '/api/ai/chat', {
    messages, system: opts.system, model: opts.model, maxTokens: opts.maxTokens,
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
