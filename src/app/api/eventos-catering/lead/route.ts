import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.nombre_contacto || (!body.telefono && !body.email)) return NextResponse.json({ error: 'Nombre y teléfono o email obligatorios' }, { status: 400 })
  const { data, error } = await supabase.from('leads_eventos').insert({ restaurante_id: body.restaurante_id ?? null, tipo_evento: body.tipo_evento ?? 'boda', fecha_tentativa: body.fecha_tentativa ?? null, num_comensales: body.num_comensales ?? null, presupuesto_orientativo: body.presupuesto_orientativo ?? null, nombre_contacto: body.nombre_contacto, telefono: body.telefono ?? null, email: body.email ?? null, espacio_preferido: body.espacio_preferido ?? null, como_conocio: body.como_conocio ?? 'web', mensaje: body.mensaje ?? null, estado: 'nuevo' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await tgAlert(`🎉 <b>Lead evento</b>\nTipo: ${body.tipo_evento}\n${body.nombre_contacto}\n${body.telefono ?? body.email ?? '-'}`, 'info')
  return NextResponse.json({ ok: true, id: data.id })
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = new URL(req.url).searchParams.get('restaurante_id')
  if (!restaurante_id) return NextResponse.json({ error: 'Falta restaurante_id' }, { status: 400 })
  const { data } = await supabase.from('leads_eventos').select('*').eq('local_id', restaurante_id).order('created_at', { ascending: false }).limit(100)
  return NextResponse.json({ leads: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const { id, ...updates } = await req.json()
  await supabase.from('leads_eventos').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}
