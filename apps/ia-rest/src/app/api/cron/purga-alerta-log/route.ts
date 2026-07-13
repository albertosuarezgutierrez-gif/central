// GET /api/cron/purga-alerta-log
// Vercel Cron: diario 03:30. Retención de la tabla de LOGS de alertas.
// `alerta_log` crece ~3.000 filas/día y no se consulta más allá de unos días;
// sin poda llegó a 219k filas / 182 MB (la mitad de la BD) y disparó el límite
// de cuota de Supabase. Este cron mantiene solo los últimos RETENCION_DIAS.
// Nada fiscal/operativo se toca: es puramente la tabla de avisos a camareros.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RETENCION_DIAS = 14

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()
  const corte = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('alerta_log')
    .delete()
    .lt('disparada_at', corte)
    .select('id')

  if (error) {
    console.error('[purga-alerta-log] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const borradas = data?.length ?? 0
  console.log(`[purga-alerta-log] ✓ ${borradas} filas de alerta_log > ${RETENCION_DIAS}d eliminadas`)
  return NextResponse.json({ ok: true, borradas, retencion_dias: RETENCION_DIAS })
}
