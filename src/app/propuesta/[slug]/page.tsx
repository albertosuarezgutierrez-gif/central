import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import PropuestaDinamica from './PropuestaDinamica'
import type { Metadata } from 'next'

// Mapa de aliases: slug alternativo → términos de búsqueda por empresa
// Permite múltiples URLs para el mismo lead (ej: catering-joaquin-jaen → Joaquín)
const SLUG_ALIASES: Record<string, string> = {
  'catering-joaquin-jaen': 'Joaquín',
  'catering-jj':           'Joaquín',
  'ovejas-negras':         'Ovejas',
  'sloppy-joes':           'Sloppy',
  'bombonera':             'Bombonera',
  'bombonera-group':       'Bombonera',
  'eventos-catering':      'Catering',
  'tu-otra-cocina':        'Tu Otra',
  'saboga-catering':       'Saboga',
}

async function getLead(supabase: ReturnType<typeof createServerClient>, slug: string) {
  // 1. Buscar por propuesta_slug exacto
  const { data: exact } = await supabase
    .from('leads')
    .select('empresa, restaurante, nombre, ciudad, estudio_completo, modulos_recomendados, pain_points, mrr_estimado, propuesta_slug, propuesta_vista_at')
    .eq('propuesta_slug', slug)
    .maybeSingle()

  if (exact) return exact

  // 2. Fallback: buscar por alias de empresa
  const keyword = SLUG_ALIASES[slug]
  if (!keyword) return null

  const { data: byName } = await supabase
    .from('leads')
    .select('empresa, restaurante, nombre, ciudad, estudio_completo, modulos_recomendados, pain_points, mrr_estimado, propuesta_slug, propuesta_vista_at')
    .ilike('empresa', `%${keyword}%`)
    .maybeSingle()

  if (!byName) return null

  // 3. Actualizar propuesta_slug en BD con el nuevo slug (el lead queda accesible por ambas URLs)
  await supabase
    .from('leads')
    .update({ propuesta_slug: slug })
    .ilike('empresa', `%${keyword}%`)

  return { ...byName, propuesta_slug: slug }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServerClient()
  const lead = await getLead(supabase, slug)
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

  const lead = await getLead(supabase, slug)
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
