// app/restaurantes/page.tsx
// Directorio público de restaurantes con web en ia.rest
// SEO: "restaurantes en Sevilla", "mejores restaurantes España"

import { createServerClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOverride } from '@/lib/seo/store'
import { SEO_DEFAULTS } from '@/lib/seo/targets'
import SeoBlocks from '@/components/seo/SeoBlocks'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const def = SEO_DEFAULTS['/restaurantes']
  const ov = await getOverride('/restaurantes')
  const title = ov?.title ?? def.title
  const description = ov?.description ?? def.description
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', ...(ov?.og ?? {}) },
    alternates: { canonical: ov?.canonical ?? 'https://www.iarest.es/restaurantes' },
    ...(ov?.jsonld ? { other: { 'script:ld+json': JSON.stringify(ov.jsonld) } } : {}),
  }
}

async function getRestaurantes() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('web_restaurante')
    .select(`
      slug, descripcion_local, logo_url, foto_portada_url, color_acento, template,
      restaurantes(nombre, ciudad, tipo_negocio)
    `)
    .eq('activa', true)
    .not('slug', 'is', null)
    .order('visitas_total', { ascending: false })

  return data ?? []
}

function slugCiudad(ciudad: string) {
  return ciudad.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export default async function DirectorioPage() {
  const restaurantes = await getRestaurantes()

  // Agrupar por ciudad
  const porCiudad: Record<string, typeof restaurantes> = {}
  restaurantes.forEach(r => {
    const ciudad = (r.restaurantes as any)?.ciudad ?? 'Otros'
    if (!porCiudad[ciudad]) porCiudad[ciudad] = []
    porCiudad[ciudad].push(r)
  })

  const ciudades = Object.keys(porCiudad).sort((a, b) =>
    porCiudad[b].length - porCiudad[a].length
  )

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Directorio de Restaurantes — ia.rest',
    description: 'Restaurantes con carta digital y reserva directa en España',
    numberOfItems: restaurantes.length,
    itemListElement: restaurantes.slice(0, 20).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Restaurant',
        name: (r.restaurantes as any)?.nombre,
        url: `https://www.iarest.es/r/${r.slug}`,
        address: { '@type': 'PostalAddress', addressLocality: (r.restaurantes as any)?.ciudad, addressCountry: 'ES' },
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
        <div style={{ background: '#1A1714', padding: '52px 24px 64px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: '#D9442B', marginBottom: 16 }}>Directorio</p>
            <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 44, color: '#F6F1E7', fontWeight: 600, lineHeight: 1.1, marginBottom: 16 }}>
              Restaurantes con<br />reserva directa
            </h1>
            <p style={{ fontSize: 16, color: '#8A7A6A', lineHeight: 1.7, marginBottom: 32 }}>
              {restaurantes.length > 0
                ? `${restaurantes.length} restaurante${restaurantes.length !== 1 ? 's' : ''} con carta digital y reserva sin comisiones`
                : 'Carta digital y reserva sin comisiones en los mejores restaurantes de España'
              }
            </p>
            {/* Filtros ciudad */}
            {ciudades.length > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {ciudades.map(c => (
                  <Link key={c} href={`/restaurantes/${slugCiudad(c)}`} style={{
                    background: 'rgba(255,255,255,.08)', color: '#D8CDB6', border: '1px solid rgba(255,255,255,.12)',
                    borderRadius: 20, padding: '6px 16px', fontSize: 13, textDecoration: 'none',
                    fontWeight: 500,
                  }}>
                    {c} <span style={{ opacity: .5, fontSize: 11 }}>({porCiudad[c].length})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Clip wave */}
        <div style={{ height: 40, background: '#1A1714', clipPath: 'ellipse(55% 100% at 50% 0%)' }} />

        {/* Listado */}
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px' }}>
          {restaurantes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9A8A7A' }}>
              <p style={{ fontSize: 16 }}>Próximamente más restaurantes</p>
            </div>
          ) : (
            <>
              {ciudades.map(ciudad => (
                <div key={ciudad} style={{ marginBottom: 52 }}>
                  {/* Cabecera ciudad */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, color: '#1A1714', fontWeight: 600 }}>{ciudad}</h2>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, #D8CDB6, transparent)' }} />
                    <Link href={`/restaurantes/${slugCiudad(ciudad)}`} style={{ fontSize: 12, color: '#D9442B', textDecoration: 'none', fontWeight: 600 }}>
                      Ver todos →
                    </Link>
                  </div>

                  {/* Grid restaurantes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {porCiudad[ciudad].map(r => {
                      const rest = r.restaurantes as any
                      const acento = r.color_acento ?? '#D9442B'
                      return (
                        <Link key={r.slug} href={`/r/${r.slug}`} style={{ textDecoration: 'none' }}>
                          <article style={{
                            background: '#fff', borderRadius: 14, overflow: 'hidden',
                            border: '1px solid #EDE5D8', transition: 'transform .15s, box-shadow .15s',
                            display: 'flex', flexDirection: 'column',
                          }}>
                            {/* Imagen / color */}
                            <div style={{
                              height: 120, position: 'relative', overflow: 'hidden',
                              background: r.foto_portada_url ? `url(${r.foto_portada_url}) center/cover` : `linear-gradient(135deg, ${acento}22, ${acento}44)`,
                            }}>
                              {r.foto_portada_url && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.2)' }} />}
                              {r.logo_url && (
                                <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,.5)', borderRadius: 8, padding: '4px 8px', backdropFilter: 'blur(8px)' }}>
                                  <img src={r.logo_url} alt={rest?.nombre} style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                                </div>
                              )}
                              <div style={{ position: 'absolute', top: 10, right: 10, background: acento, borderRadius: 20, padding: '3px 10px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>Reserva directa</span>
                              </div>
                            </div>

                            {/* Info */}
                            <div style={{ padding: '14px 16px 16px', flex: 1 }}>
                              <h3 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, color: '#1A1714', fontWeight: 600, marginBottom: 6 }}>
                                {rest?.nombre ?? r.slug}
                              </h3>
                              {r.descripcion_local && (
                                <p style={{ fontSize: 13, color: '#7A6A5A', lineHeight: 1.6, marginBottom: 10,
                                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                  {r.descripcion_local}
                                </p>
                              )}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {rest?.tipo_negocio && (
                                  <span style={{ background: '#F6F1E7', border: '1px solid #EDE5D8', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#7A6A5A', fontWeight: 500 }}>
                                    {rest.tipo_negocio}
                                  </span>
                                )}
                                <span style={{ background: '#F6F1E7', border: '1px solid #EDE5D8', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#7A6A5A', fontWeight: 500 }}>
                                  {rest?.ciudad}
                                </span>
                              </div>
                            </div>
                          </article>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </main>

        {/* CTA operadores */}
        <div style={{ background: '#1A1714', padding: '52px 24px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 30, color: '#F6F1E7', marginBottom: 12 }}>
              ¿Tienes un restaurante?
            </h2>
            <p style={{ fontSize: 15, color: '#8A7A6A', marginBottom: 28, lineHeight: 1.7 }}>
              Gestiona tu sala con IA, publica tu web incluida y recibe reservas directas sin comisiones.
            </p>
            <Link href="/registro" style={{ background: '#D9442B', color: '#fff', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
              Empieza gratis 14 días
            </Link>
          </div>
        </div>

        {/* Bloques SEO editables por el agente */}
        <SeoBlocks ruta="/restaurantes" />

        <footer style={{ background: '#14110E', padding: '20px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#3A2A1A' }}>
            © {new Date().getFullYear()} ia.rest · Sistema de gestión inteligente para hostelería
          </p>
        </footer>

      </div>
    </>
  )
}
