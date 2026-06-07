import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getCoordinadorSession(req: NextRequest) {
  const raw = req.cookies.get('coordinador_session')?.value
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// POST — reservar/bloquear espacio
export async function POST(req: NextRequest) {
  const session = getCoordinadorSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const body = await req.json()
  const {
    espacio_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
    tipo = 'reserva', nota, evento_id,
    opcion_48h = false, // si true: expira en 48h (opción provisional)
  } = body

  if (!espacio_id || !fecha_inicio || !fecha_fin) {
    return NextResponse.json({ error: 'Faltan espacio y fechas' }, { status: 400 })
  }

  // Verificar disponibilidad
  const { data: disponible } = await supabase.rpc('espacio_disponible', {
    p_espacio_id: espacio_id,
    p_fecha_inicio: fecha_inicio,
    p_fecha_fin: fecha_fin,
    p_excluir_evento_id: evento_id ?? null,
  })

  if (!disponible) {
    return NextResponse.json({
      error: 'El espacio no está disponible en esa fecha',
      disponible: false,
    }, { status: 409 })
  }

  // Calcular expiración si es opción provisional
  const expira_at = opcion_48h
    ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    : null

  const { data: bloqueo, error } = await supabase
    .from('espacio_bloqueos')
    .insert({
      espacio_id,
      restaurante_id: session.restaurante_id,
      evento_id: evento_id ?? null,
      coordinador_id: session.id,
      fecha_inicio,
      fecha_fin,
      hora_inicio: hora_inicio ?? null,
      hora_fin: hora_fin ?? null,
      tipo,
      notas: nota ?? null,
      confirmado: !opcion_48h,
      expira_at,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si hay evento_id, actualizar el evento con el bloqueo
  if (evento_id) {
    await supabase
      .from('eventos')
      .update({
        espacio_id,
        espacio_bloqueado_hasta: expira_at,
      })
      .eq('id', evento_id)
      .eq('local_id', session.restaurante_id)
  }

  return NextResponse.json({
    bloqueo,
    disponible: true,
    mensaje: opcion_48h
      ? 'Opción reservada por 48h. Confirma el evento antes de que expire.'
      : 'Espacio reservado correctamente.',
  }, { status: 201 })
}

// DELETE — liberar reserva
export async function DELETE(req: NextRequest) {
  const session = getCoordinadorSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { id } = await req.json()

  // Solo puede borrar sus propias reservas (o el owner puede borrar cualquiera)
  const { error } = await supabase
    .from('espacio_bloqueos')
    .delete()
    .eq('id', id)
    .eq('local_id', session.restaurante_id)
    .eq('coordinador_id', session.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
