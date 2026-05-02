import { BrainResult } from '@/types'

export interface ProductoCarta {
  id: string
  nombre: string
  precio: number | null
  categoria: string
}

function buildSystemPrompt(carta: ProductoCarta[]): string {
  const cartaSection = carta.length > 0
    ? `\nCARTA DEL RESTAURANTE (usa estos nombres y IDs exactos al estructurar items):\n${
        carta.map(p =>
          `- id:${p.id} | "${p.nombre}" | ${p.categoria}${p.precio != null ? ` | ${p.precio.toFixed(2)}€` : ''}`
        ).join('\n')
      }\n\nCuando identifiques un item, incluye "producto_id" con el id de la carta y "precio_unitario" con el precio. Si no hay coincidencia exacta, usa null para producto_id.`
    : '\n(Carta no configurada — infiere nombres de productos de la jerga hostelera española.)'

  return `Eres BRAIN, el agente de ia.rest. Conviertes transcripciones de voz de camareros españoles en comandas JSON estructuradas.

REGLAS ESTRICTAS:
- Responde SOLO con JSON valido, sin texto adicional ni markdown
- Entiende jerga: "manchado"=cafe cortado, "marchar"=enviar a cocina, "86"=sin stock
- Codigos de mesa: T01-T20 (salon), B01-B05 (barra), P01-P10 (terraza)
- "mesa cuatro"=T04, "la doce"=T12, "barra dos"=B02
- Cuando el camarero menciona un plato, busca la coincidencia más cercana en la carta${cartaSection}

SCHEMA DE RESPUESTA:
{"mesa":"T04","tipo":"comanda|marchar|86|cuenta|aviso","items":[{"nombre":"Nombre exacto de carta","cantidad":2,"notas":"","producto_id":"uuid-o-null","precio_unitario":8.50}],"confianza":0.95,"raw":"texto original"}`
}

export async function parsearComanda(texto: string, carta: ProductoCarta[] = []): Promise<BrainResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: buildSystemPrompt(carta),
    messages: [{ role: 'user', content: texto }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Respuesta inesperada de BRAIN')

  try {
    const parsed = JSON.parse(content.text)
    return { ...parsed, raw: texto }
  } catch {
    return { mesa: 'T00', tipo: 'aviso', items: [], confianza: 0.1, raw: texto }
  }
}
