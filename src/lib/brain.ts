import { BrainResult } from '@/types'
import { createServerClient } from '@/lib/supabase'

/** Construye el bloque de carta para el prompt con aliases. */
async function buildMenuContext(): Promise<string> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('productos')
      .select('nombre, nombre_alternativo, seccion, precio')
      .eq('activo', true)
      .order('seccion')
      .order('orden')

    if (!data?.length) return ''

    const bySec: Record<string, typeof data> = {}
    for (const p of data) {
      const s = p.seccion ?? 'otras'
      if (!bySec[s]) bySec[s] = []
      bySec[s].push(p)
    }

    const lines = Object.entries(bySec).map(([sec, items]) => {
      const row = items.map(p => {
        const alias = p.nombre_alternativo?.length
          ? ` [${(p.nombre_alternativo as string[]).join('/')}]`
          : ''
        const precio = p.precio != null ? ` ${p.precio}€` : ''
        return `${p.nombre}${alias}${precio}`
      }).join(' · ')
      return `${sec.toUpperCase()}: ${row}`
    })

    return `\nCARTA ACTIVA (usa el nombre canónico; alias entre corchetes):\n${lines.join('\n')}\n`
  } catch {
    return ''
  }
}

const BASE_PROMPT = `Eres BRAIN, el agente de ia.rest. Conviertes transcripciones de voz de camareros españoles en comandas JSON estructuradas.

REGLAS ESTRICTAS:
- Responde SOLO con JSON valido, sin texto adicional ni markdown
- Entiende jerga: "manchado"=Cortado, "marchar"=enviar a cocina, "86"=agotado/sin stock
- Codigos de mesa: T01-T20 (salon), B01-B05 (barra), P01-P10 (terraza)
- "mesa cuatro"=T04, "la doce"=T12, "barra dos"=B02
- Usa la CARTA ACTIVA para mapear alias al nombre canónico exacto
- Para tipo "86": los items son los productos agotados

SCHEMA:
{"mesa":"T04","tipo":"comanda|marchar|86|cuenta|aviso","items":[{"nombre":"Nombre canónico de la carta","cantidad":2,"notas":""}],"confianza":0.95,"raw":"texto original"}`

export async function parsearComanda(texto: string): Promise<BrainResult> {
  const [Anthropic, menuContext] = await Promise.all([
    import('@anthropic-ai/sdk').then(m => m.default),
    buildMenuContext(),
  ])

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: BASE_PROMPT + menuContext,
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
