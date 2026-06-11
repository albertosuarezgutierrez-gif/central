export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { resumenValoraciones } from '@central/module-feedback'
import { feedbackVisitaAdapter, type FeedbackVisitaRow } from '@/lib/feedback-visita'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const [{ data: feedbacks }, { data: rest }] = await Promise.all([
    supabase.from('feedback_visita').select('id,nota,comentario,cliente_nombre,cliente_email,respondido_at,estado,created_at')
      .eq('local_id', rid).order('created_at', { ascending: false }).limit(100),
    supabase.from('restaurantes').select('feedback_activo,google_review_url').eq('id', rid).single(),
  ])
  // Resumen de valoraciones (promedio + distribución) — delegado a @central/module-feedback.
  const resumen = resumenValoraciones(
    (feedbacks ?? []).map(f => feedbackVisitaAdapter.toFeedback(f as unknown as FeedbackVisitaRow)),
  )
  return NextResponse.json({ feedbacks: feedbacks ?? [], config: rest ?? {}, resumen })
}
