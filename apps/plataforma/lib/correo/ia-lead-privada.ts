// lib/correo/ia-lead-privada.ts — IA para el CUERPO de los correos de leads de la correduría (F1 y F2).
//
// Decisión de Alberto (19/10/2026): ese cuerpo puede llevar DNI, fecha de nacimiento o teléfono, así que NO va a
// Groq/NIM. Solo OpenRouter con `data_collection:'deny'` + `zdr:true` (mismo criterio que el asistente de la
// correduría, `correduria-asistente-telegram.ts`). Sin clave o con fallo → LANZA (el llamante ya trata «IA caída»);
// NUNCA cae a la cadena gratis. Sin `@/` y con `core-ai` por import dinámico a propósito: `node --test` no carga el índice de core-ai, así que el
// test inyecta `chat`.
import type { openrouterChatEx as ChatEx } from '@central/core-ai'

const MODELO_DEFAULT = 'deepseek/deepseek-v4.1-flash'
const TIMEOUT_MS = 20_000

export async function llamarIAPrivada(
  system: string,
  user: string,
  maxTokens = 400,
  inyectado: { chat?: typeof ChatEx; apiKey?: string } = {},
): Promise<string> {
  const apiKey = inyectado.apiKey ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('ia-privada: sin OPENROUTER_API_KEY (no se cae a Groq/NIM)')
  const model = process.env.OPENROUTER_MODEL || MODELO_DEFAULT
  const suplentes = (process.env.OPENROUTER_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const chat = inyectado.chat ?? (await import('@central/core-ai')).openrouterChatEx
  const r = await chat(
    {
      apiKey,
      textModel: model,
      baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
      referer: process.env.OPENROUTER_REFERER || 'https://plataforma-ten-flame.vercel.app',
      title: process.env.OPENROUTER_TITLE || 'central',
    },
    [{ role: 'user', content: user }],
    {
      system, models: [model, ...suplentes], maxTokens, temperature: 0,
      privacidad: true, provider: { zdr: true }, signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  )
  return r.text
}
