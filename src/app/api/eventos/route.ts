import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const accion = searchParams.get('accion') ?? 'mis_eventos'

  if (accion === 'disponibilidad') {
    const fecha = searchParams.get('fecha') ?? new Date().toISOString().slice(0, 10)
    const hasta = searchParams.get('hasta') ?? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
    const { data: espacios } = await supabase
      .from('espacios_evento').select('id, nombre, tipo, aforo_maximo, descripcion')
      .eq('local_id', restauranteId).eq('activo', true).order('nombre')
    const { data: bloqueos } = await supabase
      .from('bloqueos_espacio')
      .select('id, espacio_id, fecha_inicio, fecha_fin, tipo, eventos(numero_evento, tipo, cliente_nombre, estado, coordinador_id)')
      .eq('local_id', restauranteId).gte('fecha_fin', fecha).lte('fecha_inicio', hasta).order('fecha_inicio')
    return NextResponse.json({ espacios: espacios ?? [], bloqueos: bloqueos ?? [] })
  }

  const soloMios = session.rol === 'coordinador_eventos'
  let query = supabase.from('eventos')
    .select('id, numero_evento, tipo, estado, fecha_evento, hora_inicio, hora_fin, cliente_nombre, cliente_telefono, cliente_email, aforo_previsto, precio_por_persona, precio_total, modo_local, senial_pagada, espacio_id, coordinador_id, espacios_evento(nombre, aforo_maximo), notas_internas')
    .eq('local_id', restauranteId).order('fecha_evento', { ascending: true })
  if (soloMios) query = query.eq('coordinador_id', session.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const hoy = new Date().toISOString().slice(0, 10)
  const activos = (data ?? []).filter(e => e.fecha_evento >= hoy && e.estado !== 'cancelado')
  const ingresos = activos.filter(e => ['confirmado','en_curso'].includes(e.estado)).reduce((s,e) => s+(e.precio_total??0),0)
  return NextResponse.json({ eventos: data??[], stats: { total: data?.length??0, proximos: activos.length, ingresos_previstos: ingresos } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  if (body.espacio_id && body.fecha_evento) {
    const { data: disponible } = await supabase.rpc('espacio_disponible', {
      p_espacio_id: body.espacio_id, p_fecha_inicio: body.fecha_evento, p_fecha_fin: body.fecha_evento,
    })
    if (!disponible) return NextResponse.json({ error: 'Espacio no disponible en esa fecha', disponible: false }, { status: 409 })
  }

  const { data: rest } = await supabase.from('restaurantes').select('cuenta_id').eq('id', restauranteId).single()
  const precio_total = body.precio_por_persona && body.aforo_previsto ? parseFloat(body.precio_por_persona) * parseInt(body.aforo_previsto) : null

  const { data: evento, error } = await supabase.from('eventos').insert({
    restaurante_id: restauranteId, cuenta_id: rest?.cuenta_id,
    coordinador_id: session.id,
    tipo: body.tipo ?? 'boda', cliente_nombre: body.cliente_nombre,
    cliente_telefono: body.cliente_telefono, cliente_email: body.cliente_email,
    fecha_evento: body.fecha_evento, hora_inicio: body.hora_inicio, hora_fin: body.hora_fin,
    modo_local: body.modo_local ?? 'cerrado', espacio_id: body.espacio_id,
    aforo_previsto: body.aforo_previsto, precio_por_persona: body.precio_por_persona,
    precio_total, menu_descripcion: body.menu_descripcion, notas_internas: body.notas_internas,
    senial_importe: body.senial_importe, iva_tipo: 10, estado: 'presupuesto',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (evento && body.espacio_id) {
    await supabase.from('bloqueos_espacio').insert({
      restaurante_id: restauranteId, espacio_id: body.espacio_id,
      evento_id: evento.id, fecha_inicio: body.fecha_evento, fecha_fin: body.fecha_evento,
      tipo: 'evento', created_by: session.id,
    })
  }

  return NextResponse.json({ evento }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...updates } = await req.json()

  if ((updates.espacio_id || updates.fecha_evento) && updates.espacio_id) {
    const { data: ev } = await supabase.from('eventos').select('fecha_evento, espacio_id').eq('id', id).single()
    const fecha = updates.fecha_evento ?? ev?.fecha_evento
    const espacio = updates.espacio_id ?? ev?.espacio_id
    if (fecha && espacio) {
      const { data: disponible } = await supabase.rpc('espacio_disponible', {
        p_espacio_id: espacio, p_fecha_inicio: fecha, p_fecha_fin: fecha, p_excluir_evento_id: id,
      })
      if (!disponible) return NextResponse.json({ error: 'Espacio no disponible en esa fecha', disponible: false }, { status: 409 })
      await supabase.from('bloqueos_espacio').update({ espacio_id: espacio, fecha_inicio: fecha, fecha_fin: fecha }).eq('evento_id', id)
    }
  }

  if (updates.precio_por_persona || updates.aforo_previsto) {
    const { data: ev } = await supabase.from('eventos').select('precio_por_persona, aforo_previsto').eq('id', id).single()
    const pp = updates.precio_por_persona ?? ev?.precio_por_persona
    const af = updates.aforo_previsto ?? ev?.aforo_previsto
    if (pp && af) updates.precio_total = parseFloat(pp) * parseInt(af)
  }

  let query = supabase.from('eventos').update(updates).eq('id', id).eq('local_id', restauranteId)
  if (session.rol === 'coordinador_eventos') query = query.eq('coordinador_id', session.id)
  const { data, error } = await query.select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evento: data })
}
