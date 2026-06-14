export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getGscData, getGa4Data, getOAuthToken } from '@/lib/seo/gsc-ga4'
import {
  upsertOverride, upsertBlock, insertArticulo, registrarCambio, cambiosRecientes, getOverride, getArticulo,
} from '@/lib/seo/store'
import { listarTargets, RUTAS_SEO_EDITABLES } from '@/lib/seo/targets'
import {
  agenteHabilitado, rutaEditable, dentroDeLimite, rutaEnCooldown, maxCambios, minImpresiones,
} from '@/lib/seo/guardrails'

const TG_BOT  = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || ''

async function telegram(msg: string) {
  if (!TG_BOT || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
  })
}

async function solicitarIndexacion(path: string) {
  try {
    const token = await getOAuthToken()
    await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.iarest.es${path}`, type: 'URL_UPDATED' }),
    })
  } catch { /* no crítico */ }
}

const SYSTEM = `Eres el Agente SEO AUTÓNOMO de ia.rest. Analizas datos reales de Google Search Console y GA4 y aplicas mejoras de SEO TÚ MISMO mediante las herramientas de escritura.

PRODUCTO: ia.rest, Voice POS hostelería española. www.iarest.es. 59€/mes, sin comisión. Competencia: SmartBar (99,99€), Agora, ICG.

METODOLOGÍA:
1. Pide get_gsc_data (queries y pages) y get_ga4_data (pages) antes de decidir.
2. Cruza señales: impresiones altas + CTR bajo → set_metadata; posición 5-20 → set_content_block; bounce alto → set_content_block; keyword sin cubrir → create_article.
3. Aplica SOLO cambios con datos que lo justifiquen. Llama list_seo_targets para ver qué rutas puedes tocar y su estado actual.
4. NO inventes cifras ni testimonios. Español. Prohibidas: innovador, revolucionario, disruptivo, potente.

Solo puedes editar las rutas que devuelve list_seo_targets. Tras terminar, deja de llamar herramientas.`

const TOOLS = [
  { type: 'web_search_20250305', name: 'web_search' },
  { name: 'get_gsc_data', description: 'Datos GSC reales (queries/pages/...)', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['queries','pages','countries','devices'] }, days: { type: 'number' }, rowLimit: { type: 'number' } }, required: ['type'] } },
  { name: 'get_ga4_data', description: 'Datos GA4 reales', input_schema: { type: 'object', properties: { report: { type: 'string', enum: ['overview','pages','sources','conversions','landing'] }, days: { type: 'number' } }, required: ['report'] } },
  { name: 'list_seo_targets', description: 'Rutas editables y su SEO actual + artículos existentes', input_schema: { type: 'object', properties: {} } },
  { name: 'set_metadata', description: 'Fija title/description/canonical/og de una ruta editable', input_schema: { type: 'object', properties: { ruta: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, canonical: { type: 'string' }, motivo: { type: 'string' } }, required: ['ruta','motivo'] } },
  { name: 'set_schema', description: 'Fija JSON-LD de una ruta editable', input_schema: { type: 'object', properties: { ruta: { type: 'string' }, jsonld: { type: 'object' }, motivo: { type: 'string' } }, required: ['ruta','jsonld','motivo'] } },
  { name: 'set_content_block', description: 'Inserta/actualiza un bloque de contenido en una ruta editable', input_schema: { type: 'object', properties: { ruta: { type: 'string' }, posicion: { type: 'number' }, titulo: { type: 'string' }, html: { type: 'string' }, motivo: { type: 'string' } }, required: ['ruta','posicion','html','motivo'] } },
  { name: 'create_article', description: 'Crea un artículo nuevo en /blog/{slug}', input_schema: { type: 'object', properties: { slug: { type: 'string' }, titulo: { type: 'string' }, meta_description: { type: 'string' }, keyword: { type: 'string' }, bloques: { type: 'array', items: { type: 'object', properties: { h2: { type: 'string' }, html: { type: 'string' } } } }, motivo: { type: 'string' } }, required: ['slug','titulo','bloques','motivo'] } },
]

export async function GET(req: NextRequest) {
  // Auth: cron de Vercel o super_admin
  const auth = req.headers.get('authorization')
  let isSuper = false
  const sh = req.headers.get('x-ia-session')
  if (sh) { try { isSuper = JSON.parse(sh)?.rol === 'super_admin' } catch {} }
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && !isSuper)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Kill switch
  if (!agenteHabilitado(process.env as any))
    return NextResponse.json({ ok: false, msg: 'SEO_AGENT_ENABLED != true' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })

  const runId = randomUUID()
  const max = maxCambios(process.env as any)
  const recientes = await cambiosRecientes(7)
  const ahora = new Date()
  let aplicados = 0
  const resumen: string[] = []

  // Aplica una mutación si pasa los guardarraíles. Devuelve true si aplicó.
  async function aplicar(ruta: string, tipo: string, antes: unknown, accion: () => Promise<void>, descripcion: string, motivo: string): Promise<string> {
    if (!rutaEditable(ruta, RUTAS_SEO_EDITABLES) && tipo !== 'articulo')
      return `RECHAZADO: ${ruta} no es editable`
    if (!dentroDeLimite(aplicados, max)) return `RECHAZADO: límite de ${max} cambios alcanzado`
    if (tipo !== 'articulo' && rutaEnCooldown(ruta, recientes, ahora, 7)) return `RECHAZADO: ${ruta} en cooldown (7d)`
    await accion()
    await registrarCambio({ run_id: runId, ruta, tipo: tipo as any, valor_antes: antes, valor_despues: descripcion, motivo })
    aplicados++
    resumen.push(`• [${tipo}] ${ruta}: ${motivo}`)
    await solicitarIndexacion(ruta)
    return `OK: aplicado a ${ruta}`
  }

  async function executeTool(name: string, input: any): Promise<string> {
    if (name === 'get_gsc_data') return getGscData(input)
    if (name === 'get_ga4_data') return getGa4Data(input)
    if (name === 'list_seo_targets') return JSON.stringify(await listarTargets())
    if (name === 'set_metadata') {
      const antes = await getOverride(input.ruta)
      return aplicar(input.ruta, 'metadata', antes, () => upsertOverride({ ruta: input.ruta, title: input.title, description: input.description, canonical: input.canonical }), 'metadata', input.motivo)
    }
    if (name === 'set_schema') {
      const antes = await getOverride(input.ruta)
      return aplicar(input.ruta, 'schema', antes?.jsonld ?? null, () => upsertOverride({ ruta: input.ruta, jsonld: input.jsonld }), 'schema', input.motivo)
    }
    if (name === 'set_content_block') {
      return aplicar(input.ruta, 'content_block', null, () => upsertBlock({ ruta: input.ruta, posicion: input.posicion, titulo: input.titulo, html: input.html }), 'content_block', input.motivo)
    }
    if (name === 'create_article') {
      const existe = await getArticulo(input.slug)
      if (existe) return `RECHAZADO: ya existe artículo ${input.slug}`
      return aplicar(`/blog/${input.slug}`, 'articulo', null, () => insertArticulo({ slug: input.slug, titulo: input.titulo, meta_description: input.meta_description, keyword: input.keyword, bloques: input.bloques }), 'articulo', input.motivo)
    }
    return `Herramienta desconocida: ${name}`
  }

  try {
    const system = `${SYSTEM}\n\nUMBRAL: solo actúa sobre queries con impresiones >= ${minImpresiones(process.env as any)} en GSC. No optimices ruido.`
    let messages: any[] = [{ role: 'user', content: 'Analiza el SEO de iarest.es de esta semana y aplica las mejoras justificadas por los datos.' }]
    for (let i = 0; i < 10; i++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system, tools: TOOLS, messages }),
      })
      const data = await res.json()
      if (!data.content) break
      if (data.stop_reason === 'end_turn') break
      if (data.stop_reason === 'tool_use') {
        messages = [...messages, { role: 'assistant', content: data.content }]
        const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
        const results = await Promise.all(toolUses.map(async (tu: any) => {
          let result: string
          if (tu.name === 'web_search') {
            const ws = data.content.find((b: any) => b.type === 'tool_result' && b.tool_use_id === tu.id)
            result = ws?.content?.[0]?.text || 'Búsqueda procesada'
          } else { result = await executeTool(tu.name, tu.input) }
          return { type: 'tool_result', tool_use_id: tu.id, content: result }
        }))
        messages = [...messages, { role: 'user', content: results }]
        continue
      }
      break
    }

    await telegram(
      aplicados
        ? `🤖 <b>Agente SEO — ${aplicados} cambio(s)</b>\n\n${resumen.join('\n')}\n\nRevertir en /super → SEO`
        : `🤖 <b>Agente SEO</b>: sin cambios esta pasada (sin oportunidades con datos suficientes).`
    )
    return NextResponse.json({ ok: true, run_id: runId, aplicados, resumen })
  } catch (err: any) {
    await telegram(`❌ Agente SEO error: ${err.message}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
