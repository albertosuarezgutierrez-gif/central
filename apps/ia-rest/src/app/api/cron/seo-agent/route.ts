export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getGscData, getGa4Data } from '@/lib/seo/gsc-ga4'
import {
  upsertOverride, upsertBlock, insertArticulo, registrarCambio, cambiosRecientes, getOverride, getArticulo,
} from '@/lib/seo/store'
import { listarTargets, RUTAS_SEO_EDITABLES } from '@/lib/seo/targets'
import {
  agenteHabilitado, rutaEditable, dentroDeLimite, rutaEnCooldown, maxCambios, minImpresiones,
} from '@/lib/seo/guardrails'
import { callAITools, callAISearch } from '@/lib/ai-client'

const TG_BOT  = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || ''

async function telegram(msg: string) {
  if (!TG_BOT || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
  })
}

// ⚠️ La Indexing API de Google solo soporta oficialmente `JobPosting` y `BroadcastEvent`: para una
// página normal ignora el `URL_UPDATED`. Llamarla daba una falsa sensación de "ya he pedido
// indexación" cuando no se estaba pidiendo nada. El re-rastreo real llega por el sitemap
// (`/sitemap.xml`, ya enviado en Search Console), que se regenera cada hora.
// Se deja documentado, y NO se llama, para que nadie lo "restaure" pensando que funcionaba.

const SYSTEM = `Eres el Agente SEO AUTÓNOMO de ia.rest. Analizas datos reales de Google Search Console y GA4 y aplicas mejoras de SEO TÚ MISMO mediante las herramientas de escritura.

PRODUCTO: ia.rest, Voice POS hostelería española. www.iarest.es. Sin comisión por transacción.
Competencia: SmartBar, Agora, ICG, Numier.

🚨 REGLA INVIOLABLE — NUNCA PUBLIQUES UN PRECIO DE ia.rest.
La tarifa NO se publica: no la escribas en un title, ni en una description, ni en un bloque de
contenido, ni en un artículo, ni en JSON-LD (nada de Offer/price/priceSpecification). Si la keyword
es de precio ("cuánto cuesta un TPV", "precio TPV bar"), cubre la INTENCIÓN sin dar cifra: explica el
modelo (cuota mensual fija por usuario activo, 0% de comisión sobre ventas, sin permanencia) y remata
llevando al formulario de contacto (/#contacto) o al WhatsApp. Puedes citar precios PÚBLICOS DE LA
COMPETENCIA y costes de hardware de terceros, nunca los nuestros.

CONVERSIÓN: el único camino es el formulario de contacto (/#contacto) y el WhatsApp directo. No
inventes otros CTA ni prometas alta self-service.

METODOLOGÍA:
1. Pide get_gsc_data (queries y pages) y get_ga4_data (pages) antes de decidir.
2. Cruza señales: impresiones altas + CTR bajo → set_metadata; posición 5-20 → set_content_block; bounce alto → set_content_block; keyword sin cubrir → create_article.
3. Aplica SOLO cambios con datos que lo justifiquen. Llama list_seo_targets para ver qué rutas puedes tocar y su estado actual.
4. NO inventes cifras ni testimonios. Español. Prohibidas: innovador, revolucionario, disruptivo, potente.

Solo puedes editar las rutas que devuelve list_seo_targets. Tras terminar, deja de llamar herramientas.`

// Tools en formato OpenAI (NVIDIA NIM, function-calling). web_search es custom, respaldada por Gemini.
const fn = (name: string, description: string, parameters: any) => ({ type: 'function' as const, function: { name, description, parameters } })
const TOOLS = [
  fn('web_search', 'Busca en la web (competencia, keywords, noticias del sector) y devuelve un resumen.', { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }),
  fn('get_gsc_data', 'Datos GSC reales (queries/pages/...)', { type: 'object', properties: { type: { type: 'string', enum: ['queries','pages','countries','devices'] }, days: { type: 'number' }, rowLimit: { type: 'number' } }, required: ['type'] }),
  fn('get_ga4_data', 'Datos GA4 reales', { type: 'object', properties: { report: { type: 'string', enum: ['overview','pages','sources','conversions','landing'] }, days: { type: 'number' } }, required: ['report'] }),
  fn('list_seo_targets', 'Rutas editables y su SEO actual + artículos existentes', { type: 'object', properties: {} }),
  fn('set_metadata', 'Fija title/description/canonical/og de una ruta editable', { type: 'object', properties: { ruta: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, canonical: { type: 'string' }, motivo: { type: 'string' } }, required: ['ruta','motivo'] }),
  fn('set_schema', 'Fija JSON-LD de una ruta editable', { type: 'object', properties: { ruta: { type: 'string' }, jsonld: { type: 'object' }, motivo: { type: 'string' } }, required: ['ruta','jsonld','motivo'] }),
  fn('set_content_block', 'Inserta/actualiza un bloque de contenido en una ruta editable', { type: 'object', properties: { ruta: { type: 'string' }, posicion: { type: 'number' }, titulo: { type: 'string' }, html: { type: 'string' }, motivo: { type: 'string' } }, required: ['ruta','posicion','html','motivo'] }),
  fn('create_article', 'Crea un artículo nuevo en /blog/{slug}', { type: 'object', properties: { slug: { type: 'string' }, titulo: { type: 'string' }, meta_description: { type: 'string' }, keyword: { type: 'string' }, bloques: { type: 'array', items: { type: 'object', properties: { h2: { type: 'string' }, html: { type: 'string' } } } }, motivo: { type: 'string' } }, required: ['slug','titulo','bloques','motivo'] }),
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
    return `OK: aplicado a ${ruta}`
  }

  async function executeTool(name: string, input: any): Promise<string> {
    if (name === 'web_search') return callAISearch('Eres un asistente de investigación SEO. Resume con datos concretos.', String(input?.query ?? ''), 1200)
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
    // Bucle agéntico con NVIDIA NIM (function-calling). Las herramientas (GSC/GA4 + escritura SEO)
    // se ejecutan aquí igual que antes; el "cerebro" pasó de Anthropic a NIM (gratis, sin saldo).
    const messages: any[] = [{ role: 'user', content: 'Analiza el SEO de iarest.es de esta semana y aplica las mejoras justificadas por los datos.' }]
    for (let i = 0; i < 10; i++) {
      const msg = await callAITools(system, messages, TOOLS, 2048)
      if (msg.tool_calls?.length) {
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })
        for (const tc of msg.tool_calls) {
          let input: any = {}
          try { input = JSON.parse(tc.function.arguments || '{}') } catch { /* args no-JSON */ }
          const result = await executeTool(tc.function.name, input)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        continue
      }
      break
    }

    // Un agente callado NO es un agente sano: entre junio y agosto de 2026 este mandó "sin cambios"
    // en cada pasada mientras `seo_cambios` seguía a 0 filas, y ese silencio se leyó como normalidad.
    // A partir de 3 semanas sin aplicar NADA el aviso deja de ser informativo y pasa a ser alerta.
    let mensaje: string
    if (aplicados) {
      mensaje = `🤖 <b>Agente SEO — ${aplicados} cambio(s)</b>\n\n${resumen.join('\n')}\n\nRevertir en /super → SEO`
    } else {
      const ultimas3Semanas = await cambiosRecientes(21)
      mensaje = ultimas3Semanas.length
        ? `🤖 <b>Agente SEO</b>: sin cambios esta pasada (sin oportunidades con datos suficientes).`
        : `⚠️ <b>Agente SEO — 3 semanas sin aplicar NADA</b>\n\nNi un cambio en 21 días. Esto no es «no había oportunidades»: revisa que GSC devuelve datos (¿está el sitio indexado?) y que el umbral SEO_MIN_IMPR (${minImpresiones(process.env as any)} impresiones) no está dejando fuera todo el tráfico real.`
    }
    await telegram(mensaje)
    return NextResponse.json({ ok: true, run_id: runId, aplicados, resumen })
  } catch (err: any) {
    await telegram(`❌ Agente SEO error: ${err.message}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
