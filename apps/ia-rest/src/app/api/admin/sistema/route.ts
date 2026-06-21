export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = createServerClient()

  const [runsRes, globalRes, fuenteRes] = await Promise.all([
    sb.from('qa_runs')
      .select('id, trigger, modo, total, ok, warnings, fallidos, criticos, score, duracion_ms, telegram_enviado, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('v_training_global').select('*').single(),
    sb.from('v_training_por_fuente').select('*'),
  ])

  return NextResponse.json({
    qa: { runs: runsRes.data ?? [] },
    training: { global: globalRes.data, porFuente: fuenteRes.data ?? [] },
  })
}
