import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MEDIADOR, normaPorId, citaLegible } from '@central/module-seguros'
import { GESTOR } from '@/lib/gestor'
import { articuloPorSlug } from '@/lib/articulos'
import { PORTAL_URL, url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import CalculadoraVencimientos from '@/components/CalculadoraVencimientos'
import Reveal from '@/components/Reveal'

// La página de INTENCIÓN del gestor. El copy vive en `lib/gestor.ts` (datos,
// con su cepo); aquí solo se pinta. Lee la cabecera de ese fichero antes de
// cambiar una frase: cada una tiene que ser cierta sobre el portal de HOY.

export const metadata: Metadata = {
  title: GESTOR.title,
  description: GESTOR.description,
  alternates: { canonical: url(GESTOR.ruta) },
  openGraph: { title: GESTOR.title, description: GESTOR.description, url: url(GESTOR.ruta), type: 'website' },
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '20px',
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

/**
 * Ficha `SoftwareApplication` gratuita. Es lo que le dice a un buscador que
 * esto es una herramienta y no un artículo, y que su precio es 0. El nombre
 * y el operador salen de `MEDIADOR`, no se teclean.
 */
function fichaGestor(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `Gestor de seguros de ${MEDIADOR.marca}`,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: PORTAL_URL,
    description: GESTOR.description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    provider: { '@type': 'InsuranceAgency', name: MEDIADOR.marca, url: url('/') },
    featureList: GESTOR.funciones.map((f) => f.titulo),
  }
}

export default function PaginaGestor() {
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Gestor de seguros', ruta: GESTOR.ruta },
  ])
  const faq = fichaFaq({ faq: GESTOR.faq } as Parameters<typeof fichaFaq>[0])
  const guiaPreaviso = articuloPorSlug('preaviso-un-mes-no-renovar-seguro')
  const guiaBaja = articuloPorSlug('como-dar-de-baja-un-seguro-a-tiempo')

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaGestor()) }} />

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Gestor de seguros
      </nav>

      <div className="dos-columnas" style={{ alignItems: 'start' }}>
        <Reveal>
          <p className="antetitulo">Gratis, seas cliente o no</p>
          <h1>{GESTOR.h1}</h1>
          <p className="lead" style={{ marginTop: 16 }}>{GESTOR.lead}</p>
          <ul className="garantias" style={{ marginTop: 18 }}>
            {GESTOR.garantias.map((g) => (
              <li key={g}>
                <Check />
                {g}
              </li>
            ))}
          </ul>
          <div className="hero-cta" style={{ marginTop: 24 }}>
            <a href={PORTAL_URL} className="btn btn-brand">
              Crear mi área con mi correo
            </a>
            <a href="#como" className="btn btn-outline">
              Cómo funciona
            </a>
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <CalculadoraVencimientos />
        </Reveal>
      </div>

      <section id="como" aria-labelledby="como-t" style={{ marginTop: 40 }}>
        <h2 id="como-t">Cómo funciona</h2>
        <div className="pasos">
          {GESTOR.pasos.map((p, i) => (
            <div key={p.titulo} className="paso">
              <h3>
                {i + 1}. {p.titulo}
              </h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="funciones-t" style={{ marginTop: 40 }}>
        <h2 id="funciones-t">Qué tienes en tu área</h2>
        <div className="rejilla">
          {GESTOR.funciones.map((f) => (
            <div key={f.titulo} style={panel}>
              <h3 style={{ marginTop: 0 }}>{f.titulo}</h3>
              <p style={{ margin: 0, color: 'var(--muted)' }}>{f.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="privacidad-t" style={{ ...panel, marginTop: 40 }}>
        <h2 id="privacidad-t" style={{ marginTop: 0 }}>
          Lo que pasa con tus datos
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {GESTOR.privacidad.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="tenue" style={{ margin: '14px 0 0', fontSize: 14 }}>
          Quien responde de tus datos es {MEDIADOR.identidad.nombre}, corredor inscrito en la DGSFP con clave{' '}
          {MEDIADOR.identidad.claveDgsfp}. La política completa está en la propia área, antes de pedirte el
          correo.
        </p>
      </section>

      <section aria-labelledby="faq-t" style={{ marginTop: 40 }}>
        <h2 id="faq-t">Preguntas frecuentes</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {GESTOR.faq.map((f) => (
            <details key={f.pregunta} open style={{ ...panel, padding: '14px 16px' }}>
              <summary style={{ fontWeight: 700, cursor: 'pointer', minHeight: 28 }}>{f.pregunta}</summary>
              <p style={{ margin: '10px 0 0', color: 'var(--muted)' }}>{f.respuesta}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Enlazado interno hacia las guías que cuentan el porqué del plazo y
          hacia la página de cambio de correduría, que es la alternativa a
          cancelar. Y las normas citadas, comprobables, como en el blog. */}
      <section aria-labelledby="mas-t" style={{ marginTop: 40 }}>
        <h2 id="mas-t">Para leer antes de decidir</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {[guiaPreaviso, guiaBaja].map(
            (a) =>
              a && (
                <li key={a.slug}>
                  <Link href={`/blog/${a.slug}`}>{a.h1}</Link>
                </li>
              ),
          )}
          <li>
            <Link href="/cambiar-de-correduria">Cambiar de correduría sin cambiar de póliza</Link>
          </li>
        </ul>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 14, color: 'var(--muted)' }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Normativa citada</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {GESTOR.base.map((id) => {
              const n = normaPorId(id)
              if (!n) return null
              return (
                <li key={id}>
                  {citaLegible(n)}{' '}
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    Texto en el BOE
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 40, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Empieza con la póliza que tengas más a mano</h2>
        <p style={{ color: 'var(--muted)' }}>Entras con tu correo. Tres minutos, y la primera ya está leída.</p>
        <a href={PORTAL_URL} className="btn btn-brand" style={{ minHeight: 44 }}>
          Entrar a mi área
        </a>
      </section>
    </div>
  )
}
