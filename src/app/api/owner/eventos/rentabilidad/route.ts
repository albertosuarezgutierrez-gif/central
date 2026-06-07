import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/rentabilidad
// Rentabilidad real por evento, agrupada por tipo/coordinador/espacio
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  const evento_id = searchParams.get('evento_id')

  // Detalle de un evento concreto
  if (evento_id) {
    const { data, error } = await supabase
      .from('v_rentabilidad_eventos')
      .select('*')
      .eq('id', evento_id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ evento: data })
  }

  // Listado de todos los eventos del restaurante
  let query = supabase
    .from('v_rentabilidad_eventos')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('fecha_evento', { ascending: false })

  if (desde) query = query.gte('fecha_evento', desde)
  if (hasta) query = query.lte('fecha_evento', hasta)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcular agregados
  const eventos = data ?? []
  const completados = eventos.filter(e => ['completado', 'facturado'].includes(e.estado))

  const resumen = {
    total_eventos: eventos.length,
    total_ingresos: eventos.reduce((s, e) => s + (e.ingresos_previstos ?? 0), 0),
    total_costes: completados.reduce((s, e) => s + (e.costes_reales ?? 0), 0),
    margen_total: completados.reduce((s, e) => s + (e.margen_real ?? 0), 0),
    margen_pct_medio: completados.length
      ? Math.round(completados.reduce((s, e) => s + (e.margen_pct ?? 0), 0) / completados.length)
      : null,
    // Por tipo de evento
    por_tipo: eventos.reduce((acc: Record<string, { count: number; ingresos: number; margen: number }>, e) => {
      const t = e.tipo ?? 'otro'
      if (!acc[t]) acc[t] = { count: 0, ingresos: 0, margen: 0 }
      acc[t].count++
      acc[t].ingresos += e.ingresos_previstos ?? 0
      acc[t].margen += e.margen_real ?? 0
      return acc
    }, {}),
    // Por coordinador
    por_coordinador: eventos.reduce((acc: Record<string, { count: number; ingresos: number }>, e) => {
      const c = e.coordinador_nombre ?? 'Sin asignar'
      if (!acc[c]) acc[c] = { count: 0, ingresos: 0 }
      acc[c].count++
      acc[c].ingresos += e.ingresos_previstos ?? 0
      return acc
    }, {}),
    // Por espacio
    por_espacio: eventos.reduce((acc: Record<string, { count: number; ingresos: number }>, e) => {
      const esp = e.espacio_nombre ?? 'Externo'
      if (!acc[esp]) acc[esp] = { count: 0, ingresos: 0 }
      acc[esp].count++
      acc[esp].ingresos += e.ingresos_previstos ?? 0
      return acc
    }, {}),
  }

  return NextResponse.json({ eventos, resumen })
}
