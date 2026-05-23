import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  const [{ data: costes }, { data: margen }] = await Promise.all([
    supabase.from('evento_costes').select('*').eq('evento_id', evento_id).eq('restaurante_id', restauranteId).order('created_at'),
    supabase.rpc('calcular_margen_evento', { p_evento_id: evento_id }),
  ])

  return NextResponse.json({ costes: costes ?? [], margen: margen?.[0] ?? null })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { evento_id, tipo, concepto, importe, es_estimado } = await req.json()
  if (!evento_id || !tipo || !concepto || !importe) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const { data, error } = await supabase.from('evento_costes')
    .insert({ evento_id, restaurante_id: restauranteId, tipo, concepto, importe, es_estimado: es_estimado ?? false })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coste: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('evento_costes').delete().eq('id', id).eq('restaurante_id', restauranteId)
  return NextResponse.json({ ok: true })
}
