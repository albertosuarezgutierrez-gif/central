import { BrainResult } from '@/types'
import { createServerClient } from '@/lib/supabase'
import { getMenuCache } from '@/lib/brain-cache'

// ── Contexto dinámico (recomendaciones, carta, zonas) ──────────────────────

async function buildRecomendacionesContext(restaurante_id?: string): Promise<string> {
  if (!restaurante_id) return ''
  try {
    const db = createServerClient()
    const { data } = await db
      .from('v_recomendaciones_activas')
      .select('producto_nombre, precio, nota, hora_hasta, cantidad_restante')
      .eq('restaurante_id', restaurante_id)
      .limit(10)
    if (!data?.length) return ''
    const lineas = data.map(r => {
      let l = `- ${r.producto_nombre} (${Number(r.precio).toFixed(2)}€)`
      if (r.nota) l += ` — "${r.nota}"`
      if (r.cantidad_restante !== null) l += ` — ${r.cantidad_restante} disponibles`
      if (r.hora_hasta) l += ` — hasta ${r.hora_hasta.slice(0,5)}`
      return l
    }).join('\n')
    return `\n\nRECOMENDACIONES DEL DÍA (solo informa si el cliente pregunta o el contexto lo sugiere):\n${lineas}`
  } catch { return '' }
}

async function buildMenuContext(restaurante_id?: string): Promise<string> {
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
    } catch { /* fallback */ }
  }
  try {
    const supabase = createServerClient()
    const [{ data: productos }, { data: formatos }] = await Promise.all([
      supabase.from('productos').select('id, nombre, nombre_alternativo, seccion, precio').eq('activo', true).order('seccion').order('orden'),
      supabase.from('producto_formatos').select('producto_id, nombre, precio').eq('activo', true).order('orden'),
    ])
    if (!productos?.length) return ''
    const fmtMap: Record<string, { nombre: string; precio: number }[]> = {}
    for (const f of formatos ?? []) {
      if (!fmtMap[f.producto_id]) fmtMap[f.producto_id] = []
      fmtMap[f.producto_id].push({ nombre: f.nombre, precio: f.precio })
    }
    const bySec: Record<string, typeof productos> = {}
    for (const p of productos) { const s = p.seccion ?? 'otras'; if (!bySec[s]) bySec[s] = []; bySec[s].push(p) }
    const lines = Object.entries(bySec).map(([sec, items]) => {
      const row = items.map(p => {
        const alias = p.nombre_alternativo?.length ? ` [${(p.nombre_alternativo as string[]).join('/')}]` : ''
        const fmts = fmtMap[p.id]
        if (fmts?.length) return `${p.nombre}${alias} (formatos: ${fmts.map(f => `${f.nombre}:${f.precio}€`).join('/')})`
        const precio = p.precio != null ? ` ${p.precio}€` : ''
        return `${p.nombre}${alias}${precio}`
      }).join(' · ')
      return `${sec.toUpperCase()}: ${row}`
    })
    return `\nCARTA ACTIVA (usa el nombre canónico; alias entre corchetes):\n${lines.join('\n')}\n`
  } catch { return '' }
}

async function buildZonasContext(restaurante_id?: string): Promise<string> {
  try {
    const supabase = createServerClient()
    const { data: zonas } = await supabase
      .from('zonas').select('nombre, tipo, prefijo').eq('activa', true)
      .eq('restaurante_id', restaurante_id ?? '00000000-0000-0000-0000-000000000001').order('orden')
    if (!zonas?.length) return ''
    const lines = zonas.filter(z => z.prefijo).map(z => `  ${z.prefijo}XX = ${z.nombre} (ej: ${z.prefijo}01, ${z.prefijo}12)`).join('\n')
    return `\nZONAS DEL LOCAL (prefijos de mesa):\n${lines}\n`
  } catch { return '' }
}

// ── Prompt base ─────────────────────────────────────────────────────────────

const BASE_PROMPT = `Eres BRAIN, el agente de ia.rest. Conviertes transcripciones de voz de camareros españoles en comandas JSON estructuradas.

REGLAS ESTRICTAS:
- Responde SOLO con JSON valido, sin texto adicional ni markdown
- Entiende jerga: "manchado"=Cortado, "marchar"=enviar a cocina, "86"=agotado/sin stock
- Códigos de mesa según ZONAS DEL LOCAL (ver abajo). Fallback: S=salon, T=terraza, B=barra
- "salon cuatro"=S4, "salon doce"=S12, "terraza cuatro"=T4, "terraza uno"=T1, "barra dos"=B2, "barra uno"=B1
- Usa la CARTA ACTIVA para mapear alias al nombre canónico exacto
- Para tipo "86": los items son los productos agotados
- FORMATOS: si un producto tiene formatos (tapa/media/racion), extrae el formato mencionado en "formato" (null si no se menciona)
- El formato es INDEPENDIENTE del nombre del producto en carta. Busca el producto por su nombre, ignora la palabra del formato.
- Ejemplos: "una tapa de bravas"→nombre:"Patatas Bravas",formato:"tapa"; "media de croquetas"→nombre:"Croquetas",formato:"media"; "ración de jamón"→nombre:"Jamón Ibérico",formato:"racion"
- Variantes válidas de formato: tapa/tapita/tapas, media/medias, racion/ración/raciones/ración entera, entera, grande, chico/pequeño
- COMENSALES: si el camarero menciona número de personas/comensales/cubiertos, extráelo en "num_comensales" (null si no se menciona)
- Ejemplos comensales: "mesa cuatro para tres"→num_comensales:3, "somos cuatro"→num_comensales:4, "dos cubiertos"→num_comensales:2

NOTAS DE COMANDA (nota_general e item notas):
- El camarero puede añadir notas al FINAL de la comanda usando la palabra clave "nota"
- Sintaxis: "nota [referencia] [texto de la nota]"
- Referencia puede ser: nombre de producto, nombre de sección, "todo" o "general"
- "nota todo ..." o "nota general ..." → nota_general: aplica a toda la comanda
- "nota [nombre_producto] ..." → notas del item correspondiente
- "nota [sección: barra/cocina/fríos/postres/sala] ..." → notas de todos los items de esa sección
- Si la referencia no coincide → nota_general por defecto
- Ejemplos:
  - "dos cañas y patatas bravas a la T1, nota patatas sin salsa" → items[patatas].notas="sin salsa", nota_general:null
  - "mesa cuatro dos cañas un entrecot, nota todo sin sal" → nota_general="sin sal"
  - "tres cañas a la barra, nota barra en copa" → items[cañas].notas="en copa"
  - "dos vinos y croquetas mesa tres, nota cliente celíaca al gluten" → nota_general="cliente celíaca al gluten"
- IMPORTANTE: "nota" solo es keyword cuando aparece DESPUÉS de los items.

CUENTA POR MESA (tipo cuenta):
- Cuando el camarero dice "cuenta para B1", "la B1 la cuenta", "cobro mesa 3" → tipo:"cuenta", items:[]
- El estado de la mesa cambiará a "cuenta_pedida" automáticamente.

CUENTAS POR NOMBRE (nombre_cuenta):
- "a nombre de X", "para X" SIN mencionar mesa → mesa:"", nombre_cuenta:"X"
- Si hay TANTO mesa COMO nombre: usa la mesa, ignora el nombre (la mesa tiene prioridad)

VINOS — FAMILIA SEMÁNTICA (CRÍTICO):
- Familias: vino_tinto · vino_blanco · vino_rosado · cava · champagne · jerez · vermut
- «tinto»→vino_tinto, «blanco»→vino_blanco, «rosado»→vino_rosado, «cava»→cava, «champán»→champagne, «jerez/fino/manzanilla»→jerez, «vermut/vermú»→vermut
- «vino» sin tipo → pregunta «¿Tinto, blanco o rosado?»
- Filtra la carta POR FAMILIA antes de listar opciones de clarificación

CLARIFICACIÓN POR AMBIGÜEDAD:
- Si hay múltiples variantes distintas en carta y no se especificó cuál → necesita_clarificacion:true
- opciones_clarificacion: productos EXACTOS de la carta que coinciden, con precio y cantidad inferida
- NO preguntes si el producto es único, si ya especificó, o si las variantes son solo tamaño
- Si hay «→ respuesta:» en el input, es respuesta a clarificación anterior — úsala para completar

SCHEMA:
{"mesa":"S4","nombre_cuenta":null,"tipo":"comanda|marchar|86|cuenta|aviso","items":[{"nombre":"Nombre canónico de la carta","cantidad":2,"notas":"","formato":null}],"num_comensales":null,"nota_general":null,"necesita_clarificacion":false,"pregunta_clarificacion":null,"opciones_clarificacion":[],"confianza":0.95,"raw":"texto original"}`

// ── Proveedores ─────────────────────────────────────────────────────────────

/** Intenta parsear y valida que sea JSON con los campos mínimos requeridos */
function parseAndValidate(raw: string): BrainResult {
  const clean = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    // algunos modelos añaden texto antes del JSON — extraer primer { ... }
    // eslint-disable-next-line
    .replace(new RegExp('^[^{]*', 's'), '')
    // eslint-disable-next-line
    .replace(new RegExp('[^}]*$', 's'), '')
    .trim()

  const parsed = JSON.parse(clean)

  // Validación mínima: debe tener tipo y mesa (o nombre_cuenta)
  if (typeof parsed.tipo !== 'string') throw new Error('Campo tipo ausente')
  if (!Array.isArray(parsed.items)) parsed.items = []

  return parsed
}

/** NVIDIA NIM — OpenAI-compatible, free tier */
async function callNvidia(systemPrompt: string, userText: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')

  const model = process.env.NVIDIA_BRAIN_MODEL ?? 'meta/llama-3.3-70b-instruct'

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userText },
      ],
      max_tokens: 512,
      temperature: 0.1,
      top_p: 0.95,
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`NVIDIA HTTP ${res.status}: ${err.substring(0, 150)}`)
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('NVIDIA: respuesta vacía')
  return text
}

/** Anthropic Claude Haiku — fallback de pago */
async function callAnthropic(systemPrompt: string, userText: string): Promise<string> {
  const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
  })
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Respuesta inesperada de Anthropic')
  return content.text
}

// ── Función principal con cascada de proveedores ────────────────────────────

export async function parsearComanda(texto: string, restaurante_id?: string): Promise<BrainResult> {
  const [menuContext, zonasContext, recomContext] = await Promise.all([
    buildMenuContext(restaurante_id),
    buildZonasContext(restaurante_id),
    buildRecomendacionesContext(restaurante_id),
  ])

  const systemPrompt = BASE_PROMPT + zonasContext + menuContext + recomContext
  const hasNvidia = !!process.env.NVIDIA_API_KEY

  // ── Intento 1: NVIDIA NIM (gratis) ────────────────────────────────────────
  if (hasNvidia) {
    try {
      const raw = await Promise.race([
        callNvidia(systemPrompt, texto),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('NVIDIA timeout 8s')), 8_000)
        ),
      ])
      const result = parseAndValidate(raw)
      const model = process.env.NVIDIA_BRAIN_MODEL ?? 'meta/llama-3.3-70b-instruct'
      console.log(`[BRAIN] ✓ nvidia/${model}:`, result.tipo, result.mesa, result.items.length, 'items')
      return { ...result, raw: texto }
    } catch (e) {
      // NVIDIA falló — continuar a Anthropic sin interrumpir al camarero
      console.warn('[BRAIN] NVIDIA falló, fallback a Anthropic:', (e as Error).message)
    }
  }

  // ── Intento 2: Claude Haiku (fallback de pago) ────────────────────────────
  try {
    const raw = await Promise.race([
      callAnthropic(systemPrompt, texto),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Anthropic timeout 20s')), 20_000)
      ),
    ])
    const result = parseAndValidate(raw)
    const via = hasNvidia ? 'anthropic[fallback]' : 'anthropic'
    console.log(`[BRAIN] ✓ ${via}:`, result.tipo, result.mesa, result.items.length, 'items')
    return { ...result, raw: texto }
  } catch (e) {
    console.error('[BRAIN] Todos los proveedores fallaron:', (e as Error).message)
    return { mesa: 'T00', tipo: 'aviso', items: [], confianza: 0.1, raw: texto }
  }
}
