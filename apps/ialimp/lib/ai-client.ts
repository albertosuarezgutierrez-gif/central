// Cliente IA para ialimp — NVIDIA NIM (llama-3.3-70b) vía @iarest/core-ai.
// El núcleo es identity-agnostic: la config (apiKey + modelo) la inyecta esta app;
// la política (timeout) también.
import { nimChat, type NimConfig } from '@iarest/core-ai'

// timeoutMs: corta la llamada si NVIDIA no responde (evita colgar la función serverless).
export async function aiComplete(prompt: string, timeoutMs = 30000): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')

  const config: NimConfig = { apiKey, textModel: 'meta/llama-3.3-70b-instruct' }
  try {
    return await nimChat(config, [{ role: 'user', content: prompt }], {
      maxTokens: 1024,
      temperature: 0.3,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    })
  } catch (e) {
    // El cliente anterior devolvía '' si la respuesta venía vacía (no lanzaba): se preserva.
    if (e instanceof Error && e.message === 'NVIDIA: respuesta vacía') return ''
    throw e
  }
}
