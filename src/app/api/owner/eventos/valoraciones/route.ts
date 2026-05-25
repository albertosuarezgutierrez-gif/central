import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('evento_valoracion')
    .select('*, evento:eventos(id, cliente_nombre, fecha_evento)')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const nps_medio = data?.length ? Math.round(data.reduce((s, v) => s + (v.nps || 0), 0) / data.length * 10) / 10 : 0
  return NextResponse.json({ valoraciones: data, nps_medio })
}
