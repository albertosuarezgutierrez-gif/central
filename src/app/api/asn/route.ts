export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

/**
 * GET  /api/asn?token=xxx  → valida token y devuelve datos del pedido
 * POST /api/asn             → proveedor confirma envío con sus datos (ASN)
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function OPTIONS() {
  return new Response('ok', { headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 }, )

  const supabase = serviceClient()
  const { data: pedido } = await supabase
    .from('pedidos_proveedor')
    .select(`
      id, cantidad, unidad_compra, estado, asn_token_expires_at, asn_subido_at,
      proveedor_nombre, proveedor_email,
      stock_articulos(nombre, unidad_compra),
      restaurantes(nombre)
    `)
    .eq('asn_token', token)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Link inválido o expirado' }, { status: 404 })

  const expires = pedido.asn_token_expires_at ? new Date(pedido.asn_token_expires_at) : null
  if (expires && expires < new Date()) {
    return NextResponse.json({ error: 'Este link ha expirado (válido 72h desde el envío del pedido)' }, { status: 410 })
  }

  return NextResponse.json({
    ok: true,
    pedido: {
      id: pedido.id,
      articulo: (pedido.stock_articulos as unknown as { nombre: string } | null)?.nombre ?? 'Artículo',
      cantidad: pedido.cantidad,
      unidad: pedido.unidad_compra,
      restaurante: (pedido.restaurantes as unknown as { nombre: string } | null)?.nombre ?? '',
      proveedor: pedido.proveedor_nombre ?? '',
      ya_subido: !!pedido.asn_subido_at,
    },
  }, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, items, fecha_entrega_estimada, notas, albaran_numero } = body

  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })

  const supabase = serviceClient()

  // Verificar token
  const { data: pedido } = await supabase
    .from('pedidos_proveedor')
    .select('id, local_id, asn_token_expires_at, stock_articulo_id, cantidad, unidad_compra, proveedor_id, proveedor_nombre')
    .eq('asn_token', token)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Link inválido' }, { status: 404 })

  const expires = pedido.asn_token_expires_at ? new Date(pedido.asn_token_expires_at) : null
  if (expires && expires < new Date()) {
    return NextResponse.json({ error: 'Link expirado' }, { status: 410 })
  }

  // Guardar ASN en el pedido
  const asnItems = items ?? [{ articulo: 'artículo del pedido', cantidad: pedido.cantidad, unidad: pedido.unidad_compra }]

  const { error: updErr } = await supabase
    .from('pedidos_proveedor')
    .update({
      asn_subido_at: new Date().toISOString(),
      asn_items: asnItems,
    })
    .eq('id', pedido.id)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Crear pre-recepción borrador en el restaurante
  const { data: rec } = await supabase
    .from('recepciones_mercancia')
    .insert({
      local_id: pedido.local_id,
      proveedor_id: pedido.proveedor_id,
      pedido_proveedor_id: pedido.id,
      albaran_numero: albaran_numero ?? null,
      notas: notas ? `ASN del proveedor: ${notas}` : 'Pre-cargado por proveedor vía ASN',
      estado: 'borrador',
      fecha_recepcion: fecha_entrega_estimada ?? new Date().toISOString(),
    })
    .select().single()

  if (rec) {
    // Crear items de la pre-recepción
    const rows = asnItems.map((item: { articulo: string; cantidad: number; unidad: string; precio?: number; lote?: string; caducidad?: string }) => ({
      recepcion_id: rec.id,
      local_id: pedido.local_id,
      stock_articulo_id: asnItems.length === 1 ? pedido.stock_articulo_id : null,
      nombre_articulo: item.articulo,
      cantidad_pedida: pedido.cantidad,
      cantidad_recibida: item.cantidad ?? pedido.cantidad,
      unidad: item.unidad ?? pedido.unidad_compra,
      precio_facturado: item.precio ?? null,
      numero_lote: item.lote ?? null,
      fecha_caducidad: item.caducidad ?? null,
      estado: 'ok',
    }))
    await supabase.from('recepcion_items').insert(rows)
  }

  // Notificar al restaurante vía ia_training_log (push en monitor-health lo enviará)
  await supabase.from('ia_training_log').insert({
    local_id: pedido.local_id,
    capa: 'sistema',
    input: `ASN recibido de ${pedido.proveedor_nombre}`,
    output: JSON.stringify({ pedido_id: pedido.id, items: asnItems.length }),
    tipo: 'asn_recibido',
    tokens_usados: 0,
  })

  return NextResponse.json({
    ok: true,
    mensaje: '¡Gracias! Hemos recibido tu notificación. El restaurante ya tiene los datos preparados para cuando llegue el pedido.',
    recepcion_id: rec?.id ?? null,
  }, { headers: corsHeaders })
}
