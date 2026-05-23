import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import PropuestaDinamica from './PropuestaDinamica'
import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServerClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('empresa, restaurante, nombre')
    .eq('propuesta_slug', slug)
    .single()

  const empresa = lead?.empresa || lead?.restaurante || lead?.nombre || 'Tu restaurante'
  return {
    title: `ia.rest · Propuesta para ${empresa}`,
    description: `Propuesta personalizada de ia.rest para ${empresa}`,
    robots: 'noindex, nofollow',
  }
}

export default async function PropuestaSlugPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('empresa, restaurante, nombre, ciudad, estudio_completo, modulos_recomendados, pain_points, mrr_estimado, propuesta_slug, propuesta_vista_at')
    .eq('propuesta_slug', slug)
    .single()

  if (!lead) notFound()

  // Registrar primera visita
  if (!lead.propuesta_vista_at) {
    await supabase
      .from('leads')
      .update({ propuesta_vista_at: new Date().toISOString() })
      .eq('propuesta_slug', slug)
  }

  return <PropuestaDinamica lead={lead} slug={slug} />
}
