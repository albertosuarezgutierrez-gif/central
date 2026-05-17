import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const [{ data, error }, { data: rest }] = await Promise.all([
    supabase
      .from('secciones_cocina')
      .select('id, nombre, color_kds, icono, orden, activa')
      .eq('restaurante_id', rid)
      .order('orden', { ascending: true }),
    supabase
      .from('restaurantes')
      .select('kds_token')
      .eq('id', rid)
      .single(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ secciones: data, kds_token: rest?.kds_token ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre, color_kds, icono } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  const { count } = await supabase
    .from('secciones_cocina').select('*', { count: 'exact', head: true }).eq('restaurante_id', rid)
  const { data, error } = await supabase
    .from('secciones_cocina')
    .insert({
      restaurante_id: rid,
      id: nombre.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''),
      nombre: nombre.trim(),
      color_kds: color_kds || '#D9442B',
      icono: icono || '🍽️',
      orden: count ?? 0,
      activa: true,
    })
    .select('id, nombre, color_kds, icono, orden, activa')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seccion: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, nombre, color_kds, icono, activa, orden } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (nombre   !== undefined) patch.nombre    = nombre.trim()
  if (color_kds !== undefined) patch.color_kds = color_kds
  if (icono    !== undefined) patch.icono     = icono
  if (activa   !== undefined) patch.activa    = activa
  if (orden    !== undefined) patch.orden     = orden
  const { error } = await supabase
    .from('secciones_cocina').update(patch).eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { count } = await supabase
    .from('productos').select('*', { count: 'exact', head: true })
    .eq('seccion', id).eq('restaurante_id', rid).eq('activo', true)
  if ((count ?? 0) > 0)
    return NextResponse.json({ error: `Esta sección tiene ${count} productos activos. Muévelos primero.` }, { status: 409 })
  const { error } = await supabase
    .from('secciones_cocina').delete().eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
