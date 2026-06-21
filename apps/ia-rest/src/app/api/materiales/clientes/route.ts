export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('materiales_clientes')
    .select('id, nombre, empresa, nif, telefono, email, notas, activo, created_at')
    .eq('restaurante_id', rid).eq('activo', true).order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clientes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  const { data, error } = await supabase.from('materiales_clientes').insert({
    restaurante_id: rid, nombre: body.nombre.trim(),
    empresa: body.empresa ?? null, nif: body.nif ?? null,
    telefono: body.telefono ?? null, email: body.email ?? null, notas: body.notas ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cliente: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  for (const k of ['nombre', 'empresa', 'nif', 'telefono', 'email', 'notas'] as const)
    if (campos[k] !== undefined) updates[k] = campos[k]
  const { error } = await supabase.from('materiales_clientes').update(updates).eq('id', id).eq('restaurante_id', rid)
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
  const { error } = await supabase.from('materiales_clientes').update({ activo: false }).eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
