export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { totalPropinas, propinasPagadas } from '@iarest/module-feedback'
import { propinaAdapter, type PropinaRow } from '@/lib/feedback-visita'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const [{ data: propinas }, { data: rest }] = await Promise.all([
    supabase.from('propinas').select('id,importe,estado,created_at,pagada_at,reparto,token')
      .eq('local_id', rid).order('created_at', { ascending: false }).limit(100),
    supabase.from('restaurantes').select('propinas_activas,propinas_reparto_modo,propinas_opciones_eur').eq('id', rid).single(),
  ])
  // Totales de propinas — delegado a @iarest/module-feedback.
  const servicios = (propinas ?? []).map(p => propinaAdapter.toPropina(p as unknown as PropinaRow))
  const resumen = { total: totalPropinas(servicios), pagadas: propinasPagadas(servicios) }
  return NextResponse.json({ propinas: propinas ?? [], config: rest ?? {}, resumen })
}
