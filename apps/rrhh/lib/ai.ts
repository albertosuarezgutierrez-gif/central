// IA de iarrhh enrutada por la PASARELA central (vive en plataforma): las keys de proveedor y el
// control de coste/uso quedan en plataforma. Si la pasarela no está configurada, se usa la key
// directa como fallback de transición (para no romper nada mientras se despliega).
//
// Envs (proyecto Vercel central-rrhh):
//   AI_GATEWAY_URL     = URL de plataforma (p. ej. https://plataforma.vercel.app)
//   AI_GATEWAY_SECRET  = mismo secreto que en plataforma
// Fallback de transición: NVIDIA_API_KEY / GEMINI_API_KEY (se podrán quitar al activar la pasarela).

import {
  gatewayChat, gatewaySearch, aiComplete, geminiSearch,
  type GatewayConfig, type NimChatMessage,
} from '@central/core-ai'

const APP = 'rrhh'

export type ViaIA = 'pasarela' | 'directo' | 'ninguna'

/** Decide la vía de IA según el entorno (pura, testeable). Prioriza la pasarela central. */
export function viaIA(): ViaIA {
  if (process.env.AI_GATEWAY_URL && process.env.AI_GATEWAY_SECRET) return 'pasarela'
  if (process.env.NVIDIA_API_KEY || process.env.GEMINI_API_KEY) return 'directo'
  return 'ninguna'
}

/** ¿Hay alguna vía de IA disponible (pasarela o key directa)? */
export function iaDisponible(): boolean {
  return viaIA() !== 'ninguna'
}

function gatewayCfg(): GatewayConfig | null {
  const url = process.env.AI_GATEWAY_URL
  const secret = process.env.AI_GATEWAY_SECRET
  return url && secret ? { url, secret, app: APP } : null
}

type ChatOpts = { system?: string; model?: string; maxTokens?: number; timeoutMs?: number }

/** Completion de texto (NIM). Pasarela si está; si no, NIM directo. Lanza si no hay ninguna vía. */
export async function iaChat(messages: NimChatMessage[], opts: ChatOpts = {}): Promise<string> {
  const cfg = gatewayCfg()
  if (cfg) return gatewayChat(cfg, messages, opts)
  if (process.env.NVIDIA_API_KEY) return aiComplete(messages, opts)
  throw new Error('IA no configurada (ni pasarela AI_GATEWAY_* ni NVIDIA_API_KEY)')
}

export type ResultadoBusqueda = { text: string; conBusqueda: boolean }

/**
 * Búsqueda web + síntesis (Gemini). Pasarela primero; si la pasarela no tiene búsqueda (503 por
 * falta de GEMINI), degrada a chat por la pasarela. Sin pasarela: Gemini directo → NIM directo.
 */
export async function iaSearch(
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<ResultadoBusqueda> {
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return { text: await gatewaySearch(cfg, system, user, opts), conBusqueda: true }
    } catch (e) {
      console.error('[ia] pasarela search no disponible, degrado a chat:', e instanceof Error ? e.message : e)
      return { text: await gatewayChat(cfg, [{ role: 'user', content: user }], { system, maxTokens: opts.maxTokens }), conBusqueda: false }
    }
  }
  if (process.env.GEMINI_API_KEY) {
    return { text: await geminiSearch({ apiKey: process.env.GEMINI_API_KEY }, system, user, opts), conBusqueda: true }
  }
  if (process.env.NVIDIA_API_KEY) {
    return { text: await aiComplete(user, { system, maxTokens: opts.maxTokens }), conBusqueda: false }
  }
  throw new Error('IA no configurada')
}
