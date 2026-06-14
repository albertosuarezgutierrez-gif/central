// apps/ia-rest/src/app/blog/[slug]/page.tsx
// Artículos generados por el agente SEO (datos en iarest.seo_articulos).
// Convive con los artículos estáticos (carpetas hermanas): Next prioriza el segmento estático.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getArticulo } from '@/lib/seo/store'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const a = await getArticulo(slug)
  if (!a) return {}
  return {
    title: a.titulo,
    description: a.meta_description ?? undefined,
    alternates: { canonical: `https://www.iarest.es/blog/${slug}` },
    openGraph: { title: a.titulo, description: a.meta_description ?? undefined, type: 'article' },
    keywords: a.keyword ? [a.keyword] : undefined,
  }
}

export default async function ArticuloDinamico({ params }: Props) {
  const { slug } = await params
  const a = await getArticulo(slug)
  if (!a) notFound()
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>
        <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>← Blog</a>
        <h1 style={{ fontSize: 36, margin: '24px 0 20px', lineHeight: 1.15 }}>{a.titulo}</h1>
        {a.bloques.map((b, i) => (
          <section key={i} style={{ marginBottom: 32 }}>
            {b.h2 ? <h2 style={{ fontSize: 24, margin: '0 0 12px' }}>{b.h2}</h2> : null}
            <div style={{ fontSize: 15, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: b.html }} />
          </section>
        ))}
      </div>
    </div>
  )
}
