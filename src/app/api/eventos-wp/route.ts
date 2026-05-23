import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getCoordinadorSession(req: NextRequest) {
  const raw = req.cookies.get('coordinador_session')?.value
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export async function GET(req: NextRequest) {
  const session = getCoordinadorSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const todos = searchParams.get('todos') === 'true' // ver todos los eventos del restaurante (no solo los propios)

  let query = supabase
    .from('eventos')
    .select(`
      id, numero_evento, tipo, estado,
      fecha_evento, hora_inicio, hora_fin,
      cliente_nombre, cliente_telefono, cliente_email,
      aforo_previsto, aforo_confirmado,
      precio_por_persona, precio_total,
      modo_local, espacio_id, coordinador_id,
      senial_pagada, acceso_qr_activo, requiere_appcc,
      notas_internas, notas_cocina, notas_sala,
      espacio_bloqueado_hasta,
      espacios_evento(id, nombre, tipo, aforo_maximo),
      created_at
    `)
    .eq('restaurante_id', session.restaurante_id)
    .not('estado', 'eq', 'cancelado')
    .order('fecha_evento', { ascending: true })

  // Por defecto solo ve sus propios eventos
  if (!todos) query = query.eq('coordinador_id', session.id)
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ eventos: data })
}

export async function POST(req: NextRequest) {
  const session = getCoordinadorSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()

  const body = await req.json()
  const {
    tipo, cliente_nombre, cliente_telefono, cliente_email,
    fecha_evento, hora_inicio, hora_fin,
    modo_local, espacio_id,
    aforo_previsto, precio_por_persona,
    menu_descripcion, notas_internas, notas_cocina, notas_sala,
    senial_importe, acceso_qr_activo, requiere_appcc,
    reservar_espacio = false, // si true: bloquea el espacio automáticamente
    opcion_48h = false,
  } = body

  if (!cliente_nombre || !fecha_evento || !aforo_previsto) {
    return NextResponse.json({ error: 'Cliente, fecha y aforo son obligatorios' }, { status: 400 })
  }

  const { data: rest } = await supabase
    .from('restaurantes').select('cuenta_id').eq('id', session.restaurante_id).single()

  const precio_total = precio_por_persona && aforo_previsto
    ? parseFloat(precio_por_persona) * parseInt(aforo_previsto) : null

  const { data: evento, error } = await supabase
    .from('eventos')
    .insert({
      restaurante_id: session.restaurante_id,
      cuenta_id: rest?.cuenta_id,
      coordinador_id: session.id,
      tipo: tipo ?? 'otro',
      cliente_nombre, cliente_telefono, cliente_email,
      fecha_evento, hora_inicio, hora_fin,
      modo_local: modo_local ?? 'externo',
      espacio_id: espacio_id ?? null,
      aforo_previsto, precio_por_persona, precio_total,
      menu_descripcion,
      notas_internas, notas_cocina, notas_sala,
      senial_importe,
      acceso_qr_activo: acceso_qr_activo ?? false,
      requiere_appcc: requiere_appcc ?? false,
      estado: 'presupuesto',
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si pide bloqueo automático del espacio
  if (reservar_espacio && espacio_id) {
    const expira_at = opcion_48h
      ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      : null

    await supabase.from('espacio_bloqueos').insert({
      espacio_id,
      restaurante_id: session.restaurante_id,
      evento_id: evento.id,
      coordinador_id: session.id,
      fecha_inicio: fecha_evento,
      fecha_fin: fecha_evento,
      tipo: 'reserva',
      confirmado: !opcion_48h,
      expira_at,
    })

    if (expira_at) {
      await supabase.from('eventos').update({ espacio_bloqueado_hasta: expira_at }).eq('id', evento.id)
    }
  }

  return NextResponse.json({ evento }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getCoordinadorSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()

  if (updates.precio_por_persona || updates.aforo_previsto) {
    const { data: ev } = await supabase.from('eventos').select('precio_por_persona, aforo_previsto').eq('id', id).single()
    const pp = updates.precio_por_persona ?? ev?.precio_por_persona
    const af = updates.aforo_previsto ?? ev?.aforo_previsto
    if (pp && af) updates.precio_total = parseFloat(pp) * parseInt(af)
  }

  const { data, error } = await supabase
    .from('eventos').update(updates)
    .eq('id', id)
    .eq('restaurante_id', session.restaurante_id)
    .eq('coordinador_id', session.id) // solo puede editar los suyos
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evento: data })
}
