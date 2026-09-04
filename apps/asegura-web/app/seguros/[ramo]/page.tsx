import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RAMOS, ramoPorSlug } from '@/lib/ramos'
import { url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import Formulario from '@/components/Formulario'

// Estáticas: son seis páginas de contenido que cambian cuando cambia el copy,
// no en cada visita. Generarlas en el build es más rápido y más barato.
export function generateStaticParams() {
  return RAMOS.map((r) => ({ ramo: r.slug }))
}

// 🚨 Cualquier slug que no esté en RAMOS es un 404, no una página vacía con el
// nombre puesto. Una página de ramo sin contenido posiciona mal y, peor, hace
// creer al visitante que ese ramo se trabaja cuando no se ha escrito nada.
export const dynamicParams = false

type Props = { params: Promise<{ ramo: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ramo: slug } = await params
  const ramo = ramoPorSlug(slug)
  if (!ramo) return {}
  return {
    title: ramo.title,
    description: ramo.description,
    alternates: { canonical: url(`/seguros/${ramo.slug}`) },
    openGraph: {
      title: ramo.title,
      description: ramo.description,
      url: url(`/seguros/${ramo.slug}`),
      type: 'article',
    },
  }
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '20px',
}

export default async function PaginaRamo({ params }: Props) {
  const { ramo: slug } = await params
  const ramo = ramoPorSlug(slug)
  if (!ramo) notFound()

  const faq = fichaFaq(ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: ramo.nombre, ruta: `/seguros/${ramo.slug}` },
  ])

  return (
    <>
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> {ramo.nombre}
      </nav>

      <h1>{ramo.h1}</h1>
      {ramo.intro.map((p) => (
        <p key={p} style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
          {p}
        </p>
      ))}

      <section aria-labelledby="mirar" style={{ ...panel, margin: '24px 0' }}>
        <h2 id="mirar">Qué miramos contigo</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {ramo.cubre.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="para-quien" style={{ marginBottom: 24 }}>
        <h2 id="para-quien">Esta página es para ti si…</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {ramo.paraQuien.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq" style={{ marginBottom: 28 }}>
        <h2 id="faq">Preguntas frecuentes</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {ramo.faq.map((f) => (
            // Abierto por defecto: el contenido de un FAQ es lo que Google lee y
            // lo que responde la duda. Esconderlo tras un clic no ayuda a nadie.
            <details key={f.pregunta} open style={{ ...panel, padding: '14px 16px' }}>
              <summary style={{ fontWeight: 700, cursor: 'pointer', minHeight: 28 }}>{f.pregunta}</summary>
              <p style={{ margin: '10px 0 0', color: 'var(--muted)' }}>{f.respuesta}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="presupuesto" aria-labelledby="pedir" style={panel}>
        <h2 id="pedir">Que te llamemos</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Sin compromiso y sin coste. Te contesta una persona.
        </p>
        <Formulario ramoPorDefecto={ramo.slug === 'vida-y-salud' ? 'vida' : ramo.slug === 'responsabilidad-civil' ? 'comercio' : ramo.slug} />
      </section>
    </>
  )
}
