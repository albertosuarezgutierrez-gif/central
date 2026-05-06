import { BrainResult } from '@/types'
import { createServerClient } from '@/lib/supabase'
import { getMenuCache } from '@/lib/brain-cache'

/** Construye el bloque de carta para el prompt usando el cache de menú (evita DB queries). */
async function buildMenuContext(restaurante_id?: string): Promise<string> {
  // Si tenemos restaurante_id, usar el cache para evitar 2 DB queries por llamada
  if (restaurante_id) {
    try {
      const cache = await getMenuCache(restaurante_id)
      if (cache.productos.length === 0) return ''

      const bySec = new Map<string, typeof cache.productos>()
      for (const p of cache.productos) {
        const s = p.seccion ?? 'otras'
        const arr = bySec.get(s) ?? []
        arr.push(p)
        bySec.set(s, arr)
      }

      const lines = [...bySec.entries()].map(([sec, items]) => {
        const row = items.map(p => {
          const alias = p.aliases.length > 1 ? ` [${p.aliases.slice(1).join('/')}]` : ''
          if (p.formatos.length) {
            const fmtStr = p.formatos.map(f => `${f.nombre}:${f.precio}€`).join('/')
            return `${p.nombre}${alias} (formatos: ${fmtStr})`
          }
          const precio = p.precio != null ? ` ${p.precio}€` : ''
          return `${p.nombre}${alias}${precio}`
        }).join(' · ')
        return `${sec.toUpperCase()}: ${row}`
      })

      return `\nCARTA ACTIVA (usa el nombre canónico; alias entre corchetes):\n${lines.join('\n')}\n`
    } catch {
      // Fallback a query directa si el cache falla
    }
  }

  // Fallback legacy: query directa sin restaurante_id (modo demo/compatibilidad)
  try {
    const supabase = createServerClient()
    const [{ data: productos }, { data: formatos }] = await Promise.all([
      supabase
        .from('productos')
        .select('id, nombre, nombre_alternativo, seccion, precio')
        .eq('activo', true)
        .order('seccion')
        .order('orden'),
      supabase
        .from('producto_formatos')
        .select('producto_id, nombre, precio')
        .eq('activo', true)
        .order('orden'),
    ])

    if (!productos?.length) return ''

    // Build formato map: producto_id → formatos[]
    const fmtMap: Record<string, { nombre: string; precio: number }[]> = {}
    for (const f of formatos ?? []) {
      if (!fmtMap[f.producto_id]) fmtMap[f.producto_id] = []
      fmtMap[f.producto_id].push({ nombre: f.nombre, precio: f.precio })
    }

    const bySec: Record<string, typeof productos> = {}
    for (const p of productos) {
      const s = p.seccion ?? 'otras'
      if (!bySec[s]) bySec[s] = []
      bySec[s].push(p)
    }

    const lines = Object.entries(bySec).map(([sec, items]) => {
      const row = items.map(p => {
        const alias = p.nombre_alternativo?.length
          ? ` [${(p.nombre_alternativo as string[]).join('/')}]`
          : ''
        const fmts = fmtMap[p.id]
        if (fmts?.length) {
          const fmtStr = fmts.map(f => `${f.nombre}:${f.precio}€`).join('/')
          return `${p.nombre}${alias} (formatos: ${fmtStr})`
        }
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

/** Construye el bloque de zonas dinámicas para el prompt. */
async function buildZonasContext(restaurante_id?: string): Promise<string> {
  try {
    const supabase = createServerClient()
    const { data: zonas } = await supabase
      .from('zonas')
      .select('nombre, tipo, prefijo')
      .eq('activa', true)
      .eq('restaurante_id', restaurante_id ?? '00000000-0000-0000-0000-000000000001')
      .order('orden')

    if (!zonas?.length) return ''

    const lines = zonas
      .filter(z => z.prefijo)
      .map(z => `  ${z.prefijo}XX = ${z.nombre} (ej: ${z.prefijo}01, ${z.prefijo}12)`)
      .join('\n')
    return `\nZONAS DEL LOCAL (prefijos de mesa):\n${lines}\n`
  } catch {
    return ''
  }
}

// ── FIX: prefijos corregidos para coincidir con la BD real ──────────────────
// T = salón           (mesas T01-T12)
// P = terraza         (mesas P01-P04)
// B = barra           (mesas B01-B03)
// ────────────────────────────────────────────────────────────────────────────
const BASE_PROMPT = `Eres BRAIN, el agente de ia.rest. Conviertes transcripciones de voz de camareros españoles en comandas JSON estructuradas.

REGLAS ESTRICTAS:
- Responde SOLO con JSON valido, sin texto adicional ni markdown
- Entiende jerga: "manchado"=Cortado, "marchar"=enviar a cocina, "86"=agotado/sin stock
- Códigos de mesa según ZONAS DEL LOCAL (ver abajo). Fallback: T=salon, P=terraza, B=barra
- "mesa cuatro"=T04, "la doce"=T12, "terraza cuatro"=P04, "barra dos"=B02
- Usa la CARTA ACTIVA para mapear alias al nombre canónico exacto
- Para tipo "86": los items son los productos agotados
- FORMATOS: si un producto tiene formatos (tapa/media/racion), extrae el formato mencionado en "formato" (null si no se menciona)
- Ejemplos formato: "una tapa de bravas"→formato:"tapa", "media de croquetas"→formato:"media", "una ración"→formato:"racion"
- COMENSALES: si el camarero menciona número de personas/comensales/cubiertos, extráelo en "num_comensales" (null si no se menciona)
- Ejemplos comensales: "mesa cuatro para tres"→num_comensales:3, "somos cuatro"→num_comensales:4, "dos cubiertos"→num_comensales:2

SCHEMA:
{"mesa":"T04","tipo":"comanda|marchar|86|cuenta|aviso","items":[{"nombre":"Nombre canónico de la carta","cantidad":2,"notas":"","formato":null}],"num_comensales":null,"confianza":0.95,"raw":"texto original"}`

export async function parsearComanda(texto: string, restaurante_id?: string): Promise<BrainResult> {
  // Usar cache cuando sea posible para evitar DB queries en cada llamada (~200ms ahorrados)
  const [Anthropic, menuContext, zonasContext] = await Promise.all([
    import('@anthropic-ai/sdk').then(m => m.default),
    buildMenuContext(restaurante_id),
    buildZonasContext(restaurante_id),
  ])

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: BASE_PROMPT + zonasContext + menuContext,
    messages: [{ role: 'user', content: texto }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Respuesta inesperada de BRAIN')

  // Limpiar markdown code blocks que Haiku a veces añade
  const raw_text = content.text.trim()
  const clean = raw_text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(clean)
    console.log('[BRAIN] OK:', parsed.mesa, parsed.tipo, parsed.items?.length, 'items')
    return { ...parsed, raw: texto }
  } catch (e) {
    console.error('[BRAIN] JSON.parse failed. raw_text:', raw_text.substring(0, 200), 'error:', e)
    return { mesa: 'T00', tipo: 'aviso', items: [], confianza: 0.1, raw: texto }
  }
}
