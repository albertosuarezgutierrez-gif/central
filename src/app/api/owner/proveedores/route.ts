export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('proveedores')
    .select('*, stock_articulos(id, nombre)')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ proveedores: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre, email, telefono, web, contacto_nombre, categoria, notas, dias_reparto, hora_corte, pedido_minimo_eur } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  const { data, error } = await supabase.from('proveedores').insert({
    restaurante_id: rid, nombre: nombre.trim(),
    email: email?.trim() || null, telefono: telefono?.trim() || null,
    web: web?.trim() || null, contacto_nombre: contacto_nombre?.trim() || null,
    categoria: categoria?.trim() || null, notas: notas?.trim() || null,
    dias_reparto: dias_reparto ?? null,
    hora_corte: hora_corte || null,
    pedido_minimo_eur: pedido_minimo_eur ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ proveedor: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, nombre, email, telefono, web, contacto_nombre, categoria, notas, activo, dias_reparto, hora_corte, pedido_minimo_eur } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  await supabase.from('proveedores').update({
    ...(nombre ? { nombre: nombre.trim() } : {}),
    ...(email !== undefined ? { email: email?.trim() || null } : {}),
    ...(telefono !== undefined ? { telefono: telefono?.trim() || null } : {}),
    ...(web !== undefined ? { web: web?.trim() || null } : {}),
    ...(contacto_nombre !== undefined ? { contacto_nombre: contacto_nombre?.trim() || null } : {}),
    ...(categoria !== undefined ? { categoria: categoria?.trim() || null } : {}),
    ...(notas !== undefined ? { notas: notas?.trim() || null } : {}),
    ...(activo !== undefined ? { activo } : {}),
    ...(dias_reparto !== undefined ? { dias_reparto } : {}),
    ...(hora_corte !== undefined ? { hora_corte: hora_corte || null } : {}),
    ...(pedido_minimo_eur !== undefined ? { pedido_minimo_eur: pedido_minimo_eur ?? null } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('restaurante_id', rid)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  await supabase.from('proveedores').update({ activo: false }).eq('id', id).eq('restaurante_id', rid)
  return NextResponse.json({ ok: true })
}
