// Un artículo del blog.
//
// El contenido vive en `lib/articulos.ts` (datos, no JSX) y de ahí salen a la
// vez la página y su JSON-LD: escribirlo dos veces es garantizar que un día
// digan cosas distintas.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ARTICULOS, articuloPorSlug } from '@/lib/articulos'
import { ramoPorSlug } from '@/lib/ramos'
import { url } from '@/lib/sitio'
import { fichaArticulo, fichaFaq, migas, jsonLd } from '@/lib/seo'

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = articuloPorSlug(slug)
  if (!a) return {}
  return {
    title: a.title,
    description: a.description,
    alternates: { canonical: url(`/blog/${a.slug}`) },
    openGraph: {
      type: 'article',
      title: a.title,
      description: a.description,
      url: url(`/blog/${a.slug}`),
      publishedTime: a.fecha,
      ...(a.revisado ? { modifiedTime: a.revisado } : {}),
    },
  }
}

function fechaLegible(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export default async function ArticuloPagina({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = articuloPorSlug(slug)
  if (!a) notFound()

  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Guías', ruta: '/blog' },
    { nombre: a.h1, ruta: `/blog/${a.slug}` },
  ])
  // El `FAQPage` reutiliza el mismo constructor que los ramos: las preguntas
  // son del mismo tipo y no hay motivo para tener dos.
  const faq = a.faq ? fichaFaq({ faq: a.faq } as Parameters<typeof fichaFaq>[0]) : null

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaArticulo(a)) }} />

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> <Link href="/blog">Guías</Link>{' '}
        <span aria-hidden>›</span> {a.title}
      </nav>

      <article style={{ maxWidth: 680 }}>
        <h1>{a.h1}</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 20px' }}>
          <time dateTime={a.fecha}>{fechaLegible(a.fecha)}</time>
          {a.revisado && <> · revisado el <time dateTime={a.revisado}>{fechaLegible(a.revisado)}</time></>}
        </p>

        <p style={{ fontSize: 18, lineHeight: 1.6 }}>{a.resumen}</p>

        {a.secciones.map((s) => (
          <section key={s.titulo}>
            <h2 style={{ marginTop: 32 }}>{s.titulo}</h2>
            {s.parrafos.map((p) => (
              <p key={p} style={{ lineHeight: 1.7 }}>{p}</p>
            ))}
          </section>
        ))}

        {a.faq && a.faq.length > 0 && (
          <section>
            <h2 style={{ marginTop: 40 }}>Preguntas frecuentes</h2>
            {a.faq.map((f) => (
              <div key={f.pregunta} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 17, margin: '0 0 6px' }}>{f.pregunta}</h3>
                <p style={{ margin: 0, lineHeight: 1.7 }}>{f.respuesta}</p>
              </div>
            ))}
          </section>
        )}

        {/* 📌 Las normas citadas, a la vista. No es un pie de página legal: es
            lo que permite a quien lee comprobar lo que acaba de leer, y es la
            diferencia entre un artículo de un corredor y uno de un comparador. */}
        {a.base && a.base.length > 0 && (
          <section
            style={{
              marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)',
              fontSize: 14, color: 'var(--muted)',
            }}
          >
            <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Normativa citada</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {a.base.map((b) => <li key={b} style={{ marginBottom: 4 }}>{b}</li>)}
            </ul>
            <p style={{ marginTop: 12 }}>
              Este artículo informa con carácter general y no sustituye al análisis de tu póliza concreta.
            </p>
          </section>
        )}

        {/* Enlazado interno: el peso de esta página viaja a los ramos que trata,
            y al revés (su página de ramo enlaza aquí). */}
        {a.ramos && a.ramos.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 17 }}>Seguros de los que habla este artículo</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {a.ramos.map((slug) => {
                const r = ramoPorSlug(slug)
                if (!r) return null
                return (
                  <li key={slug} style={{ marginBottom: 4 }}>
                    <Link href={`/seguros/${r.slug}`}>{r.nombre}</Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </article>
    </div>
  )
}
