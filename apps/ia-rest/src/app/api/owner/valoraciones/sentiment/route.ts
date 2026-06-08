export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: vals } = await supabase
    .from('qr_valoraciones')
    .select('sentiment_label, sentiment_tags, sentiment_resumen, puntuacion, comentario, created_at, sentiment_at')
    .eq('local_id', restauranteId)

  const totales = { positivo: 0, neutro: 0, negativo: 0 }
  const tagConteo: Record<string, number> = {}
  let sumPunt = 0

  for (const v of vals ?? []) {
    sumPunt += v.puntuacion ?? 0
    if (v.sentiment_label) totales[v.sentiment_label as keyof typeof totales] = (totales[v.sentiment_label as keyof typeof totales] ?? 0) + 1
    for (const tag of v.sentiment_tags ?? []) tagConteo[tag] = (tagConteo[tag] ?? 0) + 1
  }

  const total = (vals ?? []).length
  const conSentiment = (vals ?? []).filter(v => v.sentiment_at).length
  const topTags = Object.entries(tagConteo).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const recientes = (vals ?? []).filter(v => v.sentiment_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10)

  return NextResponse.json({
    total, conSentiment, pendientes: total - conSentiment,
    totales, topTags,
    puntuacionMedia: total > 0 ? (sumPunt / total).toFixed(1) : null,
    recientes,
  })
}
