import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const tipo_evento = searchParams.get('tipo_evento')

  let query = supabase
    .from('evento_historico_precios')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (tipo_evento) query = query.eq('tipo_evento', tipo_evento)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Estadísticas
  const stats: Record<string, { count: number; precio_sum: number; margen_sum: number }> = {}
  data?.forEach(h => {
    const k = h.tipo_evento || 'otro'
    if (!stats[k]) stats[k] = { count: 0, precio_sum: 0, margen_sum: 0 }
    stats[k].count++
    stats[k].precio_sum += h.precio_adulto_final || 0
    stats[k].margen_sum += h.margen_real_pct || 0
  })

  const resumen = Object.entries(stats).map(([tipo, s]) => ({
    tipo,
    eventos: s.count,
    precio_medio: Math.round(s.precio_sum / s.count * 100) / 100,
    margen_medio: Math.round(s.margen_sum / s.count * 100) / 100
  }))

  return NextResponse.json({ historico: data, resumen })
}
