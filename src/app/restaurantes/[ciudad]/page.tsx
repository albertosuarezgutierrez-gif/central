// app/restaurantes/[ciudad]/page.tsx
// Directorio de restaurantes por ciudad — SEO: "restaurantes en Sevilla"

import { createServerClient } from '@/lib/supabase'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const revalidate = 3600

interface Props { params: Promise<{ ciudad: string }> }

function deslugify(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

async function getRestaurantesCiudad(ciudadSlug: string) {
  const supabase = createServerClient()

  // Buscar restaurantes cuya ciudad normalizada coincida
  const { data } = await supabase
    .from('web_restaurante')
    .select(`
      slug, descripcion_local, logo_url, foto_portada_url, color_acento,
      restaurantes(nombre, ciudad, tipo_cocina, tipo_negocio, latitud, longitud)
    `)
    .eq('activa', true)
    .not('slug', 'is', null)
    .order('visitas_total', { ascending: false })

  // Filtrar por ciudad normalizada
  const filtrados = (data ?? []).filter(r => {
    const ciudad = (r.restaurantes as any)?.ciudad ?? ''
    const normalizada = ciudad.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    return normalizada === ciudadSlug
  })

  return filtrados
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ciudad } = await params
  const nombreCiudad = deslugify(ciudad)
  return {
    title: `Restaurantes en ${nombreCiudad} — ia.rest`,
    description: `Descubre los mejores restaurantes en ${nombreCiudad} con carta digital y reserva directa sin comisiones. Reserva tu mesa online.`,
    openGraph: {
      title: `Restaurantes en ${nombreCiudad}`,
      description: `Los mejores restaurantes de ${nombreCiudad} con reserva directa.`,
    },
    alternates: { canonical: `https://www.iarest.es/restaurantes/${ciudad}` },
  }
}

export default async function CiudadPage({ params }: Props) {
  const { ciudad } = await params
  const nombreCiudad = deslugify(ciudad)
  const restaurantes = await getRestaurantesCiudad(ciudad)

  if (restaurantes.length === 0) notFound()

  // Schema.org para la página de ciudad
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Restaurantes en ${nombreCiudad}`,
    description: `Restaurantes con reserva directa en ${nombreCiudad}`,
    numberOfItems: restaurantes.length,
    itemListElement: restaurantes.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Restaurant',
        name: (r.restaurantes as any)?.nombre,
        url: `https://www.iarest.es/local/${r.slug}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: nombreCiudad,
          addressCountry: 'ES',
        },
        ...((r.restaurantes as any)?.latitud ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: (r.restaurantes as any).latitud,
            longitude: (r.restaurantes as any).longitud,
          }
        } : {})
      }
    }))
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div style={{ background: '#FAF7F2', minHeight: '100vh', fontFamily: "'Inter Tight', system-ui, sans-serif" }}>

        {/* Header */}
        <header style={{ background: '#1A1714', padding: '0' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, color: '#F6F1E7', fontWeight: 600 }}>ia.rest</span>
            </Link>
            <Link href="/registro" style={{ background: '#D9442B', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Empieza gratis
            </Link>
          </div>
        </header>

        {/* Hero */}
        <div style={{ background: '#1A1714', padding: '48px 24px 60px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <Link href="/restaurantes" style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#D9442B', textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
              ← Todos los restaurantes
            </Link>
            <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 42, color: '#F6F1E7', fontWeight: 600, lineHeight: 1.1, marginBottom: 14 }}>
              Restaurantes en<br />{nombreCiudad}
            </h1>
            <p style={{ fontSize: 15, color: '#8A7A6A', lineHeight: 1.7 }}>
              {restaurantes.length} restaurante{restaurantes.length !== 1 ? 's' : ''} con carta digital y reserva directa sin comisiones
            </p>
          </div>
        </div>

        <div style={{ height: 40, background: '#1A1714', clipPath: 'ellipse(55% 100% at 50% 0%)' }} />

        {/* Grid */}
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {restaurantes.map(r => {
              const rest = r.restaurantes as any
              const acento = r.color_acento ?? '#D9442B'
              return (
                <Link key={r.slug} href={`/local/${r.slug}`} style={{ textDecoration: 'none' }}>
                  <article style={{
                    background: '#fff', borderRadius: 16, overflow: 'hidden',
                    border: '1px solid #EDE5D8', height: '100%', display: 'flex', flexDirection: 'column'
                  }}>
                    {/* Imagen */}
                    <div style={{
                      height: 160, position: 'relative',
                      background: r.foto_portada_url
                        ? `url(${r.foto_portada_url}) center/cover`
                        : `linear-gradient(135deg, ${acento}18, ${acento}38)`,
                    }}>
                      {r.foto_portada_url && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.18)' }} />}
                      {r.logo_url && (
                        <div style={{ position: 'absolute', bottom: 14, left: 14, background: 'rgba(0,0,0,.55)', borderRadius: 8, padding: '6px 10px', backdropFilter: 'blur(8px)' }}>
                          <img src={r.logo_url} alt={rest?.nombre} style={{ height: 30, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 12, right: 12 }}>
                        <span style={{ background: acento, color: '#fff', borderRadius: 20, padding: '4px 11px', fontSize: 10, fontWeight: 700 }}>
                          Reserva directa
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, color: '#1A1714', fontWeight: 600, marginBottom: 8 }}>
                        {rest?.nombre ?? r.slug}
                      </h2>
                      {r.descripcion_local && (
                        <p style={{ fontSize: 13, color: '#7A6A5A', lineHeight: 1.65, marginBottom: 12, flex: 1,
                          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.descripcion_local}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                        {rest?.tipo_cocina && (
                          <span style={{ background: '#F6F1E7', border: '1px solid #EDE5D8', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#7A6A5A' }}>
                            {rest.tipo_cocina}
                          </span>
                        )}
                        <span style={{ background: acento + '18', border: `1px solid ${acento}33`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: acento, fontWeight: 600 }}>
                          Ver carta →
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        </main>

        {/* CTA */}
        <div style={{ background: '#1A1714', padding: '48px 24px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 28, color: '#F6F1E7', marginBottom: 10 }}>
              ¿Tienes un restaurante en {nombreCiudad}?
            </h2>
            <p style={{ fontSize: 14, color: '#8A7A6A', marginBottom: 24, lineHeight: 1.7 }}>
              Publíca tu web, gestiona tu sala con IA y recibe reservas directas sin comisiones.
            </p>
            <Link href="/registro" style={{ background: '#D9442B', color: '#fff', padding: '13px 30px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
              Empieza gratis
            </Link>
          </div>
        </div>

        <footer style={{ background: '#14110E', padding: '18px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#3A2A1A' }}>
            © {new Date().getFullYear()} <Link href="/" style={{ color: '#D9442B', textDecoration: 'none' }}>ia.rest</Link> · Sistema inteligente para hostelería
          </p>
        </footer>

      </div>
    </>
  )
}
