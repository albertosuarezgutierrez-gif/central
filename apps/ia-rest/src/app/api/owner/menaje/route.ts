import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { disponibilidadTrasReserva } from '@central/module-inventario'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const evento_id = new URL(req.url).searchParams.get('evento_id')
  if (evento_id) {
    const { data } = await supabase.from('inventario_menaje_evento').select('*, menaje:inventario_menaje(nombre, categoria)').eq('evento_id', evento_id).eq('local_id', restauranteId)
    return NextResponse.json({ asignaciones: data })
  }
  const { data, error } = await supabase.from('inventario_menaje').select('*').eq('local_id', restauranteId).eq('activo', true).order('categoria').order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menaje: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  if (body.tipo === 'asignar_evento') {
    const { data, error } = await supabase.from('inventario_menaje_evento').insert({ evento_id: body.evento_id, menaje_id: body.menaje_id, local_id: restauranteId, cantidad_reservada: body.cantidad_reservada, estado: 'reservado', notas: body.notas ?? null }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data: actual } = await supabase.from('inventario_menaje').select('cantidad_disponible').eq('id', body.menaje_id).single()
    if (actual) await supabase.from('inventario_menaje').update({ cantidad_disponible: disponibilidadTrasReserva(actual.cantidad_disponible ?? 0, body.cantidad_reservada) }).eq('id', body.menaje_id)
    return NextResponse.json({ ok: true, asignacion: data })
  }
  const { data, error } = await supabase.from('inventario_menaje').insert({ local_id: restauranteId, nombre: body.nombre, descripcion: body.descripcion ?? null, categoria: body.categoria ?? 'vajilla', cantidad_total: body.cantidad_total ?? 0, cantidad_disponible: body.cantidad_total ?? 0, coste_unitario: body.coste_unitario ?? 0, proveedor_nombre: body.proveedor_nombre ?? null }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, menaje: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, tabla, ...updates } = await req.json()
  const t = tabla === 'asignacion' ? 'inventario_menaje_evento' : 'inventario_menaje'
  const { error } = await supabase.from(t as 'inventario_menaje').update(updates).eq('id', id).eq('local_id', restauranteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
