import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — franjas de un espacio
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const espacio_id = searchParams.get('espacio_id')
  const fecha = searchParams.get('fecha')

  let query = supabase
    .from('espacio_franjas')
    .select(`
      *,
      disponibilidad:espacio_disponibilidad(id, fecha, estado, evento_id)
    `)
    .eq('local_id', restauranteId)
    .eq('activa', true)
    .order('hora_inicio')

  if (espacio_id) query = query.eq('espacio_id', espacio_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si hay fecha, filtrar disponibilidad
  const result = fecha
    ? data?.map(f => ({
        ...f,
        disponibilidad: f.disponibilidad?.filter((d: { fecha: string }) => d.fecha === fecha) || []
      }))
    : data

  return NextResponse.json({ franjas: result })
}

// POST — crear franja
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { espacio_id, nombre, hora_inicio, hora_fin } = body

  if (!espacio_id || !nombre || !hora_inicio || !hora_fin)
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })

  const { data, error } = await supabase
    .from('espacio_franjas')
    .insert({ restaurante_id: restauranteId, espacio_id, nombre, hora_inicio, hora_fin })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ franja: data })
}
