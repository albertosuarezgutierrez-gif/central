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
    .from('materiales_inventario_fisico')
    .select('id, espacio_id, estado, fecha, created_at, espacio:materiales_espacios(nombre)')
    .eq('restaurante_id', rid)
    .order('fecha', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inventarios: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  // Crea sesión de inventario
  const { data: inv, error } = await supabase.from('materiales_inventario_fisico').insert({
    restaurante_id: rid,
    espacio_id: body.espacio_id ?? null,
    realizado_por: session.camarero_id ?? null,
    fecha: body.fecha ?? new Date().toISOString().slice(0, 10),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pre-rellena líneas con stock actual de materiales del espacio (o todos)
  let matsQ = supabase.from('materiales').select('id, cantidad_disponible').eq('restaurante_id', rid).eq('activo', true)
  if (body.espacio_id) matsQ = matsQ.eq('espacio_actual_id', body.espacio_id)
  const { data: mats } = await matsQ
  if (mats?.length) {
    await supabase.from('materiales_inventario_fisico_lineas').insert(
      mats.map(m => ({
        inventario_id: inv.id,
        material_id: m.id,
        cantidad_sistema: m.cantidad_disponible ?? 0,
        cantidad_contada: m.cantidad_disponible ?? 0,
      }))
    )
  }

  return NextResponse.json({ inventario: inv })
}
