import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })
  const { data, error } = await supabase
    .from('evento_costes')
    .select('*, personal:personal(nombre)')
    .eq('evento_id', evento_id).eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const porTipo = (data ?? []).reduce((acc: Record<string, number>, c) => {
    acc[c.tipo] = (acc[c.tipo] ?? 0) + c.importe; return acc
  }, {})
  return NextResponse.json({ costes: data, resumen: porTipo, total: Object.values(porTipo).reduce((a, b) => a + b, 0) })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { evento_id, tipo, descripcion, importe, proveedor_nombre, personal_id, horas, coste_hora, fecha_imputacion } = body
  if (!evento_id || !tipo || !descripcion || !importe) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const { data, error } = await supabase.from('evento_costes').insert({
    evento_id, restaurante_id: restauranteId, tipo, descripcion, importe,
    origen: 'manual', proveedor_nombre, personal_id, horas, coste_hora,
    fecha_imputacion: fecha_imputacion ?? new Date().toISOString().slice(0, 10),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coste: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { evento_id, pedido_id, descripcion, importe, proveedor_id, proveedor_nombre } = await req.json()
  if (!evento_id || !importe) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const { data, error } = await supabase.rpc('imputar_coste_recepcion_evento', {
    p_evento_id: evento_id, p_restaurante_id: restauranteId,
    p_descripcion: descripcion ?? 'Recepción mercancía', p_importe: importe,
    p_origen_id: pedido_id, p_proveedor_id: proveedor_id ?? null, p_proveedor_nombre: proveedor_nombre ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coste_id: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  await supabase.from('evento_costes').delete().eq('id', id).eq('restaurante_id', restauranteId)
  return NextResponse.json({ ok: true })
}
