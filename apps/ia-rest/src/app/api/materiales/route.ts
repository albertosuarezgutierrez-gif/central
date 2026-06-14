export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Catálogo de materiales (Bloque B). Gestión del dueño.
// GET    — lista catálogo activo (con stock)
// POST   — crea material
// PATCH  — edita material { id, ...campos }
// DELETE — desactiva material { id }  (soft delete: activo=false)

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('materiales')
    .select('id, nombre, descripcion, categoria, tipo, estado, cantidad_total, cantidad_disponible, stock_minimo, coste_reposicion, precio_compra, codigo, proveedor_nombre, proveedor_referencia, garantia_hasta, imagen_url, activo')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('categoria')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ materiales: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  if (!body.nombre || typeof body.nombre !== 'string') {
    return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  }
  const total = Number(body.cantidad_total) || 0
  const { data, error } = await supabase
    .from('materiales')
    .insert({
      restaurante_id: rid,
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      categoria: body.categoria ?? 'otro',
      tipo: body.tipo ?? 'activo',
      estado: body.estado ?? 'operativo',
      cantidad_total: total,
      cantidad_disponible: total,
      stock_minimo: body.stock_minimo != null ? Number(body.stock_minimo) : null,
      coste_reposicion: Number(body.coste_reposicion) || 0,
      precio_compra: body.precio_compra != null ? Number(body.precio_compra) : null,
      codigo: body.codigo ?? null,
      proveedor_nombre: body.proveedor_nombre ?? null,
      proveedor_referencia: body.proveedor_referencia ?? null,
      garantia_hasta: body.garantia_hasta ?? null,
      imagen_url: body.imagen_url ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ material: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['nombre', 'descripcion', 'categoria', 'tipo', 'estado', 'coste_reposicion', 'precio_compra', 'codigo', 'proveedor_nombre', 'proveedor_referencia', 'garantia_hasta', 'imagen_url'] as const) {
    if (campos[k] !== undefined) updates[k] = campos[k]
  }
  if (campos.stock_minimo !== undefined) updates.stock_minimo = campos.stock_minimo != null ? Number(campos.stock_minimo) : null
  // Si cambia el total, ajustar el disponible por el delta para no perder lo que está fuera.
  if (campos.cantidad_total !== undefined) {
    const nuevoTotal = Number(campos.cantidad_total) || 0
    const { data: actual } = await supabase
      .from('materiales')
      .select('cantidad_total, cantidad_disponible')
      .eq('id', id).eq('restaurante_id', rid).single()
    if (actual) {
      const delta = nuevoTotal - (actual.cantidad_total ?? 0)
      updates.cantidad_total = nuevoTotal
      updates.cantidad_disponible = Math.max(0, (actual.cantidad_disponible ?? 0) + delta)
    }
  }

  const { error } = await supabase
    .from('materiales')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('materiales')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
