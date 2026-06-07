export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase.from('mesas')
    .select('id, codigo, nombre, zona, capacidad, estado, pos_x, pos_y, forma, qr_habilitado, qr_modo_pago, qr_precio_fijo_persona, qr_precio_fijo_concepto, qr_token')
    .eq('local_id', rid).order('codigo', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Inyectar estado 'reservada' en mesas bloqueadas por reserva activa
  const { data: bloqueadas } = await supabase
    .rpc('get_mesas_bloqueadas', { p_restaurante_id: rid })
  const bloqMap: Record<string, string> = {}
  for (const b of (bloqueadas ?? []) as { mesa_id: string; hora_reserva: string }[]) {
    bloqMap[b.mesa_id] = b.hora_reserva.slice(0, 5)
  }

  const mesas = (data ?? []).map(m => ({
    ...m,
    estado:       bloqMap[m.id] ? 'reservada' : m.estado,
    reserva_hora: bloqMap[m.id] ?? null,
  }))

  return NextResponse.json({ mesas })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { codigo, nombre, zona, capacidad, pos_x, pos_y, forma } = await req.json()
  if (!codigo || !zona) return NextResponse.json({ error: 'Código y zona requeridos' }, { status: 400 })
  const { data: existing } = await supabase.from('mesas').select('id').eq('codigo', codigo).eq('local_id', rid).single()
  if (existing) return NextResponse.json({ error: 'Código ya existe' }, { status: 409 })
  const { data, error } = await supabase.from('mesas')
    .insert({
      codigo, nombre: nombre || null, zona,
      capacidad: capacidad || 4,
      local_id: rid,
      pos_x: pos_x ?? null,
      pos_y: pos_y ?? null,
      forma: forma ?? 'round',
    }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mesa: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, codigo, nombre, zona, capacidad, pos_x, pos_y, forma } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (codigo    !== undefined) updates.codigo    = codigo
  if (nombre    !== undefined) updates.nombre    = nombre || null
  if (zona      !== undefined) updates.zona      = zona
  if (capacidad !== undefined) updates.capacidad = capacidad
  if (pos_x     !== undefined) updates.pos_x     = pos_x
  if (pos_y     !== undefined) updates.pos_y     = pos_y
  if (forma     !== undefined) updates.forma     = forma
  const { data, error } = await supabase.from('mesas').update(updates).eq('id', id).eq('local_id', rid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mesa: data })
}

export async function PATCH(req: NextRequest) {
  // PATCH: actualizar campos QR de una mesa
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { id, qr_habilitado, qr_modo_pago, qr_precio_fijo_persona, qr_precio_fijo_concepto } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (qr_habilitado           !== undefined) updates.qr_habilitado           = qr_habilitado
  if (qr_modo_pago            !== undefined) updates.qr_modo_pago            = qr_modo_pago
  if (qr_precio_fijo_persona  !== undefined) updates.qr_precio_fijo_persona  = qr_precio_fijo_persona
  if (qr_precio_fijo_concepto !== undefined) updates.qr_precio_fijo_concepto = qr_precio_fijo_concepto
  const { data, error } = await supabase.from('mesas')
    .update(updates).eq('id', id).eq('local_id', rid)
    .select('id, codigo, qr_habilitado, qr_modo_pago, qr_precio_fijo_persona, qr_precio_fijo_concepto, qr_token').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mesa: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { error } = await supabase.from('mesas').delete().eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
