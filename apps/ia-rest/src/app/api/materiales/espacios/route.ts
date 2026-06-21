export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET    — lista espacios activos
// POST   — crea espacio
// PATCH  — edita espacio { id, ...campos }
// DELETE — soft-delete { id }

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('materiales_espacios')
    .select('id, nombre, descripcion, tipo, ref_tipo, ref_id, codigo_qr, activo, created_at')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacios: data ?? [] })
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

  const { data, error } = await supabase
    .from('materiales_espacios')
    .insert({
      restaurante_id: rid,
      nombre: body.nombre.trim(),
      descripcion: body.descripcion ?? null,
      tipo: body.tipo ?? 'almacen',
      ref_tipo: body.ref_tipo ?? null,
      ref_id: body.ref_id ?? null,
      codigo_qr: body.codigo_qr ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacio: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const k of ['nombre', 'descripcion', 'tipo', 'ref_tipo', 'ref_id', 'codigo_qr'] as const) {
    if (campos[k] !== undefined) updates[k] = campos[k]
  }

  const { error } = await supabase
    .from('materiales_espacios')
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
    .from('materiales_espacios')
    .update({ activo: false })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
