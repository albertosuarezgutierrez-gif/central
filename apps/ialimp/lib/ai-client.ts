// Cliente IA para ialimp — enruta por la PASARELA central (plataforma): las keys de proveedor y el
// control de coste/uso viven en plataforma. Si la pasarela no está configurada, usa NVIDIA NIM directo
// (fallback de transición). Envs: AI_GATEWAY_URL + AI_GATEWAY_SECRET (= los de plataforma).
import {
  aiComplete as _aiComplete, nimVision,
  gatewayChat, gatewayVision,
  type GatewayConfig, type NimChatMessage, type NimConfig, type ImageInput,
} from '@central/core-ai'

const APP = 'ialimp'

function gatewayCfg(): GatewayConfig | null {
  const url = process.env.AI_GATEWAY_URL
  const secret = process.env.AI_GATEWAY_SECRET
  return url && secret ? { url, secret, app: APP } : null
}

type ChatOpts = { system?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; model?: string }

/** Completion de texto (NIM). Acepta prompt string o mensajes. Pasarela si está; si no, NIM directo. */
export async function aiComplete(promptOrMessages: string | NimChatMessage[], options: ChatOpts = {}): Promise<string> {
  const cfg = gatewayCfg()
  if (cfg) {
    const messages: NimChatMessage[] = typeof promptOrMessages === 'string'
      ? [{ role: 'user', content: promptOrMessages }]
      : promptOrMessages
    return gatewayChat(cfg, messages, { system: options.system, model: options.model, maxTokens: options.maxTokens, timeoutMs: options.timeoutMs })
  }
  return _aiComplete(promptOrMessages, options)
}

/**
 * Visión / OCR. MISMA firma que `nimVision` (para que migrar un sitio sea solo cambiar el import):
 * pasarela si está configurada; si no, NIM directo con el `config` recibido. El `visionModel` del
 * config se usa como pista de modelo para la pasarela.
 */
export async function aiVision(
  config: NimConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  maxTokens = 2000,
  opts: { temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const cfg = gatewayCfg()
  if (cfg) return gatewayVision(cfg, system, images, userText, { maxTokens, model: config?.visionModel })
  return nimVision(config, system, images, userText, maxTokens, opts)
}
