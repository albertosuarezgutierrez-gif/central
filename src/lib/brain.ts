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
          const fam   = p.familia ? ` {${p.familia}}` : ''
          if (p.formatos.length) {
            const fmtStr = p.formatos.map(f => `${f.nombre}:${f.precio}€`).join('/')
            return `${p.nombre}${alias}${fam} (formatos: ${fmtStr})`
          }
          const precio = p.precio != null ? ` ${p.precio}€` : ''
          return `${p.nombre}${alias}${fam}${precio}`
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
- Códigos de mesa según ZONAS DEL LOCAL (ver abajo). Fallback: S=salon, T=terraza, B=barra
- "salon cuatro"=S4, "salon doce"=S12, "terraza cuatro"=T4, "terraza uno"=T1, "barra dos"=B2, "barra uno"=B1
- Usa la CARTA ACTIVA para mapear alias al nombre canónico exacto
- Para tipo "86": los items son los productos agotados
- FORMATOS: si un producto tiene formatos (tapa/media/racion), extrae el formato mencionado en "formato" (null si no se menciona)
- Ejemplos formato: "una tapa de bravas"→formato:"tapa", "media de croquetas"→formato:"media", "una ración"→formato:"racion"
- COMENSALES: si el camarero menciona número de personas/comensales/cubiertos, extráelo en "num_comensales" (null si no se menciona)
- Ejemplos comensales: "mesa cuatro para tres"→num_comensales:3, "somos cuatro"→num_comensales:4, "dos cubiertos"→num_comensales:2

CUENTAS POR NOMBRE (nombre_cuenta):
- Cuando el camarero dice "a nombre de X", "para X", "cuenta de X" SIN mencionar mesa, usa nombre_cuenta
- En ese caso: mesa:"", nombre_cuenta:"X" (nombre tal como se dice, capitalizado)
- Ejemplos: "dos cañas para Alberto"→nombre_cuenta:"Alberto", mesa:""
- "abre cuenta a nombre de Pedro García"→tipo:"cuenta",nombre_cuenta:"Pedro García",mesa:"",items:[]
- "cuenta de María, paga con tarjeta"→tipo:"cuenta",nombre_cuenta:"María",mesa:"",items:[]
- "dos tintos para la mesa cuatro"→mesa:"S4",nombre_cuenta:null (tiene mesa, NO es cuenta nominal)
- Si el camarero dice TANTO mesa COMO nombre: usa la mesa, ignora el nombre (la mesa tiene prioridad)

CLARIFICACIÓN POR AMBIGÜEDAD:
- Si el camarero menciona un producto que en la CARTA ACTIVA tiene múltiples variantes distintas (tipos diferentes, no solo formatos de tamaño) y NO especificó cuál, devuelve necesita_clarificacion:true
- Ejemplo: "un tinto" y en carta existen "Rioja Crianza 4.5€", "Ribera del Duero 5€", "Tempranillo 3.5€" → lista las opciones
- Ejemplo: "una copa de vino" → primero pregunta blanco/tinto/rosado; si solo hay un blanco y múltiples tintos, lista solo los tintos si dijo "tinto"
- opciones_clarificacion: array con los productos EXACTOS de la carta que coinciden, con precio y cantidad inferida del texto (ej: "dos tintos" → cantidad:2 en todas las opciones)
- La pregunta debe ser corta: "¿Qué tinto?" o "¿Qué tipo de vino?"
- NO preguntes si: el producto es único en carta, si ya especificó, o si las variantes son solo tamaño
- Si hay texto "→ respuesta:" en el input, es respuesta a clarificación anterior — úsala para completar sin volver a preguntar
- Con clarificación resuelta: devuelve necesita_clarificacion:false con los items completos

SCHEMA:
{"mesa":"S4","nombre_cuenta":null,"tipo":"comanda|marchar|86|cuenta|aviso","items":[{"nombre":"Nombre canónico de la carta","cantidad":2,"notas":"","formato":null}],"num_comensales":null,"necesita_clarificacion":false,"pregunta_clarificacion":null,"opciones_clarificacion":[],"confianza":0.95,"raw":"texto original"}`

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
    // Garantizar que items siempre es array (Claude a veces devuelve null o lo omite)
    if (!Array.isArray(parsed.items)) parsed.items = []
    console.log('[BRAIN] OK:', parsed.mesa, parsed.tipo, parsed.items.length, 'items')
    return { ...parsed, raw: texto }
  } catch (e) {
    console.error('[BRAIN] JSON.parse failed. raw_text:', raw_text.substring(0, 200), 'error:', e)
    return { mesa: 'T00', tipo: 'aviso', items: [], confianza: 0.1, raw: texto }
  }
}
