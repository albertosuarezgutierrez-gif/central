// Wrapper de alto nivel que lee NVIDIA_API_KEY del entorno.
// Las apps que necesiten config explícita (tests, multi-proveedor) siguen usando
// nimChat/nimText directamente con su NimConfig inyectado.

import { nimChat } from './nim'
import type { NimChatMessage } from './nim'
import type { NimConfig } from './types'

const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct'

function envConfig(model?: string): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')
  return { apiKey, textModel: model ?? DEFAULT_MODEL }
}

/**
 * Completion de texto con NVIDIA NIM desde el entorno.
 * Acepta string (prompt directo) o array de mensajes (multi-turn).
 */
export async function aiComplete(
  promptOrMessages: string | NimChatMessage[],
  options: {
    system?: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
    model?: string
  } = {},
): Promise<string> {
  const { system, maxTokens = 800, temperature = 0.3, timeoutMs = 30_000, model } = options
  const messages: NimChatMessage[] = typeof promptOrMessages === 'string'
    ? [{ role: 'user', content: promptOrMessages }]
    : promptOrMessages
  return nimChat(envConfig(model), messages, {
    system,
    maxTokens,
    temperature,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  })
}
