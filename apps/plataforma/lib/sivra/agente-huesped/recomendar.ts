// lib/sivra/agente-huesped/recomendar.ts — recomendaciones de zona por búsqueda web.
// Intenta /api/ai/search (Gemini, pasarela existente); si no, conocimiento del modelo.
import { aiComplete } from '@central/core-ai'

export async function recomendar(pregunta: string, zona: string, lang: string): Promise<string> {
  const base = process.env.AI_GATEWAY_URL || process.env.NEXT_PUBLIC_BASE_URL
  const secret = process.env.AI_GATEWAY_SECRET
  if (base && secret) {
    try {
      const r = await fetch(`${base}/api/ai/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          system: `Eres un anfitrión local en ${zona}. Recomienda en ${lang}, concreto y breve (3-4 frases), con nombres reales y por qué.`,
          user: pregunta,
        }),
      })
      if (r.ok) { const d = await r.json(); if (d?.text) return d.text as string }
    } catch {}
  }
  // Fallback: conocimiento del modelo.
  return aiComplete(
    [{ role: 'user', content: pregunta }],
    { system: `Eres un anfitrión local en ${zona}. Recomienda en ${lang}, breve (3-4 frases), con nombres reales. Si no estás seguro de un dato concreto, no lo inventes.`, maxTokens: 300 },
  )
}
