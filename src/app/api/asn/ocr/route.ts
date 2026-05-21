export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/asn/ocr
 * Body: { token: string, image: { data: string (base64), mediaType: string } }
 * Sin auth — accesible por el proveedor desde su portal ASN.
 * Valida token, analiza el albarán con IA y devuelve artículos extraídos.
 */
export async function OPTIONS() {
  return new Response('ok', { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const { token, image } = await req.json()
    if (!token || !image?.data) {
      return NextResponse.json({ error: 'token e imagen requeridos' }, { status: 400, headers: corsHeaders })
    }

    // Validar token ASN
    const supabase = serviceClient()
    const { data: pedido } = await supabase
      .from('pedidos_proveedor')
      .select('id, cantidad, unidad_compra, proveedor_nombre, asn_token_expires_at, stock_articulos(nombre)')
      .eq('asn_token', token)
      .single()

    if (!pedido) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403, headers: corsHeaders })
    }
    const expires = pedido.asn_token_expires_at ? new Date(pedido.asn_token_expires_at) : null
    if (expires && expires < new Date()) {
      return NextResponse.json({ error: 'Token expirado' }, { status: 410, headers: corsHeaders })
    }

    const normalizeType = (t: string): string => {
      if (t === 'image/jpg') return 'image/jpeg'
      const VALID = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      return VALID.includes(t) ? t : 'image/jpeg'
    }

    const articuloEsperado = (pedido.stock_articulos as unknown as { nombre: string } | null)?.nombre ?? ''

    const prompt = `Eres un experto en lectura de albaranes de hostelería española.
Analiza esta imagen de albarán/factura y extrae TODOS los artículos.
El pedido principal esperado es: "${articuloEsperado}" (${pedido.cantidad} ${pedido.unidad_compra}).

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "proveedor": "nombre del proveedor si aparece, null si no",
  "numero_albaran": "número de albarán si aparece, null si no",
  "fecha": "fecha del albarán en formato DD/MM/YYYY si aparece, null si no",
  "articulos": [
    {
      "nombre": "nombre exacto del artículo",
      "cantidad": 3.5,
      "unidad": "kg|litro|unidad|caja|botella|lata|bolsa",
      "precio_unitario": 12.50,
      "lote": "número de lote si aparece, null si no",
      "fecha_caducidad": "fecha en formato YYYY-MM-DD si aparece, null si no"
    }
  ]
}

Si no puedes leer algún campo, usa null. SOLO JSON, sin texto adicional.`

    const raw = await callAIVision(
      prompt,
      [{ data: image.data, mediaType: normalizeType(image.mediaType ?? 'image/jpeg') }],
      'Analiza el albarán de la imagen y extrae los artículos con todos sus datos.'
    )

    const parsed = cleanJSON(raw) as {
      proveedor?: string | null
      numero_albaran?: string | null
      fecha?: string | null
      articulos?: {
        nombre: string
        cantidad: number
        unidad: string
        precio_unitario?: number | null
        lote?: string | null
        fecha_caducidad?: string | null
      }[]
    } | null

    if (!parsed?.articulos?.length) {
      return NextResponse.json({
        ok: false,
        error: 'No se pudieron extraer artículos de la imagen. Intenta con una foto más nítida o rellena manualmente.',
        headers: corsHeaders,
      }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      proveedor:      parsed.proveedor ?? null,
      numero_albaran: parsed.numero_albaran ?? null,
      fecha:          parsed.fecha ?? null,
      articulos:      parsed.articulos,
      confianza:      parsed.articulos.length > 0 ? 'alta' : 'baja',
    }, { headers: corsHeaders })

  } catch (e) {
    console.error('[ASN OCR]', e)
    return NextResponse.json(
      { error: 'Error al analizar la imagen' },
      { status: 500, headers: corsHeaders }
    )
  }
}
