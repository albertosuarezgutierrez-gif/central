export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const TIPOS = ['preventivo', 'correctivo', 'revision']
const ESTADOS = ['pendiente', 'en_curso', 'completado']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)
  let q = supabase
    .from('materiales_mantenimiento')
    .select('id, material_id, unidad_id, tipo, estado, fecha_prevista, fecha_realizada, coste, notas, created_at, material:materiales(nombre, categoria)')
    .eq('restaurante_id', rid)
    .order('fecha_prevista', { ascending: true, nullsFirst: false })
  const estado = url.searchParams.get('estado')
  const materialId = url.searchParams.get('material_id')
  if (estado && ESTADOS.includes(estado)) q = q.eq('estado', estado)
  if (materialId) q = q.eq('material_id', materialId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mantenimientos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })
  const { data, error } = await supabase.from('materiales_mantenimiento').insert({
    restaurante_id: rid,
    material_id: body.material_id,
    unidad_id: body.unidad_id ?? null,
    tipo: TIPOS.includes(body.tipo) ? body.tipo : 'preventivo',
    estado: ESTADOS.includes(body.estado) ? body.estado : 'pendiente',
    fecha_prevista: body.fecha_prevista ?? null,
    fecha_realizada: body.fecha_realizada ?? null,
    coste: body.coste != null ? Number(body.coste) : null,
    notas: body.notas ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mantenimiento: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  for (const k of ['tipo', 'estado', 'fecha_prevista', 'fecha_realizada', 'coste', 'notas'] as const)
    if (campos[k] !== undefined) updates[k] = campos[k]
  const { error } = await supabase.from('materiales_mantenimiento').update(updates).eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
