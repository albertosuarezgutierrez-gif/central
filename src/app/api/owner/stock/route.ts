export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET  → lista artículos con productos vinculados
// POST → crear artículo
// PUT  → editar artículo o registrar entrada de stock
// DELETE → eliminar artículo

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('v_stock_resumen')
    .select('*')
    .eq('local_id', rid)
    .order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articulos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const url = new URL(req.url)

  // POST ?action=entrada → registrar entrada de stock (compra)
  if (url.searchParams.get('action') === 'entrada') {
    const { articulo_id, cantidad, coste_unitario, notas } = await req.json()
    if (!articulo_id || !cantidad || cantidad <= 0)
      return NextResponse.json({ error: 'articulo_id y cantidad > 0 requeridos' }, { status: 400 })

    // Obtener stock actual
    const { data: art } = await supabase
      .from('stock_articulos').select('stock_actual').eq('id', articulo_id).eq('local_id', rid).single()
    if (!art) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 })

    const nuevo_stock = Number(art.stock_actual) + Number(cantidad)

    // Actualizar stock
    await supabase.from('stock_articulos').update({
      stock_actual: nuevo_stock,
      ...(coste_unitario ? { coste_unitario } : {}),
      alerta_activa: false,
      updated_at: new Date().toISOString(),
    }).eq('id', articulo_id).eq('local_id', rid)

    // Si viene con nuevo coste → recalcular alertas de margen
    if (coste_unitario) {
      await supabase.rpc('recalcular_alertas_margen', { p_articulo_id: articulo_id })
    }

    // Registrar movimiento
    await supabase.from('stock_movimientos').insert({
      local_id: rid,
      stock_articulo_id: articulo_id,
      tipo: 'entrada',
      cantidad: Number(cantidad),
      stock_resultante: nuevo_stock,
      camarero_id: session.id ?? null,
      notas: notas ?? null,
    })

    return NextResponse.json({ ok: true, stock_actual: nuevo_stock })
  }

  // POST normal → crear artículo nuevo
  const { nombre, unidad_compra, stock_inicial, stock_minimo, coste_unitario, notas, rendimientos } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const { data: art, error } = await supabase.from('stock_articulos').insert({
    local_id: rid,
    nombre: nombre.trim(),
    unidad_compra: unidad_compra ?? 'unidad',
    stock_actual: stock_inicial ?? 0,
    stock_minimo: stock_minimo ?? 0,
    coste_unitario: coste_unitario ?? null,
    notas: notas ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si viene con rendimientos, crearlos
  if (Array.isArray(rendimientos) && rendimientos.length > 0) {
    const rows = rendimientos
      .filter((r: { producto_id: string; consumo: number }) => r.producto_id && r.consumo > 0)
      .map((r: { producto_id: string; consumo: number }) => ({
        stock_articulo_id: art.id,
        producto_id: r.producto_id,
        local_id: rid,
        consumo_por_venta: r.consumo,
      }))
    if (rows.length > 0) await supabase.from('stock_rendimientos').insert(rows)
  }

  // Si hay stock inicial, registrar movimiento de entrada
  if (stock_inicial > 0) {
    await supabase.from('stock_movimientos').insert({
      local_id: rid,
      stock_articulo_id: art.id,
      tipo: 'entrada',
      cantidad: stock_inicial,
      stock_resultante: stock_inicial,
      camarero_id: session.id ?? null,
      notas: 'Stock inicial',
    })
  }

  return NextResponse.json({ articulo: art }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const url = new URL(req.url)

  // PUT ?action=ajuste → corrección manual de stock
  if (url.searchParams.get('action') === 'ajuste') {
    const { articulo_id, stock_nuevo, notas } = await req.json()
    if (!articulo_id || stock_nuevo == null)
      return NextResponse.json({ error: 'articulo_id y stock_nuevo requeridos' }, { status: 400 })

    const { data: art } = await supabase
      .from('stock_articulos').select('stock_actual, stock_minimo').eq('id', articulo_id).eq('local_id', rid).single()
    if (!art) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 })

    const diferencia = Number(stock_nuevo) - Number(art.stock_actual)
    const alerta = Number(stock_nuevo) < Number(art.stock_minimo)

    await supabase.from('stock_articulos').update({
      stock_actual: stock_nuevo,
      alerta_activa: alerta,
      updated_at: new Date().toISOString(),
    }).eq('id', articulo_id).eq('local_id', rid)

    await supabase.from('stock_movimientos').insert({
      local_id: rid,
      stock_articulo_id: articulo_id,
      tipo: 'ajuste',
      cantidad: diferencia,
      stock_resultante: stock_nuevo,
      camarero_id: session.id ?? null,
      notas: notas ?? 'Ajuste manual',
    })

    return NextResponse.json({ ok: true, stock_actual: stock_nuevo })
  }

  // PUT normal → editar artículo (nombre, mínimos, rendimientos)
  const { id, nombre, unidad_compra, stock_minimo, coste_unitario, notas, activo, rendimientos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  await supabase.from('stock_articulos').update({
    ...(nombre        ? { nombre: nombre.trim() } : {}),
    ...(unidad_compra ? { unidad_compra }         : {}),
    ...(stock_minimo != null ? { stock_minimo }   : {}),
    ...(coste_unitario != null ? { coste_unitario } : {}),
    ...(notas != null ? { notas }                 : {}),
    ...(activo != null ? { activo }               : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('local_id', rid)

  // Si cambió el coste → recalcular alertas de margen en escandallos afectados
  if (coste_unitario != null) {
    await supabase.rpc('recalcular_alertas_margen', { p_articulo_id: id })
  }

  // Sincronizar rendimientos si vienen
  if (Array.isArray(rendimientos)) {
    await supabase.from('stock_rendimientos').delete().eq('stock_articulo_id', id)
    const rows = rendimientos
      .filter((r: { producto_id: string; consumo: number }) => r.producto_id && r.consumo > 0)
      .map((r: { producto_id: string; consumo: number }) => ({
        stock_articulo_id: id,
        producto_id: r.producto_id,
        local_id: rid,
        consumo_por_venta: r.consumo,
      }))
    if (rows.length > 0) await supabase.from('stock_rendimientos').insert(rows)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  await supabase.from('stock_articulos').update({ activo: false }).eq('id', id).eq('local_id', rid)
  return NextResponse.json({ ok: true })
}
