import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: web } = await supabase
    .from('web_restaurante')
    .select('visitas_total, activa, slug, created_at, updated_at, idiomas_activos, template')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()

  if (!web) return NextResponse.json({ existe: false })

  // Calcular métricas básicas
  const diasActiva = web.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(web.created_at).getTime()) / 86400000))
    : 1

  const visitasPorDia = web.visitas_total
    ? (web.visitas_total / diasActiva).toFixed(1)
    : '0'

  return NextResponse.json({
    existe: true,
    activa: web.activa,
    slug: web.slug,
    url: `https://www.iarest.es/r/${web.slug}`,
    visitas_total: web.visitas_total ?? 0,
    visitas_por_dia: parseFloat(visitasPorDia),
    dias_activa: diasActiva,
    template: web.template ?? 'clasico',
    idiomas: web.idiomas_activos ?? ['es'],
    ultima_actualizacion: web.updated_at,
  })
}
