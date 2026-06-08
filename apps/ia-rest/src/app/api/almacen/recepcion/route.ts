export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const { data, error } = await supabase
    .from('recepciones_mercancia')
    .select('*')
    .eq('local_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recepciones: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const body = await req.json()
  const {
    tipo_entrada = 'spot',         // 'spot' | 'pedido'
    modo_cantidad = 'unidades',    // 'unidades' | 'peso_kg'
    producto_id,
    nombre_libre,
    cantidad_kg,
    num_piezas,
    precio_compra_kg,
    precio_venta_kg,
    precio_compra_unit,
    precio_venta_unit,
    proveedor_id,
    proveedor_libre,
    pedido_proveedor_id,
    lote,
    fecha_caducidad,
    notas,
  } = body

  // Insertar recepción
  const { data: recepcion, error: recErr } = await supabase
    .from('recepciones_mercancia')
    .insert({
      local_id: restauranteId,
      tipo_entrada,
      modo_cantidad,
      producto_id: producto_id || null,
      nombre_libre: nombre_libre || null,
      cantidad_kg: cantidad_kg || null,
      num_piezas: num_piezas || null,
      precio_compra_kg: precio_compra_kg || null,
      precio_venta_kg: precio_venta_kg || null,
      proveedor_id: proveedor_id || null,
      proveedor_libre: proveedor_libre || null,
      pedido_proveedor_id: pedido_proveedor_id || null,
      lote: lote || null,
      fecha_caducidad: fecha_caducidad || null,
      notas: notas || null,
      recibido_por: session.id,
      fecha_recepcion: new Date().toISOString(),
      estado: 'recibida',
    })
    .select()
    .single()

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  // Si es por peso y hay producto_id → registrar entrada en stock
  if (modo_cantidad === 'peso_kg' && cantidad_kg && producto_id) {
    await supabase.from('stock_movimientos').insert({
      local_id: restauranteId,
      producto_id,
      tipo: 'entrada_recepcion',
      cantidad: cantidad_kg,  // positivo = entrada
      unidad: 'kg',
      referencia_id: recepcion.id,
      referencia_tipo: 'recepcion',
      notas: `Recepción ${tipo_entrada}${proveedor_libre ? ' · ' + proveedor_libre : ''}`,
    })
  }

  // Si hay precio_venta_kg → actualizar producto
  if (producto_id && precio_venta_kg) {
    await supabase
      .from('productos')
      .update({
        venta_por_peso: true,
        precio_por_kg: precio_venta_kg,
      })
      .eq('id', producto_id)
      .eq('local_id', restauranteId)
  }

  // Si hay precio_compra_kg → actualizar escandallos asociados
  if (producto_id && precio_compra_kg) {
    await supabase
      .from('escandallos')
      .update({ coste_kg: precio_compra_kg })
      .eq('producto_materia_prima_id', producto_id)
      .eq('local_id', restauranteId)
  }

  // ─── IMPUTAR COSTE AL EVENTO si el pedido tiene evento_id ───────────────
  if (pedido_proveedor_id) {
    const { data: pedido } = await supabase
      .from('pedidos_proveedor')
      .select('evento_id, proveedor_nombre')
      .eq('id', pedido_proveedor_id)
      .single()

    if (pedido?.evento_id) {
      // Calcular importe total de esta recepción
      let importe = 0
      if (modo_cantidad === 'peso_kg' && cantidad_kg && precio_compra_kg) {
        importe = parseFloat(cantidad_kg) * parseFloat(precio_compra_kg)
      } else if (num_piezas && precio_compra_unit) {
        importe = parseFloat(num_piezas) * parseFloat(precio_compra_unit)
      }

      if (importe > 0) {
        const concepto = `${nombre_libre || 'Ingrediente'} — ${pedido.proveedor_nombre ?? 'Proveedor'}`
        await supabase.from('evento_costes').insert({
          evento_id: pedido.evento_id,
          local_id: restauranteId,
          tipo: 'ingredientes',
          concepto,
          importe: Math.round(importe * 100) / 100,
          recepcion_id: recepcion.id,
          es_estimado: false,
        })
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ ok: true, recepcion })
}
