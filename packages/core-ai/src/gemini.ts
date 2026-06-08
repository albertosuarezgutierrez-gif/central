// Google Gemini con Google Search grounding — adaptador puro, identity-agnostic.
// Para tareas que necesitan datos actuales de internet (research/leads). Lanza
// error si falla; la POLÍTICA de fallback (p. ej. a NIM) la decide la app.

export interface GeminiConfig {
  apiKey: string
  model?: string   // default: gemini-2.0-flash
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

export async function geminiSearch(
  config: GeminiConfig,
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!config.apiKey) throw new Error('Gemini: apiKey requerida')
  const maxTokens = opts.maxTokens ?? 1500
  const timeoutMs = opts.timeoutMs ?? 45_000
  const model = config.model ?? DEFAULT_GEMINI_MODEL

  const res = await Promise.race([
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
        }),
      },
    ),
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini timeout')), timeoutMs)),
  ])

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new Error('Gemini: respuesta vacía')
  return text
}
