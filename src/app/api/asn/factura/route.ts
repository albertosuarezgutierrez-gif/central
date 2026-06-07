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
 * POST /api/asn/factura
 * Body: { token, image: { data, mediaType } }
 * El proveedor sube su factura (foto/PDF) via el portal ASN.
 * La IA extrae número, importe, líneas → validación 3 vías vs recepción.
 * Sin auth — acceso público con token ASN.
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

    const supabase = serviceClient()

    // Validar token ASN → obtener pedido y recepción asociada
    const { data: pedido } = await supabase
      .from('pedidos_proveedor')
      .select(`
        id, cantidad, unidad_compra, proveedor_nombre, proveedor_email,
        local_id, asn_token_expires_at,
        stock_articulos(nombre, coste_unitario)
      `)
      .eq('asn_token', token)
      .single()

    if (!pedido) return NextResponse.json({ error: 'Token inválido' }, { status: 403, headers: corsHeaders })
    const expires = pedido.asn_token_expires_at ? new Date(pedido.asn_token_expires_at) : null
    if (expires && expires < new Date()) return NextResponse.json({ error: 'Token expirado' }, { status: 410, headers: corsHeaders })

    // Buscar orden de pago asociada (para 3-way match)
    const { data: orden } = await supabase
      .from('ordenes_pago_proveedor')
      .select('id, importe, estado, recepcion_id')
      .eq('local_id', pedido.local_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const normalizeType = (t: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' => {
      if (t === 'image/jpg') return 'image/jpeg'
      const valid = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
      return valid.includes(t as typeof valid[number]) ? t as typeof valid[number] : 'image/jpeg'
    }

    const articuloEsperado = (pedido.stock_articulos as unknown as { nombre: string } | null)?.nombre ?? ''

    // OCR de la factura del proveedor
    const prompt = `Eres un experto en lectura de facturas de proveedores españoles.
Analiza esta imagen de factura y extrae todos los datos relevantes.

Devuelve ÚNICAMENTE JSON con esta estructura:
{
  "numero_factura": "número de factura si aparece, null si no",
  "fecha_factura": "fecha en formato YYYY-MM-DD si aparece, null si no",
  "proveedor_nombre": "nombre del emisor de la factura, null si no",
  "cif_proveedor": "CIF/NIF del proveedor si aparece, null si no",
  "base_imponible": null o número en euros,
  "porcentaje_iva": null o número (ej: 10, 21),
  "cuota_iva": null o número en euros,
  "total_factura": null o número total en euros,
  "lineas": [
    {
      "descripcion": "descripción del artículo",
      "cantidad": null o número,
      "precio_unitario": null o número,
      "importe_linea": null o número
    }
  ],
  "confianza": "alta o media o baja"
}

Artículo principal esperado: "${articuloEsperado}".
SOLO JSON, sin texto adicional.`

    const raw = await callAIVision(
      prompt,
      [{ data: image.data, mediaType: normalizeType(image.mediaType ?? 'image/jpeg') }],
      'Extrae todos los datos de la factura del proveedor.'
    )

    const parsed = cleanJSON(raw) as {
      numero_factura?: string | null
      fecha_factura?: string | null
      proveedor_nombre?: string | null
      cif_proveedor?: string | null
      base_imponible?: number | null
      porcentaje_iva?: number | null
      cuota_iva?: number | null
      total_factura?: number | null
      lineas?: { descripcion: string; cantidad?: number | null; precio_unitario?: number | null; importe_linea?: number | null }[]
      confianza?: string
    } | null

    if (!parsed?.total_factura) {
      return NextResponse.json({
        ok: false,
        error: 'No se pudo leer el importe total de la factura. Intenta con una foto más nítida.',
      }, { status: 422, headers: corsHeaders })
    }

    // ── VALIDACIÓN 3 VÍAS ────────────────────────────────────────────────────
    const importeFactura   = parsed.total_factura
    const importeOrden     = orden ? Number(orden.importe) : null
    const tolerancia       = 0.01 // 1%

    let matchEstado: 'ok' | 'diferencia_leve' | 'diferencia_grave' | 'sin_referencia' = 'sin_referencia'
    let matchDetalle: Record<string, unknown> = {}

    if (importeOrden !== null) {
      const diff     = Math.abs(importeFactura - importeOrden)
      const diffPct  = importeOrden > 0 ? diff / importeOrden : 1

      if (diffPct <= tolerancia) {
        matchEstado = 'ok'
      } else if (diffPct <= 0.05) {
        matchEstado = 'diferencia_leve'  // ≤5%
      } else {
        matchEstado = 'diferencia_grave' // >5%
      }

      matchDetalle = {
        importe_factura:  importeFactura,
        importe_orden:    importeOrden,
        diferencia_eur:   (importeFactura - importeOrden).toFixed(2),
        diferencia_pct:   (diffPct * 100).toFixed(2) + '%',
        dentro_tolerancia: diffPct <= tolerancia,
      }
    }

    // Guardar factura en BD
    const { data: factura, error: fcErr } = await supabase
      .from('facturas_compra')
      .insert({
        local_id:  pedido.local_id,
        recepcion_id:    orden?.recepcion_id ?? null,
        orden_pago_id:   orden?.id ?? null,
        proveedor_nombre: parsed.proveedor_nombre ?? pedido.proveedor_nombre,
        numero_factura:  parsed.numero_factura ?? null,
        fecha_factura:   parsed.fecha_factura ?? null,
        importe_total:   importeFactura,
        importe_base:    parsed.base_imponible ?? null,
        importe_iva:     parsed.cuota_iva ?? null,
        tipo_iva:        parsed.porcentaje_iva ?? null,
        lineas:          parsed.lineas ?? [],
        match_estado:    matchEstado,
        match_detalle:   matchDetalle,
        subida_por:      'proveedor',
      })
      .select('id')
      .single()

    if (fcErr) {
      return NextResponse.json({ error: fcErr.message }, { status: 500, headers: corsHeaders })
    }

    // Si cuadra → auto-aprobar la orden de pago
    if (matchEstado === 'ok' && orden?.id && orden.estado === 'pendiente') {
      await supabase
        .from('ordenes_pago_proveedor')
        .update({
          estado: 'aprobado',
          factura_id: factura.id,
          match_estado: 'ok',
          aprobado_at: new Date().toISOString(),
          notas: `Auto-aprobado: factura ${parsed.numero_factura ?? ''} cuadra con la recepción`,
        })
        .eq('id', orden.id)
    } else if (orden?.id) {
      await supabase
        .from('ordenes_pago_proveedor')
        .update({ factura_id: factura.id, match_estado: matchEstado })
        .eq('id', orden.id)
    }

    return NextResponse.json({
      ok: true,
      factura_id:      factura.id,
      numero_factura:  parsed.numero_factura,
      importe_total:   importeFactura,
      match_estado:    matchEstado,
      match_detalle:   matchDetalle,
      auto_aprobado:   matchEstado === 'ok' && orden?.estado === 'pendiente',
      confianza:       parsed.confianza ?? 'media',
    }, { headers: corsHeaders })

  } catch (e) {
    console.error('[ASN Factura]', e)
    return NextResponse.json({ error: 'Error al procesar la factura' }, { status: 500, headers: corsHeaders })
  }
}
