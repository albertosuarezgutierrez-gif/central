import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? new Date().toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') ?? new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)
  const espacioId = searchParams.get('espacio_id')
  const checkFecha = searchParams.get('check_fecha')

  const { data: espacios } = await supabase
    .from('espacios_evento')
    .select('id, nombre, tipo, aforo_maximo')
    .eq('local_id', restauranteId)
    .eq('activo', true)
    .order('nombre')

  if (!espacios?.length) return NextResponse.json({ espacios: [], bloqueos: [] })

  let bloqueoQuery = supabase
    .from('bloqueos_espacio')
    .select('id, espacio_id, fecha_inicio, fecha_fin, tipo, notas, evento_id, eventos(numero_evento, tipo, cliente_nombre, aforo_previsto, estado)')
    .eq('local_id', restauranteId)
    .lte('fecha_inicio', hasta)
    .gte('fecha_fin', desde)
    .order('fecha_inicio')

  if (espacioId) bloqueoQuery = bloqueoQuery.eq('espacio_id', espacioId)
  const { data: bloqueos } = await bloqueoQuery

  let disponibilidad_fecha: Record<string, boolean> = {}
  if (checkFecha) {
    for (const esp of espacios) {
      const { data } = await supabase.rpc('espacio_disponible', {
        p_espacio_id: esp.id, p_fecha_inicio: checkFecha, p_fecha_fin: checkFecha,
      })
      disponibilidad_fecha[esp.id] = data ?? true
    }
  }

  return NextResponse.json({ espacios, bloqueos: bloqueos ?? [], disponibilidad_fecha, rango: { desde, hasta } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { espacio_id, fecha_inicio, fecha_fin, tipo = 'manual', notas, evento_id } = await req.json()
  if (!espacio_id || !fecha_inicio || !fecha_fin)
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const { data: disponible } = await supabase.rpc('espacio_disponible', {
    p_espacio_id: espacio_id, p_fecha_inicio: fecha_inicio, p_fecha_fin: fecha_fin,
    p_excluir_evento_id: evento_id ?? null,
  })

  if (!disponible)
    return NextResponse.json({ error: 'Espacio no disponible en esas fechas', disponible: false }, { status: 409 })

  const { data, error } = await supabase
    .from('bloqueos_espacio')
    .insert({ restaurante_id: restauranteId, espacio_id, fecha_inicio, fecha_fin, tipo, notas, evento_id: evento_id ?? null, created_by: session.id })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bloqueo: data, disponible: true }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('bloqueos_espacio').delete().eq('id', id).eq('local_id', restauranteId)
  return NextResponse.json({ ok: true })
}
