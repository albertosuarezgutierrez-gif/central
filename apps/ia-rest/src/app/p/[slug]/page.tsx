// Unificación de propuestas: la presentación personalizada vive en /propuesta/[slug].
// /p/[slug] se conserva solo para no romper enlaces antiguos → redirige a /propuesta/[slug]
// (que resuelve el lead tanto por propuesta_slug como por landing_slug).
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: 'noindex, nofollow' }

export default async function LandingPersonalizadaRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/propuesta/${slug}`)
}
