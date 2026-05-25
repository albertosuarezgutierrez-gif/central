import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ evento_id: string }> }) {
  const { evento_id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const [{ data: evento }, { data: pases }] = await Promise.all([
    supabase.from('eventos').select('id, nombre, fecha_evento, hora_inicio, aforo_confirmado, estado').eq('id', evento_id).eq('restaurante_id', restauranteId).single(),
    supabase.from('evento_pases').select('*, items:evento_pase_items(id, nombre, cantidad, estado, producto_id, notas)').eq('evento_id', evento_id).eq('restaurante_id', restauranteId).order('numero_pase'),
  ])
  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  return NextResponse.json({ evento, pases: pases ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ evento_id: string }> }) {
  const { evento_id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const ahora = new Date().toISOString()
  const transiciones: Record<string, object> = {
    iniciar: { estado: 'en_preparacion', hora_inicio_at: ahora },
    listo:   { estado: 'listo', hora_lista_at: ahora, hora_real: ahora.slice(11,16) },
    servido: { estado: 'servido', hora_servido_at: ahora },
  }
  const update = body.accion ? transiciones[body.accion] ?? {} : (body.updates ?? {})
  const { data, error } = await supabase.from('evento_pases').update(update).eq('id', body.pase_id).eq('evento_id', evento_id).eq('restaurante_id', restauranteId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pase: data })
}
