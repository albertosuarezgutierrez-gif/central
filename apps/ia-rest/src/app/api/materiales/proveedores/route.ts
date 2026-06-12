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
    .from('materiales_proveedores')
    .select('id, nombre, contacto, telefono, email, nif, plazo_entrega_dias, notas, activo, created_at')
    .eq('restaurante_id', rid).eq('activo', true).order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ proveedores: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  const { data, error } = await supabase.from('materiales_proveedores').insert({
    restaurante_id: rid, nombre: body.nombre.trim(),
    contacto: body.contacto ?? null, telefono: body.telefono ?? null,
    email: body.email ?? null, nif: body.nif ?? null,
    plazo_entrega_dias: body.plazo_entrega_dias != null ? Number(body.plazo_entrega_dias) : null,
    notas: body.notas ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ proveedor: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  for (const k of ['nombre', 'contacto', 'telefono', 'email', 'nif', 'plazo_entrega_dias', 'notas'] as const)
    if (campos[k] !== undefined) updates[k] = campos[k]
  const { error } = await supabase.from('materiales_proveedores').update(updates).eq('id', id).eq('restaurante_id', rid)
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
  const { error } = await supabase.from('materiales_proveedores').update({ activo: false }).eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
