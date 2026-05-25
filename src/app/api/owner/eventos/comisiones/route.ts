import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const comercial_id = searchParams.get('comercial_id')
  const estado = searchParams.get('estado') || 'pendiente'

  let query = supabase
    .from('presupuestos_evento')
    .select(`
      id, comision_comercial_eur, comision_estado, comision_cobrada_at,
      total, descuento_aplicado_pct, created_at,
      comercial:personal!comercial_id(id, nombre),
      evento:eventos(id, cliente_nombre, fecha_evento, tipo)
    `)
    .eq('restaurante_id', restauranteId)
    .eq('comision_estado', estado)
    .not('comercial_id', 'is', null)
    .order('created_at', { ascending: false })

  if (comercial_id) query = query.eq('comercial_id', comercial_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total_pendiente = data?.reduce((s, p) => s + (p.comision_comercial_eur || 0), 0) || 0
  return NextResponse.json({ comisiones: data, total_pendiente })
}
