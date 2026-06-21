export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { avanzarProspeccionApify } from '@/lib/prospeccion-apify'
import { apifyConfigurado } from '@/lib/apify'

// GET → últimas ejecuciones + resumen de leads de Apify.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()

  const { data: runs } = await supabase
    .from('prospeccion_apify_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20)

  const { count: leadsApify } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'apify_google_places')

  const { count: leadsApifyEmail } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'apify_google_places')
    .not('email', 'is', null)

  return NextResponse.json({
    configurado: apifyConfigurado(),
    runs: runs ?? [],
    leads_apify: leadsApify ?? 0,
    leads_apify_con_email: leadsApifyEmail ?? 0,
  })
}

// POST → lanza el agente una vuelta a mano (fase A o B).
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  const result = await avanzarProspeccionApify(supabase)
  return NextResponse.json(result)
}
