import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/eventos — eventos del coordinador autenticado
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  const todos = searchParams.get('todos') === 'true' // solo owner puede pedir todos

  // Si es coordinador_eventos, solo ve los suyos
  const esCoordinador = session.rol === 'coordinador_eventos'

  let query = supabase
    .from('eventos')
    .select(`
      id, numero_evento, tipo, estado,
      fecha_evento, hora_inicio, hora_fin,
      cliente_nombre, cliente_telefono, cliente_email,
      aforo_previsto, aforo_confirmado,
      precio_por_persona, precio_total,
      modo_local, espacio_id, es_itinerante,
      acceso_qr_activo, senial_pagada, requiere_appcc,
      notas_cocina, notas_sala,
      coordinador_id,
      coordinador:personal!coordinador_id(id, nombre),
      espacios_evento(id, nombre, tipo, aforo_maximo),
      created_at
    `)
    .eq('restaurante_id', restauranteId)
    .neq('estado', 'cancelado')
    .order('fecha_evento', { ascending: true })

  if (esCoordinador && !todos) {
    query = query.eq('coordinador_id', session.id)
  }
  if (estado) query = query.eq('estado', estado)
  if (desde) query = query.gte('fecha_evento', desde)
  if (hasta) query = query.lte('fecha_evento', hasta)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ eventos: data })
}
