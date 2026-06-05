export const dynamic = 'force-dynamic'
export const maxDuration = 30
// API Lead Hunter — fetch URL externa + análisis NIM
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAI, callAISearch, cleanJSON } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session || session.rol !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()

    // ── Modo CAPTION: analizar post de Instagram/TikTok (NIM, sin búsqueda) ──
    if (body.caption) {
      const prompt = `Eres un asistente de ventas B2B para ia.rest, SaaS de comandas por voz para restaurantes en España.
Analiza este post de Instagram/TikTok.${body.ciudad ? ` Ciudad probable: ${body.ciudad}.` : ''}
POST: ${body.caption}
Responde SOLO con JSON válido, sin markdown:
{"es_lead":true,"tipo":"apertura|queja_tpv|reforma|otro","nombre_local":"...","ciudad":"...","tipo_cocina":"...","tamaño_estimado":"pequeño|mediano|grande","tpv_mencionado":"Ágora|Glop|Hiopos|Revo|null","urgencia":"alta|media|baja","notas":"...","dm_sugerido":"DM máx 200 chars, tono cercano, termina con pregunta, sin links, menciona algo específico"}`
      try {
        const raw = await callAI('Eres un experto en prospección B2B de hostelería española para ia.rest.', prompt, 800, 20000, true)
        return NextResponse.json({ ok: true, result: JSON.parse(cleanJSON(raw) || '{}') })
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: `No se pudo analizar el post: ${e.message}` })
      }
    }

    // ── Modo EMAIL: generar borrador de email comercial (NIM, sin búsqueda) ──
    if (body.modo === 'email') {
      const l = body.lead || {}
      const prompt = `Eres Alberto Suárez, fundador de ia.rest (comandas por voz para restaurantes en España).
Escribe un email comercial corto y personalizado para este prospecto.

Info del negocio:
- Nombre: ${l.nombre || 'vuestro restaurante'}
- Ciudad: ${l.ciudad || ''}
- Señal detectada: ${l.senial || 'apertura'}
- TPV actual: ${l.tpv || 'desconocido'}
- Descripción: ${l.descripcion || ''}
- Nombre contacto: ${l.contacto || 'equipo'}

Reglas:
- Asunto: corto, específico, sin spam
- Cuerpo: máx 150 palabras
- Mencionar algo específico del negocio
- Un único CTA: ver propuesta en el link
- Firma: Alberto · ia.rest · hola@iarest.es
- Tono: directo, sin florituras, B2B España

Formato de respuesta:
ASUNTO: [asunto]
---
[cuerpo del email]`
      try {
        const texto = await callAI('Eres Alberto, fundador de ia.rest. Escribes emails B2B en español de España.', prompt, 400, 20000, true)
        return NextResponse.json({ ok: true, email: (texto || '').trim() })
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: `No se pudo generar el email: ${e.message}` })
      }
    }

    // ── Modo URL (por defecto): analizar la web del negocio ──
    const { url } = body
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

    // Gemini con búsqueda web analiza y VERIFICA los datos (no adivina la ciudad)
    const prompt = `Eres un asistente de ventas B2B para ia.rest, SaaS de comandas por voz para restaurantes en España.
Analiza este negocio de hostelería español a partir de su web y de lo que encuentres en internet.
URL: ${url}
CONTENIDO DE LA WEB: ${contenido}
IMPORTANTE: usa la búsqueda web para CONFIRMAR la ciudad/ubicación real, el nombre, la web, el email y el teléfono. NO inventes la ciudad ni asumas "Madrid" por defecto: si el negocio está en Sevilla u otra ciudad, indícala correctamente (p. ej. "Plaza del Salvador" es Sevilla).
Responde SOLO con JSON válido, sin markdown:
{"nombre":"...","grupo":"...","ciudad":"...","tipo_cocina":"...","num_locales":1,"num_mesas_estimado":20,"tpv_actual":null,"tiene_delivery":false,"tiene_eventos":false,"tiene_carta_vinos":false,"email_contacto":null,"telefono":null,"nombre_contacto":null,"descripcion_negocio":"...","puntos_dolor":["...","...","..."],"cita_inventada":"...","precio_mrr_estimado":99,"headline_operativa":"...","modulos_recomendados":["voz","kds"],"objecion_principal":"...","respuesta_objecion":"..."}`

    let raw = ''
    try {
      raw = await callAISearch('Eres un experto en análisis de negocios de hostelería española para ia.rest. Verificas los datos con búsqueda web.', prompt, 1200, 45_000)
    } catch (e: any) {
      return NextResponse.json({ error: `Error IA: ${e.message}` }, { status: 500 })
    }

    if (!raw || !raw.trim()) {
      return NextResponse.json({ error: 'La IA no devolvió respuesta. Prueba con una URL de web directa del restaurante.' }, { status: 500 })
    }

    let analysis: any
    try {
      analysis = JSON.parse(cleanJSON(raw))
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
