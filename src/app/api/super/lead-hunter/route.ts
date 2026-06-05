export const dynamic = 'force-dynamic'
export const maxDuration = 30
// API Lead Hunter — fetch URL externa + análisis NIM
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session || session.rol !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL requerida' }, { status: 400 })

    // Detectar URLs que no son scrapebles (Google Maps, share links, etc.)
    const esUrlMaps = /maps\.google|share\.google|goo\.gl|maps\.app\.goo/i.test(url)

    // Fetch del contenido de la URL
    let contenido = ''
    if (!esUrlMaps) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ia.rest-bot/1.0)' },
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
        })
        const html = await r.text()
        contenido = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 4000)
      } catch (e: any) {
        contenido = `[URL no accesible: ${e.message}]`
      }
    } else {
      contenido = `[Enlace de Google Maps — extrae información del nombre del negocio y ubicación si aparece en la URL: ${url}]`
    }

    if (!contenido.trim() || contenido.length < 20) {
      contenido = `[Página sin contenido texto. URL: ${url}]`
    }

    // NIM analiza el contenido
    const prompt = `Eres un asistente de ventas B2B para ia.rest, SaaS de comandas por voz para restaurantes en España.
Analiza el siguiente contenido de la web de un negocio de hostelería español.
URL: ${url}
CONTENIDO: ${contenido}
Si el contenido es escaso, infiere lo que puedas de la URL y el nombre del negocio.
Responde SOLO con JSON válido, sin markdown:
{"nombre":"...","grupo":"...","ciudad":"...","tipo_cocina":"...","num_locales":1,"num_mesas_estimado":20,"tpv_actual":null,"tiene_delivery":false,"tiene_eventos":false,"tiene_carta_vinos":false,"email_contacto":null,"telefono":null,"nombre_contacto":null,"descripcion_negocio":"...","puntos_dolor":["...","...","..."],"cita_inventada":"...","precio_mrr_estimado":99,"headline_operativa":"...","modulos_recomendados":["voz","kds"],"objecion_principal":"...","respuesta_objecion":"..."}`

    let raw = ''
    try {
      raw = await callAI('Eres un experto en análisis de negocios de hostelería española para ia.rest.', prompt, 1200, 20000, true)
    } catch (e: any) {
      return NextResponse.json({ error: `Error IA: ${e.message}` }, { status: 500 })
    }

    if (!raw || !raw.trim()) {
      return NextResponse.json({ error: 'La IA no devolvió respuesta. Prueba con una URL de web directa del restaurante.' }, { status: 500 })
    }

    let analysis: any
    try {
      analysis = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Error al procesar la respuesta IA', raw }, { status: 500 })
    }

    return NextResponse.json({ ok: true, analysis })
  } catch (e: any) {
    return NextResponse.json({ error: `Error interno: ${e.message}` }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session || session.rol !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const { mensaje } = await req.json()
    if (!mensaje) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    await tgAlert(mensaje, 'info')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
