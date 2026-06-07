import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { tgAlert } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const evento_id = new URL(req.url).searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })
  const { data } = await supabase.from('beo_eventos').select('*').eq('evento_id', evento_id).eq('local_id', restauranteId).maybeSingle()
  return NextResponse.json({ beo: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { data, error } = await supabase.from('beo_eventos').upsert({
    evento_id: body.evento_id, restaurante_id: restauranteId,
    timeline: body.timeline ?? [], layout_tipo: body.layout_tipo ?? 'banquete_redondas',
    layout_imagen_url: body.layout_imagen_url ?? null, layout_notas: body.layout_notas ?? null,
    personal_asignado: body.personal_asignado ?? [], equipamiento: body.equipamiento ?? [],
    checklist: body.checklist ?? [], estado: body.estado ?? 'borrador',
    version: body.version ?? 1, updated_at: new Date().toISOString(),
  }, { onConflict: 'evento_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await supabase.from('eventos').update({ beo_estado: body.estado ?? 'borrador' }).eq('id', body.evento_id).eq('local_id', restauranteId)
  if (body.estado === 'distribuido') {
    const { data: ev } = await supabase.from('eventos').select('nombre, fecha_evento').eq('id', body.evento_id).single()
    if (ev) await tgAlert(`📋 <b>BEO distribuido</b>\nEvento: ${ev.nombre}\nFecha: ${new Date(ev.fecha_evento).toLocaleDateString('es-ES')}`, 'info')
  }
  return NextResponse.json({ ok: true, beo: data })
}
