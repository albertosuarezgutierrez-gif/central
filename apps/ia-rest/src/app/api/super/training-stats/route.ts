export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  const [{ data: global }, { data: porFuente }, { data: recientes }] = await Promise.all([
    supabase.from('v_training_global').select('*').single(),
    supabase.from('v_training_por_fuente').select('*'),
    supabase.from('ia_training_log')
      .select('id, input_raw, fuente, calidad, confianza, fue_corregido, created_at, local_id')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({ global, porFuente: porFuente ?? [], recientes: recientes ?? [] })
}
