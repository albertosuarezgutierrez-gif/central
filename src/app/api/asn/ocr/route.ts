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
 * Body: { token, image: { data, mediaType }, modo: "albaran" | "etiqueta" }
 * modo=albaran: extrae artículos de un albarán completo
 * modo=etiqueta: extrae datos de UNA etiqueta (lote, caducidad, EAN, peso)
 */
export async function OPTIONS() {
  return new Response('ok', { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, image, modo = 'albaran' } = body
    if (!token || !image?.data) {
      return NextResponse.json({ error: 'token e imagen requeridos' }, { status: 400, headers: corsHeaders })
    }

    const supabase = serviceClient()
    const { data: pedido } = await supabase
      .from('pedidos_proveedor')
      .select('id, cantidad, unidad_compra, proveedor_nombre, asn_token_expires_at, stock_articulos(nombre)')
      .eq('asn_token', token)
      .single()

    if (!pedido) return NextResponse.json({ error: 'Token inválido' }, { status: 403, headers: corsHeaders })
    const expires = pedido.asn_token_expires_at ? new Date(pedido.asn_token_expires_at) : null
    if (expires && expires < new Date()) return NextResponse.json({ error: 'Token expirado' }, { status: 410, headers: corsHeaders })

    const normalizeType = (t: string) => {
      if (t === 'image/jpg') return 'image/jpeg'
      return ['image/jpeg','image/png','image/gif','image/webp'].includes(t) ? t : 'image/jpeg'
    }

    const mediaType = normalizeType(image.mediaType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // ── MODO ETIQUETA ────────────────────────────────────────────────────────
    if (modo === 'etiqueta') {
      const prompt = `Eres un experto en lectura de etiquetas de productos alimentarios españoles.
Analiza esta imagen de una etiqueta de producto o caja y extrae los datos visibles.

Devuelve ÚNICAMENTE JSON válido con esta estructura:
{
  "nombre_producto": "nombre del producto si aparece, null si no",
  "ean": "código EAN-13 de 13 dígitos si es visible, null si no",
  "lote": "número de lote (busca Lote: L: LOT: seguido de alfanuméricos), null si no",
  "fecha_caducidad": "fecha de caducidad YYYY-MM-DD (busca Consumir antes de, CAD, Caducidad, Best before, BBD, fechas DD/MM/YY o MM/YYYY), null si no",
  "fecha_consumo_preferente": "fecha consumo preferente YYYY-MM-DD (Consumir preferentemente antes de, CPD), null si no",
  "peso_neto": "peso o volumen neto como string p.ej. 500 g o 1 l, null si no",
  "temperatura": "temperatura de conservacion como string p.ej. 2-4C, null si no",
  "confianza": "alta o media o baja segun claridad de la imagen"
}

SOLO JSON, sin texto adicional.`

      const raw = await callAIVision(
        prompt,
        [{ data: image.data, mediaType }],
        'Lee la etiqueta del producto y extrae lote, caducidad y EAN.'
      )

      const parsed = cleanJSON(raw) as {
        nombre_producto?: string | null
        ean?: string | null
        lote?: string | null
        fecha_caducidad?: string | null
        fecha_consumo_preferente?: string | null
        peso_neto?: string | null
        temperatura?: string | null
        confianza?: string
      } | null

      if (!parsed) {
        return NextResponse.json({ ok: false, error: 'No se pudieron extraer datos de la etiqueta.' }, { status: 422, headers: corsHeaders })
      }

      return NextResponse.json({
        ok: true,
        modo: 'etiqueta',
        nombre_producto: parsed.nombre_producto ?? null,
        ean:             parsed.ean ?? null,
        lote:            parsed.lote ?? null,
        fecha_caducidad: parsed.fecha_caducidad ?? parsed.fecha_consumo_preferente ?? null,
        peso_neto:       parsed.peso_neto ?? null,
        temperatura:     parsed.temperatura ?? null,
        confianza:       parsed.confianza ?? 'media',
      }, { headers: corsHeaders })
    }

    // ── MODO ALBARÁN (default) ───────────────────────────────────────────────
    const articuloEsperado = (pedido.stock_articulos as unknown as { nombre: string } | null)?.nombre ?? ''

    const prompt = `Eres un experto en lectura de albaranes de hosteleria espanola.
Analiza esta imagen de albaran o factura y extrae TODOS los articulos.
El pedido principal esperado es: "${articuloEsperado}" (${pedido.cantidad} ${pedido.unidad_compra}).

Devuelve UNICAMENTE un JSON valido con esta estructura:
{
  "proveedor": "nombre del proveedor si aparece, null si no",
  "numero_albaran": "numero de albaran si aparece, null si no",
  "fecha": "fecha del albaran en formato DD/MM/YYYY si aparece, null si no",
  "articulos": [
    {
      "nombre": "nombre exacto del articulo",
      "cantidad": 3.5,
      "unidad": "kg o litro o unidad o caja o botella o lata o bolsa",
      "precio_unitario": 12.50,
      "lote": "numero de lote si aparece, null si no",
      "fecha_caducidad": "fecha en formato YYYY-MM-DD si aparece, null si no"
    }
  ]
}

SOLO JSON, sin texto adicional.`

    const raw = await callAIVision(
      prompt,
      [{ data: image.data, mediaType }],
      'Analiza el albaran y extrae los articulos con todos sus datos.'
    )

    const parsed = cleanJSON(raw) as {
      proveedor?: string | null
      numero_albaran?: string | null
      fecha?: string | null
      articulos?: {
        nombre: string; cantidad: number; unidad: string
        precio_unitario?: number | null; lote?: string | null; fecha_caducidad?: string | null
      }[]
    } | null

    if (!parsed?.articulos?.length) {
      return NextResponse.json({
        ok: false,
        error: 'No se pudieron extraer articulos. Intenta con una foto mas nitida o rellena manualmente.',
      }, { status: 422, headers: corsHeaders })
    }

    return NextResponse.json({
      ok: true,
      proveedor:      parsed.proveedor ?? null,
      numero_albaran: parsed.numero_albaran ?? null,
      fecha:          parsed.fecha ?? null,
      articulos:      parsed.articulos,
      confianza:      'alta',
    }, { headers: corsHeaders })

  } catch (e) {
    console.error('[ASN OCR]', e)
    return NextResponse.json({ error: 'Error al analizar la imagen' }, { status: 500, headers: corsHeaders })
  }
}
