import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos — listar eventos del restaurante (o grupo)
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  const modo = searchParams.get('modo') // 'grupo' para ver todos los locales

  let query = supabase
    .from('eventos')
    .select(`
      id, numero_evento, tipo, estado,
      fecha_evento, hora_inicio, hora_fin,
      cliente_nombre, cliente_telefono, cliente_email,
      aforo_previsto, aforo_confirmado,
      precio_por_persona, precio_total, coste_total,
      modo_local, es_itinerante, acceso_qr_activo,
      es_recurrente, senial_pagada, requiere_appcc,
      notas_internas, notas_cocina, notas_sala,
      restaurante_id, cuenta_id,
      espacio_id, espacios_evento(id, nombre, tipo, aforo_maximo),
      created_at, updated_at
    `)
    .order('fecha_evento', { ascending: true })

  // Modo grupo: ver todos los eventos de todos los locales de la cuenta
  if (modo === 'grupo') {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('cuenta_id')
      .eq('id', restauranteId)
      .single()
    if (rest?.cuenta_id) {
      query = query.eq('cuenta_id', rest.cuenta_id)
    } else {
      query = query.eq('restaurante_id', restauranteId)
    }
  } else {
    query = query.eq('restaurante_id', restauranteId)
  }

  if (estado) query = query.eq('estado', estado)
  if (desde) query = query.gte('fecha_evento', desde)
  if (hasta) query = query.lte('fecha_evento', hasta)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ eventos: data })
}

// POST /api/owner/eventos — crear evento
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const {
    tipo, cliente_nombre, cliente_telefono, cliente_email, cliente_fiscal_id,
    fecha_evento, hora_inicio, hora_fin, fecha_montaje, fecha_desmontaje,
    modo_local, espacio_id, espacio_descripcion,
    aforo_previsto, aforo_confirmado, aforo_minimo,
    menu_descripcion, escandallo_id, precio_por_persona,
    es_recurrente, patron_recurrencia, acceso_qr_activo, es_itinerante,
    senial_importe, senial_fecha, metodo_pago_final,
    notas_internas, notas_cocina, notas_sala,
    requiere_appcc, iva_tipo,
    locales_itinerante, // array de {restaurante_id, orden, hora_inicio, hora_fin, descripcion}
    pases,             // array de {numero_pase, nombre, hora_prevista, comensales}
  } = body

  if (!cliente_nombre || !fecha_evento || !aforo_previsto || !modo_local) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Obtener cuenta_id
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('cuenta_id')
    .eq('id', restauranteId)
    .single()

  // Calcular precio_total si hay precio_por_persona
  const precio_total = precio_por_persona && aforo_previsto
    ? parseFloat(precio_por_persona) * parseInt(aforo_previsto)
    : null

  const { data: evento, error } = await supabase
    .from('eventos')
    .insert({
      restaurante_id: restauranteId,
      cuenta_id: rest?.cuenta_id,
      tipo: tipo || 'otro',
      cliente_nombre, cliente_telefono, cliente_email, cliente_fiscal_id,
      fecha_evento, hora_inicio, hora_fin, fecha_montaje, fecha_desmontaje,
      modo_local, espacio_id, espacio_descripcion,
      aforo_previsto, aforo_confirmado, aforo_minimo,
      menu_descripcion, escandallo_id, precio_por_persona, precio_total,
      es_recurrente: es_recurrente || false,
      patron_recurrencia,
      acceso_qr_activo: acceso_qr_activo || false,
      es_itinerante: es_itinerante || false,
      senial_importe, senial_fecha, metodo_pago_final,
      notas_internas, notas_cocina, notas_sala,
      requiere_appcc: requiere_appcc || false,
      iva_tipo: iva_tipo || 10,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Crear locales itinerantes si aplica
  if (es_itinerante && locales_itinerante?.length) {
    await supabase.from('evento_locales').insert(
      locales_itinerante.map((l: { restaurante_id: string; orden: number; hora_inicio?: string; hora_fin?: string; descripcion?: string }) => ({
        evento_id: evento.id,
        restaurante_id: l.restaurante_id,
        orden: l.orden,
        hora_inicio: l.hora_inicio,
        hora_fin: l.hora_fin,
        descripcion: l.descripcion,
      }))
    )
  }

  // Crear pases iniciales si vienen en el body
  if (pases?.length) {
    await supabase.from('evento_pases').insert(
      pases.map((p: { numero_pase: number; nombre: string; hora_prevista?: string; comensales?: number }) => ({
        evento_id: evento.id,
        restaurante_id: restauranteId,
        numero_pase: p.numero_pase,
        nombre: p.nombre,
        hora_prevista: p.hora_prevista,
        comensales: p.comensales,
      }))
    )
  }

  return NextResponse.json({ evento }, { status: 201 })
}

// PUT /api/owner/eventos — actualizar evento
export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  // Recalcular precio_total si cambia precio_pp o aforo
  if (updates.precio_por_persona || updates.aforo_previsto) {
    const { data: ev } = await supabase.from('eventos').select('precio_por_persona, aforo_previsto').eq('id', id).single()
    const pp = updates.precio_por_persona ?? ev?.precio_por_persona
    const af = updates.aforo_previsto ?? ev?.aforo_previsto
    if (pp && af) updates.precio_total = parseFloat(pp) * parseInt(af)
  }

  const { data, error } = await supabase
    .from('eventos')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evento: data })
}

// DELETE /api/owner/eventos — cancelar (no borrar físicamente)
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabase
    .from('eventos')
    .update({ estado: 'cancelado' })
    .eq('id', id)
    .eq('restaurante_id', restauranteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
