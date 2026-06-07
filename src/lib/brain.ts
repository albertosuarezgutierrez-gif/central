import { BrainResult } from '@/types'
import { createServerClient } from '@/lib/supabase'
import { getMenuCache } from '@/lib/brain-cache'
import { corregirTranscripcion, registrarCorreccionFuzzy } from '@/lib/fuzzy-comanda'

// ── Contexto dinámico (recomendaciones, carta, zonas) ──────────────────────

async function buildRecomendacionesContext(restaurante_id?: string): Promise<string> {
  if (!restaurante_id) return ''
  try {
    const db = createServerClient()
    const { data } = await db
      .from('v_recomendaciones_activas')
      .select('producto_nombre, precio, nota, hora_hasta, cantidad_restante')
      .eq('local_id', restaurante_id)
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
      .eq('local_id', restaurante_id ?? '00000000-0000-0000-0000-000000000001').order('orden')
    if (!zonas?.length) return ''
    const lines = zonas.filter(z => z.prefijo).map(z => `  ${z.prefijo}XX = ${z.nombre} (ej: ${z.prefijo}01, ${z.prefijo}12)`).join('\n')
    return `\nZONAS DEL LOCAL (prefijos de mesa):\n${lines}\n`
  } catch { return '' }
}

async function buildPersonalContext(restaurante_id?: string): Promise<string> {
  if (!restaurante_id) return ''
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('personal')
      .select('id, nombre, rol')
      .eq('activo', true)
      .eq('local_id', restaurante_id)
      .order('nombre')
    if (!data?.length) return ''
    const lines = data.map((c: { id: string; nombre: string; rol: string }) =>
      `  ${c.nombre} (${c.rol}) → id:${c.id}`
    ).join('\n')
    return `\nPERSONAL ACTIVO (para mensajes por nombre):\n${lines}\n`
  } catch { return '' }
}

async function buildSeccionesContext(restaurante_id?: string): Promise<string> {
  if (!restaurante_id) return ''
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('secciones_cocina')
      .select('id, nombre, impresora_id')
      .eq('activa', true)
      .eq('local_id', restaurante_id)
      .order('orden')
    if (!data?.length) return ''
    const lines = data.map((s: { id: string; nombre: string; impresora_id: string | null }) =>
      `  "${s.nombre}" → id:${s.id}${s.impresora_id ? ' (con impresora)' : ''}`
    ).join('\n')
    return `\nSECCIONES DE COCINA (para mensajes por sección):\n${lines}\n`
  } catch { return '' }
}

async function buildVinosContext(restaurante_id?: string): Promise<string> {
  if (!restaurante_id) return ''
  try {
    const supabase = createServerClient()
    // Leer vinos desde productos (arquitectura unificada)
    const { data } = await supabase
      .from('productos')
      .select('nombre, precio, precio_copa, familia, metadata')
      .eq('local_id', restaurante_id)
      .eq('categoria', 'vino')
      .eq('activo', true)
      .order('nombre')
      .limit(60)
    if (!data?.length) return ''
    const lines = data.map((v: {
      nombre: string; precio: number; precio_copa?: number;
      familia: string; metadata?: Record<string, unknown>;
    }) => {
      const m = v.metadata ?? {}
      const tipo = (m.tipo_vino as string) ?? v.familia.replace('vino_', '')
      const stock = (m.stock_botellas as number) ?? 0
      if (stock === 0 && m.tipo_stock !== 'consignacion') return null // agotado
      const precios = [
        v.precio_copa ? `copa ${v.precio_copa}€` : null,
        v.precio ? `botella ${v.precio}€` : null,
      ].filter(Boolean).join(' / ')
      const disponibilidad = stock > 0 && stock <= 2 ? ' [últimas unidades]' : ''
      return `  ${v.nombre} | ${m.bodega ?? ''} | ${tipo} | D.O.${m.denominacion_origen ?? ''} | ${m.varietal ?? ''}` +
        (m.maridaje_texto ? ` | maridaje: ${m.maridaje_texto}` : '') +
        (precios ? ` | ${precios}` : '') +
        disponibilidad
    }).filter(Boolean).join('\n')
    if (!lines.length) return ''
    return `\nCARTA DE VINOS DEL RESTAURANTE:\n${lines}\n`
  } catch { return '' }
}

/**
 * Memoria de sesión: ejemplos confirmados del turno activo.
 * Consulta ia_training_log del turno actual con calidad >= 3.
 * Estos ejemplos reflejan el estilo de habla real del camarero en ESTE turno.
 */
async function buildSesionContext(
  restaurante_id?: string,
  turno_id?: string,
  camarero_id?: string
): Promise<string> {
  if (!restaurante_id || !turno_id) return ''
  try {
    const supabase = createServerClient()
    const query = supabase
      .from('ia_training_log')
      .select('input_raw, output_brain, calidad, camarero_id')
      .eq('local_id', restaurante_id)
      .eq('turno_id', turno_id)
      .gte('calidad', 3)
      .not('output_brain', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8)

    const { data } = await query
    if (!data?.length) return ''

    // Filtrar: solo comandas con items reales (no cuentas/marchar/86)
    const ejemplos = data
      .filter(r => {
        const b = r.output_brain as { tipo?: string; items?: unknown[]; confianza?: number }
        return b?.tipo === 'comanda' && Array.isArray(b.items) && b.items.length > 0
      })
      .slice(0, 6)
      .map(r => {
        const b = r.output_brain as {
          mesa?: string
          items?: { nombre: string; cantidad: number; notas?: string }[]
          nota_general?: string | null
        }
        const itemsStr = (b.items ?? [])
          .map(it => `${it.cantidad}x${it.nombre}${it.notas ? ` (${it.notas})` : ''}`)
          .join(', ')
        const nota = b.nota_general ? ` | nota_general:"${b.nota_general}"` : ''
        const quienStr = camarero_id && r.camarero_id === camarero_id ? '' : ' [otro camarero]'
        return `  - "${r.input_raw}" → mesa:${b.mesa ?? '?'} items:[${itemsStr}]${nota}${quienStr}`
      })

    if (!ejemplos.length) return ''

    return `\nEJEMPLOS REALES DE ESTE TURNO (patrones confirmados por los camareros):\n${ejemplos.join('\n')}\nUsa estos ejemplos para calibrar cómo hablan en este restaurante hoy.\n`
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
- Si la referencia no coincide con ningún producto/sección/todo/general → nota_general con el TEXTO COMPLETO tras "nota" (incluyendo la palabra que no matcheó)
- Ejemplos:
  - "dos cañas y patatas bravas a la T1, nota patatas sin salsa" → items[patatas].notas="sin salsa", nota_general:null
  - "mesa cuatro dos cañas un entrecot, nota todo sin sal" → nota_general="sin sal"
  - "tres cañas a la barra, nota barra en copa" → items[cañas].notas="en copa"
  - "dos vinos y croquetas mesa tres, nota cliente celíaca al gluten" → nota_general="cliente celíaca al gluten"
  - "un café con leche nota con sacarina" → items[café con leche].notas="con sacarina" (referencia "con" no matchea → texto completo "con sacarina" va al item único)
  - "un café con leche y un agua nota con sacarina" → nota_general="con sacarina" (referencia "con" no matchea y hay 2+ items → texto completo "con sacarina" a nota_general)
- REGLA CRÍTICA: cuando la referencia no matchea, el texto de la nota es TODO lo que hay después de "nota", NO solo la parte tras la referencia
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

MENSAJES / AVISOS entre roles (tipo aviso):
- Cuando el camarero dice "mensaje a cocina [texto]", "avisa a cocina [texto]", "di a cocina [texto]":
  → tipo:"aviso", mesa:"cocina", nota_general:"[texto del mensaje]", items:[]
- Cuando el camarero empieza con el nombre de un compañero del PERSONAL ACTIVO:
  → tipo:"aviso", mesa:"", destinatario_nombre:"[nombre exacto del PERSONAL ACTIVO]", nota_general:"[texto]", items:[]
- Cuando el camarero usa el nombre de una SECCIÓN DE COCINA como destino:
  → tipo:"aviso", mesa:"[nombre exacto de la sección]", nota_general:"[texto]", items:[]
- Destinatarios de rol genérico: "cocina" | "barra" | "sala" | "todos"
- El texto del mensaje va SIEMPRE en nota_general (nunca en items)
- Ejemplos:
  - "mensaje a cocina, S1 tiene prisa" → tipo:"aviso", mesa:"cocina", nota_general:"S1 tiene prisa"
  - "avisa a barra que T4 quiere agua" → tipo:"aviso", mesa:"barra", nota_general:"T4 quiere agua"
  - "Pablo, T4 esperando el segundo" → tipo:"aviso", mesa:"", destinatario_nombre:"Pablo", nota_general:"T4 esperando el segundo"
  - "cocina caliente, S1 tiene prisa" → tipo:"aviso", mesa:"Cocina Caliente", nota_general:"S1 tiene prisa"
  - "di a todos que vamos a cerrar" → tipo:"aviso", mesa:"todos", nota_general:"vamos a cerrar"

MARCHAR POR PRODUCTO (tipo marchar con items):
- "marcha las croquetas S1" → tipo:"marchar", mesa:"S1", items:[{nombre:"Croquetas",cantidad:1}], confianza:0.92
- "pasa el entrecot T4" → tipo:"marchar", mesa:"T4", items:[{nombre:"Entrecot",cantidad:1}], confianza:0.92
- "marcha croquetas y entrecot S1" → tipo:"marchar", mesa:"S1", items:[{nombre:"Croquetas",cantidad:1},{nombre:"Entrecot",cantidad:1}], confianza:0.85
- "pasa las bravas y los calamares T2" → tipo:"marchar", mesa:"T2", items:[{nombre:"Bravas",cantidad:1},{nombre:"Calamares",cantidad:1}]
- "marcha S1" sin producto → tipo:"marchar", mesa:"S1", items:[]

RECOMENDACIÓN DE VINO (tipo recomendacion_vino):
- Cuando el camarero pide recomendación de vino para un plato:
  "recomendación de vino para solomillo" / "¿qué vino va con la dorada?" / "vino para caza mayor"
  → tipo:"recomendacion_vino", mesa:"", items:[], nota_general:"[recomendación completa]"
- La nota_general debe ser una respuesta CORTA (máx 2 frases) que el camarero pueda decir al cliente
- Usa SIEMPRE vinos de la CARTA DE VINOS DEL RESTAURANTE si están disponibles
- Si hay vino perfecto para el plato → nómbralo con bodega, D.O. y precio
- Si no hay vino específico en carta → recomienda tipo/D.O. genérica
- Ejemplos de respuesta en nota_general:
  "Para el solomillo, el Vega Sicilia Único 2015, Ribera del Duero, taninos sedosos que abrazan la carne. Botella a 95€."
  "Para la dorada a la sal, un Albariño Rías Baixas. Fresco, con acidez que realza el pescado. Copa a 4€."
  "Para el cochinillo, un Ribera del Duero crianza, taninos suaves. El Protos está a 28€ botella."

SCHEMA:
{"mesa":"S4","nombre_cuenta":null,"tipo":"comanda|marchar|86|cuenta|aviso|recomendacion_vino","destinatario_nombre":null,"items":[{"nombre":"Nombre canónico de la carta","cantidad":2,"notas":"","formato":null,"peso_gramos":null}],"num_comensales":null,"nota_general":null,"necesita_clarificacion":false,"pregunta_clarificacion":null,"opciones_clarificacion":[],"confianza":0.95,"raw":"texto original"}

PRODUCTOS POR PESO (peso_gramos en items):
- Cuando el camarero menciona un peso junto a un producto → extrae peso_gramos (en gramos enteros)
- "150 gramos de gamba roja para la 5" → items:[{nombre:"Gamba Roja",cantidad:1,peso_gramos:150}]
- "200g de salmón mesa 3" → items:[{nombre:"Salmón",cantidad:1,peso_gramos:200}]
- "una lubina de dos kilos" → items:[{nombre:"Lubina",cantidad:1,peso_gramos:2000}]
- "medio kilo de berberechos T2" → items:[{nombre:"Berberechos",cantidad:1,peso_gramos:500}]
- Si no se menciona peso → peso_gramos:null (cocina lo pesará en KDS)`

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

  // Los avisos y recomendaciones de vino no deben tener items de comanda
  if (parsed.tipo === 'aviso' || parsed.tipo === 'recomendacion_vino') {
    parsed.items = []
  }

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

export async function parsearComanda(
  texto: string,
  restaurante_id?: string,
  turno_id?: string,
  camarero_id?: string
): Promise<BrainResult> {
  // ── Capa 1: corrección léxica fuzzy (sin IA, <5ms) ──────────────────────
  // Corrige errores de transcripción Whisper antes de enviar al LLM.
  // Reutiliza el brain-cache — sin query extra a BD.
  let textoParaLLM = texto
  if (restaurante_id) {
    try {
      const cacheFuzzy = await getMenuCache(restaurante_id)
      const correccion = corregirTranscripcion(texto, cacheFuzzy.productos)
      if (correccion.hubo_cambios) {
        textoParaLLM = correccion.corregido
        console.log(`[FUZZY] "${texto}" → "${textoParaLLM}" (${correccion.cambios.length} fix, avg ${correccion.confianza.toFixed(2)})`)
        registrarCorreccionFuzzy(createServerClient(), restaurante_id, turno_id, correccion).catch(() => {})
      }
    } catch {
      // Si fuzzy falla, continuar con texto original sin interrumpir
    }
  }

  // Lanzar todas las consultas de contexto en paralelo (carta + zonas + recom + sesión + personal)
  // Cargar vinos solo si la transcripción lo sugiere (ahorra latencia)
  const necesitaVinos = /recomend|maridaj|vino para|vino con|sommelier|sumiller|que vino/i.test(textoParaLLM)

  const [menuContext, zonasContext, recomContext, sesionContext, personalContext, seccionesContext, vinosContext] = await Promise.all([
    buildMenuContext(restaurante_id),
    buildZonasContext(restaurante_id),
    buildRecomendacionesContext(restaurante_id),
    buildSesionContext(restaurante_id, turno_id, camarero_id),
    buildPersonalContext(restaurante_id),
    buildSeccionesContext(restaurante_id),
    necesitaVinos ? buildVinosContext(restaurante_id) : Promise.resolve(''),
  ])

  const systemPromptBase = BASE_PROMPT + zonasContext + personalContext + seccionesContext + (necesitaVinos ? vinosContext : '') + menuContext + recomContext
  const hasNvidia = !!process.env.NVIDIA_API_KEY

  if (sesionContext) {
    console.log(`[BRAIN] memoria sesión disponible (${sesionContext.split('\n').filter(l => l.startsWith('  -')).length} ejemplos)`)
  }

  // ── Intento 1: NVIDIA NIM (gratis, sin memoria de sesión para latencia óptima) ──
  if (hasNvidia) {
    try {
      const raw = await Promise.race([
        callNvidia(systemPromptBase, textoParaLLM),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('NVIDIA timeout 5s')), 5_000)
        ),
      ])
      const result = parseAndValidate(raw)
      const model = process.env.NVIDIA_BRAIN_MODEL ?? 'meta/llama-3.3-70b-instruct'

      // Si confianza es baja y tenemos memoria de sesión, reintentar con contexto enriquecido
      if ((result.confianza ?? 1) < 0.72 && sesionContext) {
        console.warn(`[BRAIN] NVIDIA confianza baja (${result.confianza}), reintentando con memoria de sesión`)
        try {
          const rawRetry = await Promise.race([
            callNvidia(systemPromptBase + sesionContext, textoParaLLM),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('NVIDIA retry timeout 5s')), 5_000)
            ),
          ])
          const retryResult = parseAndValidate(rawRetry)
          if ((retryResult.confianza ?? 0) > (result.confianza ?? 0)) {
            console.log(`[BRAIN] ✓ nvidia+sesión mejoró: ${result.confianza?.toFixed(2)} → ${retryResult.confianza?.toFixed(2)}`)
            return { ...retryResult, raw: texto }
          }
        } catch { /* si el retry falla, usar el resultado original */ }
      }

      console.log(`[BRAIN] ✓ nvidia/${model}:`, result.tipo, result.mesa, result.items.length, 'items')
      return { ...result, raw: texto }
    } catch (e) {
      console.warn('[BRAIN] NVIDIA falló, fallback a Anthropic:', (e as Error).message)
    }
  }

  // ── Intento 2: Claude Haiku con memoria de sesión ─────────────────────────
  // Si NVIDIA falló completamente, Haiku lleva el contexto enriquecido
  const systemPromptFallback = sesionContext
    ? systemPromptBase + sesionContext
    : systemPromptBase
  try {
    const raw = await Promise.race([
      callAnthropic(systemPromptFallback, textoParaLLM),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Anthropic timeout 20s')), 20_000)
      ),
    ])
    const result = parseAndValidate(raw)
    const via = hasNvidia ? 'anthropic[fallback+sesión]' : 'anthropic'
    console.log(`[BRAIN] ✓ ${via}:`, result.tipo, result.mesa, result.items.length, 'items')
    return { ...result, raw: texto }
  } catch (e) {
    console.error('[BRAIN] Todos los proveedores fallaron:', (e as Error).message)
    return { mesa: 'T00', tipo: 'aviso', items: [], confianza: 0.1, raw: texto }
  }
}
