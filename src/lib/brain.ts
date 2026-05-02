import { BrainResult } from '@/types'

const SYSTEM_PROMPT = `Eres BRAIN, el agente de ia.rest. Conviertes transcripciones de voz de camareros españoles en comandas JSON estructuradas.

REGLAS ESTRICTAS:
- Responde SOLO con JSON valido, sin texto adicional ni markdown
- Entiende jerga: "manchado"=cafe cortado, "marchar"=enviar a cocina, "86"=sin stock, "una de bravas"=1 racion patatas bravas
- Codigos de mesa: T01-T20 (salon), B01-B05 (barra), P01-P10 (terraza)
- "mesa cuatro"=T04, "la doce"=T12, "barra dos"=B02

SCHEMA:
{"mesa":"T04","tipo":"comanda|marchar|86|cuenta|aviso","items":[{"nombre":"Cana","cantidad":2,"notas":""}],"confianza":0.95,"raw":"texto original"}`

export async function parsearComanda(texto: string): Promise<BrainResult> {
  // Lazy import - only loads at runtime
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: texto }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Respuesta inesperada de BRAIN')

  try {
    return { ...JSON.parse(content.text), raw: texto }
  } catch {
    return { mesa: 'T00', tipo: 'aviso', items: [], confianza: 0.1, raw: texto }
  }
}
