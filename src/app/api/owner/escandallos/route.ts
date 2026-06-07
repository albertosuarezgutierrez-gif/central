export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET  → lista escandallos con coste calculado
// POST → crear escandallo
// PUT  → editar escandallo e ingredientes
// DELETE → desactivar escandallo

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const url = new URL(req.url)
  const productoId = url.searchParams.get('producto_id')

  let query = supabase
    .from('v_escandallos')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')

  if (productoId) query = query.eq('producto_id', productoId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ escandallos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { nombre, producto_id, rendimiento, notas, ingredientes, margen_minimo } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const { data: esc, error } = await supabase
    .from('escandallos')
    .insert({
      local_id: rid,
      nombre: nombre.trim(),
      producto_id: producto_id ?? null,
      rendimiento: rendimiento ?? 1,
      notas: notas ?? null,
      margen_minimo: margen_minimo ?? null,
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(ingredientes) && ingredientes.length > 0) {
    const rows = ingredientes
      .filter((i: { stock_articulo_id: string; cantidad: number }) => i.stock_articulo_id && i.cantidad > 0)
      .map((i: { stock_articulo_id: string; cantidad: number; notas?: string }) => ({
        escandallo_id: esc.id,
        stock_articulo_id: i.stock_articulo_id,
        local_id: rid,
        cantidad: i.cantidad,
        notas: i.notas ?? null,
      }))
    if (rows.length > 0) await supabase.from('escandallo_ingredientes').insert(rows)
  }

  return NextResponse.json({ escandallo: esc }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { id, nombre, producto_id, rendimiento, notas, ingredientes, margen_minimo } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  await supabase.from('escandallos').update({
    ...(nombre ? { nombre: nombre.trim() } : {}),
    ...(producto_id !== undefined ? { producto_id } : {}),
    ...(rendimiento != null ? { rendimiento } : {}),
    ...(notas !== undefined ? { notas } : {}),
    ...(margen_minimo !== undefined ? { margen_minimo } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('local_id', rid)

  // Reemplazar ingredientes
  if (Array.isArray(ingredientes)) {
    await supabase.from('escandallo_ingredientes').delete().eq('escandallo_id', id)
    const rows = ingredientes
      .filter((i: { stock_articulo_id: string; cantidad: number }) => i.stock_articulo_id && i.cantidad > 0)
      .map((i: { stock_articulo_id: string; cantidad: number; notas?: string }) => ({
        escandallo_id: id,
        stock_articulo_id: i.stock_articulo_id,
        local_id: rid,
        cantidad: i.cantidad,
        notas: i.notas ?? null,
      }))
    if (rows.length > 0) await supabase.from('escandallo_ingredientes').insert(rows)
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
  await supabase.from('escandallos').update({ activo: false }).eq('id', id).eq('local_id', rid)
  return NextResponse.json({ ok: true })
}
