export const dynamic = 'force-dynamic'
// API Lead Hunter — fetch URL externa + análisis NIM
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'URL requerida' }, { status: 400 })

  // Fetch del contenido de la URL
  let contenido = ''
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ia.rest-bot/1.0)' },
      signal: AbortSignal.timeout(8000),
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
    return NextResponse.json({ error: `No se pudo acceder a la URL: ${e.message}` }, { status: 400 })
  }

  // NIM analiza el contenido
  const prompt = `Eres un asistente de ventas B2B para ia.rest, SaaS de comandas por voz para restaurantes en España.
Analiza el siguiente contenido de la web de un negocio de hostelería español.
URL: ${url}
CONTENIDO: ${contenido}
Responde SOLO con JSON válido, sin markdown:
{"nombre":"...","grupo":"...","ciudad":"...","tipo_cocina":"...","num_locales":1,"num_mesas_estimado":20,"tpv_actual":null,"tiene_delivery":false,"tiene_eventos":false,"tiene_carta_vinos":false,"email_contacto":null,"telefono":null,"nombre_contacto":null,"descripcion_negocio":"...","puntos_dolor":["...","...","..."],"cita_inventada":"...","precio_mrr_estimado":99,"headline_operativa":"...","modulos_recomendados":["voz","kds"],"objecion_principal":"...","respuesta_objecion":"..."}`

  const raw = await callAI('Eres un experto en análisis de negocios de hostelería española para ia.rest.', prompt, 1200)
  let analysis: any
  try {
    analysis = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'Error al procesar la IA', raw }, { status: 500 })
  }

  return NextResponse.json({ ok: true, analysis })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { mensaje } = await req.json()
  if (!mensaje) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
  tgAlert(mensaje, 'info')
  return NextResponse.json({ ok: true })
}
