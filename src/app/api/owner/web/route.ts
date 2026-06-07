import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('web_restaurante')
    .select('*')
    .eq('local_id', restauranteId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!data) {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('nombre, slug')
      .eq('id', restauranteId)
      .single()
    const slugSugerido = (rest?.slug ?? rest?.nombre ?? '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
    return NextResponse.json({ existe: false, slug_sugerido: slugSugerido })
  }

  return NextResponse.json({ existe: true, ...data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()

  const { data, error } = await supabase
    .from('web_restaurante')
    .upsert(
      { local_id: restauranteId, ...body, updated_at: new Date().toISOString() },
      { onConflict: 'local_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}
