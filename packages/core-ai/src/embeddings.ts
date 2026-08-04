// Embeddings con Gemini (text-embedding-004, 768 dims, free tier) — adaptador puro,
// identity-agnostic. Primer proveedor de embeddings del monorepo: alimenta la caché
// semántica (pgvector) de la pasarela de plataforma. La app inyecta la config con su
// GEMINI_API_KEY (la misma que ya usa geminiChat/geminiSearch); el paquete NUNCA lee
// process.env. Mismo estilo REST que `gemini.ts`.

export interface GeminiEmbedConfig {
  apiKey: string
  model?: string   // default: text-embedding-004 (768 dimensiones)
}

const DEFAULT_EMBED_MODEL = 'text-embedding-004'

/** Devuelve el vector de embedding (768 floats) del texto. Lanza error si falla. */
export async function geminiEmbed(
  config: GeminiEmbedConfig,
  texto: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<number[]> {
  if (!config.apiKey) throw new Error('GeminiEmbed: apiKey requerida')
  if (!texto.trim()) throw new Error('GeminiEmbed: texto vacío')
  const model = config.model ?? DEFAULT_EMBED_MODEL
  const timeoutMs = opts.timeoutMs ?? 10_000
  const doFetch = opts.fetchImpl ?? fetch

  const res = await doFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: texto }] } }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!res.ok) throw new Error(`GeminiEmbed HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const values = data?.embedding?.values
  if (!Array.isArray(values) || !values.length) throw new Error('GeminiEmbed: respuesta sin vector')
  return values
}
