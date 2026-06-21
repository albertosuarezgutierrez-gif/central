export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 60

const PROMPT_BOTELLA = `Eres un sommelier experto con amplio conocimiento de vinos españoles y europeos.
Analiza la imagen de esta botella de vino. Extrae toda la información visible en la etiqueta frontal y contraetiqueta.

Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional:
{
  "nombre": "nombre comercial del vino tal como aparece en la etiqueta",
  "bodega": "nombre de la bodega o productor",
  "tipo": "tinto|blanco|rosado|espumoso|cava|champagne|generoso|vermut",
  "denominacion_origen": "D.O., D.O.Ca., IGP o denominación que aparezca",
  "varietal": "uva o uvas principales (ej: Tempranillo, Albariño, Garnacha)",
  "anada": "año de vendimia si aparece, null si no",
  "graduacion": "grados de alcohol si aparece (ej: 13.5%), null si no",
  "volumen": "formato botella si aparece (ej: 75cl, 37.5cl), null si no",
  "confianza": 0.85
}

- Si la contraetiqueta está visible, extrae también varietal y D.O. de ahí
- Si la etiqueta está parcialmente ilegible, pon null en el campo y baja la confianza
- DOs españolas comunes: Rioja, Ribera del Duero, Rías Baixas, Priorat, Rueda, Jerez, Cava, Penedès, Toro, Jumilla
- Responde SOLO el JSON, sin explicaciones`

const PROMPT_ALBARAN = `Eres un asistente experto en gestión de bodegas para restaurantes españoles.
Analiza este albarán o documento de entrega de proveedor de vinos.

Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional:
{
  "proveedor": "nombre del proveedor o null",
  "fecha": "DD/MM/YYYY o null",
  "referencia": "número albarán o null",
  "vinos": [
    {
      "nombre": "nombre exacto del vino",
      "bodega": "bodega o null",
      "tipo": "tinto|blanco|rosado|espumoso|cava|otro",
      "anada": "año o null",
      "formato": "75cl|37.5cl|150cl|otro o null",
      "cantidad": 12,
      "precio_unitario": 8.50
    }
  ],
  "total_eur": 102.00
}

- Incluye TODOS los vinos visibles
- Si hay cajas, convierte a botellas (caja estándar = 6 botellas)
- NO incluyas totales como vinos
- Responde SOLO el JSON`

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const rid = getRestauranteId(req)
  if (!session || !rid) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { imagen, mediaType = 'image/jpeg', modo } = await req.json()
  if (!imagen || typeof imagen !== 'string')
    return NextResponse.json({ error: 'imagen requerida (base64)' }, { status: 400 })
  if (!['botella', 'albaran'].includes(modo))
    return NextResponse.json({ error: 'modo debe ser botella o albaran' }, { status: 400 })
  if (imagen.length > 5_000_000)
    return NextResponse.json({ error: 'Imagen demasiado grande. Máx 4MB.' }, { status: 400 })

  const mt = mediaType === 'image/jpg' ? 'image/jpeg'
    : ['image/jpeg','image/png','image/gif','image/webp'].includes(mediaType) ? mediaType : 'image/jpeg'

  try {
    const raw = await callAIVision(
      modo === 'botella' ? PROMPT_BOTELLA : PROMPT_ALBARAN,
      [{ data: imagen, mediaType: mt }],
      modo === 'botella' ? 'Extrae los datos del vino de esta etiqueta.' : 'Extrae todos los vinos de este albarán.',
      1200
    )
    const parsed = JSON.parse(cleanJSON(raw))

    if (modo === 'botella') {
      const TIPOS = ['tinto','blanco','rosado','espumoso','cava','champagne','generoso','vermut']
      return NextResponse.json({
        ok: true, modo: 'botella',
        nombre:             parsed.nombre ?? null,
        bodega:             parsed.bodega ?? null,
        tipo:               TIPOS.includes(parsed.tipo) ? parsed.tipo : null,
        denominacion_origen: parsed.denominacion_origen ?? null,
        varietal:           parsed.varietal ?? null,
        anada:              parsed.anada ?? null,
        graduacion:         parsed.graduacion ?? null,
        volumen:            parsed.volumen ?? null,
        confianza:          Math.min(1, Math.max(0, Number(parsed.confianza) || 0)),
      })
    }

    // modo albaran — hacer match con carta existente
    const supabase = createServerClient()
    const { data: carta } = await supabase
      .from('productos')
      .select('id, nombre, metadata, precio')
      .eq('local_id', rid)
      .or("familia.like.vino%,metadata->>tipo.eq.vino")

    const TIPOS_ALB = ['tinto','blanco','rosado','espumoso','cava','otro']
    const vinos = (parsed.vinos ?? []).map((v: Record<string,unknown>) => {
      const nombreNorm = String(v.nombre ?? '').toLowerCase()
      const match = (carta ?? []).find(p => {
        const pn = p.nombre.toLowerCase()
        return pn.includes(nombreNorm.slice(0,8)) || nombreNorm.includes(pn.slice(0,8))
      })
      return {
        nombre:         v.nombre ?? null,
        bodega:         v.bodega ?? null,
        tipo:           TIPOS_ALB.includes(v.tipo as string) ? v.tipo : 'otro',
        anada:          v.anada ?? null,
        formato:        v.formato ?? null,
        cantidad:       Math.max(1, Number(v.cantidad) || 1),
        precio_unitario: v.precio_unitario ? Number(v.precio_unitario) : null,
        // match con carta
        producto_id:           match?.id ?? null,
        producto_nombre_actual: match?.nombre ?? null,
        en_carta:              !!match,
      }
    })

    return NextResponse.json({
      ok: true, modo: 'albaran',
      proveedor:  parsed.proveedor ?? null,
      fecha:      parsed.fecha ?? null,
      referencia: parsed.referencia ?? null,
      total_eur:  parsed.total_eur ?? null,
      vinos,
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[vinos/reconocer] Error:', msg)
    return NextResponse.json({ error: 'Error al reconocer. Inténtalo de nuevo.' }, { status: 500 })
  }
}
