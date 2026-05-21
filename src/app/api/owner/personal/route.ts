export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('personal')
    .select('id, nombre, pin, rol, activo, seccion_id, created_at, puede_escanear, puede_comandar, modulos_gestion')
    .eq('restaurante_id', rid)
    .neq('rol', 'owner').neq('rol', 'super_admin')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camareros: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre, pin, rol, seccion_id } = await req.json()
  if (!nombre || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'Nombre y PIN de 4 dígitos requeridos' }, { status: 400 })
  const { data: existing } = await supabase
    .from('personal').select('id').eq('pin', pin).eq('restaurante_id', rid).single()
  if (existing) return NextResponse.json({ error: 'PIN ya en uso' }, { status: 409 })
  const { data, error } = await supabase.from('personal')
    .insert({ nombre, pin, rol: rol || 'camarero', activo: true, restaurante_id: rid, seccion_id: seccion_id || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camarero: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, nombre, pin, rol, activo, seccion_id, puede_escanear, puede_comandar, modulos_gestion } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  if (pin) {
    if (!/^\d{4}$/.test(pin))
      return NextResponse.json({ error: 'PIN debe tener 4 dígitos' }, { status: 400 })
    const { data: existing } = await supabase
      .from('personal').select('id').eq('pin', pin).eq('restaurante_id', rid).neq('id', id).single()
    if (existing) return NextResponse.json({ error: 'PIN ya en uso' }, { status: 409 })
  }
  const updates: Record<string, unknown> = {}
  if (nombre !== undefined) updates.nombre = nombre
  if (pin !== undefined) updates.pin = pin
  if (rol !== undefined) updates.rol = rol
  if (activo !== undefined) updates.activo = activo
  if (seccion_id !== undefined) updates.seccion_id = seccion_id
  if (puede_escanear !== undefined) updates.puede_escanear = puede_escanear
  if (puede_comandar !== undefined) updates.puede_comandar = puede_comandar
  if (modulos_gestion !== undefined) updates.modulos_gestion = modulos_gestion
  const { data, error } = await supabase.from('personal')
    .update(updates).eq('id', id).eq('restaurante_id', rid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camarero: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { error } = await supabase.from('personal').delete().eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
