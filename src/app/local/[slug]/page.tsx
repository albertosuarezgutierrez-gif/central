// app/local/[slug]/page.tsx
// Web pública del restaurante — sin autenticación, ISR 1h

import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

async function getWebData(slug: string) {
  const supabase = createServerClient()

  const { data: web } = await supabase
    .from('web_restaurante')
    .select('*, restaurantes(nombre, direccion, ciudad, telefono)')
    .eq('slug', slug)
    .eq('activa', true)
    .maybeSingle()

  if (!web) return null

  let carta: any[] = []
  if (web.mostrar_carta) {
    const { data: productos } = await supabase
      .from('productos')
      .select('nombre, descripcion, precio, categoria')
      .eq('restaurante_id', web.restaurante_id)
      .eq('activo', true)
      .order('categoria')
    carta = productos ?? []
  }

  // Contar visita (fire & forget)
  supabase
    .from('web_restaurante')
    .update({ visitas_total: (web.visitas_total ?? 0) + 1 })
    .eq('id', web.id)
    .then(() => {})

  return { web, carta }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getWebData(slug)
  if (!result) return {}
  const { web } = result
  const nombre = (web.restaurantes as any)?.nombre ?? slug
  return {
    title: web.seo_title ?? `${nombre} — Restaurante`,
    description: web.seo_description ?? web.descripcion_local ?? `Visita ${nombre}`,
    openGraph: {
      title: web.seo_title ?? nombre,
      description: web.seo_description ?? web.descripcion_local ?? '',
      ...(web.foto_portada_url ? { images: [web.foto_portada_url] } : {}),
    },
  }
}

export default async function WebRestaurantePage({ params }: Props) {
  const { slug } = await params
  const result = await getWebData(slug)
  if (!result) notFound()

  const { web, carta } = result
  const rest = web.restaurantes as any
  const nombre = rest?.nombre ?? slug
  const acento = web.color_acento ?? '#D9442B'

  const cartaPorCat = carta.reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.categoria ?? 'Otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
  const horarios = dias.map(d => ({ dia: d, hora: (web as any)[`horario_${d}`] })).filter(h => h.hora)
  const redes: Record<string, string> = web.redes_sociales ?? {}

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,600;1,400&family=Inter+Tight:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #FAFAF8; color: #1A1714; font-family: 'Inter Tight', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
          a { color: inherit; text-decoration: none; }
          .acento { color: ${acento}; }
          .btn-cta { background: ${acento}; color: #fff; border: none; border-radius: 10px; padding: 13px 26px; font-family: 'Inter Tight', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; display: inline-block; transition: opacity .15s; }
          .btn-cta:hover { opacity: .88; }
          .btn-dark { background: #1A1714; color: #F6F1E7; }
          .max { max-width: 680px; margin: 0 auto; padding: 0 20px; }
          .sec { padding: 44px 0; }
          hr.rule { border: none; border-top: 1px solid #E8E0D0; margin: 8px 0; }
        ` }} />
      </head>
      <body>

        {/* HERO */}
        {web.foto_portada_url ? (
          <div style={{ width: '100%', height: 300, background: `url(${web.foto_portada_url}) center/cover`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,.55) 100%)' }} />
            <div className="max" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 28 }}>
              {web.logo_url && (
                <img src={web.logo_url} alt={nombre} style={{ height: 52, objectFit: 'contain', marginBottom: 10, filter: 'brightness(0) invert(1)', maxWidth: 180 }} />
              )}
              {!web.logo_url && (
                <h1 style={{ fontFamily: 'Newsreader', fontSize: 40, fontWeight: 600, color: '#fff', lineHeight: 1.15 }}>{nombre}</h1>
              )}
              {web.frase_bienvenida && (
                <p style={{ color: 'rgba(255,255,255,.8)', marginTop: 8, fontSize: 16, fontStyle: 'italic' }}>{web.frase_bienvenida}</p>
              )}
            </div>
          </div>
        ) : (
          <header style={{ background: '#1A1714', padding: '44px 0' }}>
            <div className="max" style={{ textAlign: 'center' }}>
              {web.logo_url
                ? <img src={web.logo_url} alt={nombre} style={{ height: 64, objectFit: 'contain', marginBottom: 12, filter: 'brightness(0) invert(1)', maxWidth: 200 }} />
                : <h1 style={{ fontFamily: 'Newsreader', fontSize: 38, fontWeight: 600, color: '#F6F1E7' }}>{nombre}</h1>
              }
              {web.frase_bienvenida && (
                <p style={{ color: '#D8CDB6', marginTop: 10, fontSize: 16, fontStyle: 'italic' }}>{web.frase_bienvenida}</p>
              )}
            </div>
          </header>
        )}

        {/* DESCRIPCIÓN */}
        {(web.descripcion_local || web.descripcion_barrio) && (
          <div className="max sec" style={{ paddingBottom: 0 }}>
            {web.descripcion_local && (
              <p style={{ fontSize: 17, lineHeight: 1.75, color: '#2A2218', marginBottom: web.descripcion_barrio ? 14 : 0 }}>
                {web.descripcion_local}
              </p>
            )}
            {web.descripcion_barrio && (
              <p style={{ fontSize: 14, lineHeight: 1.65, color: '#7A6A5A' }}>{web.descripcion_barrio}</p>
            )}
          </div>
        )}

        {/* RESERVAS */}
        {web.mostrar_reservas && (web.telefono_reservas || web.url_reserva_directa) && (
          <div className="max" style={{ padding: '0 20px' }}>
            <div id="reservar" style={{
              background: '#F6F1E7', borderRadius: 16,
              padding: '36px 28px', margin: '36px 0',
              textAlign: 'center'
            }}>
              <h2 style={{ fontFamily: 'Newsreader', fontSize: 26, marginBottom: 6 }}>Reserva tu mesa</h2>
              <p style={{ color: '#8A7A5A', fontSize: 14, marginBottom: 24 }}>Reserva directa, sin comisiones</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {web.telefono_reservas && (
                  <a href={`tel:${web.telefono_reservas}`} className="btn-cta">
                    📞 Llamar para reservar
                  </a>
                )}
                {web.url_reserva_directa && (
                  <a href={web.url_reserva_directa} className="btn-cta btn-dark">
                    Reservar online
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CARTA */}
        {web.mostrar_carta && Object.keys(cartaPorCat).length > 0 && (
          <div className="max sec">
            <h2 style={{ fontFamily: 'Newsreader', fontSize: 28, marginBottom: 28 }}>Nuestra carta</h2>
            {Object.entries(cartaPorCat).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 32 }}>
                <p className="acento" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                  {cat}
                </p>
                {(items as any[]).map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{p.nombre}</span>
                      {p.descripcion && (
                        <p style={{ fontSize: 12, color: '#9A8A7A', marginTop: 2 }}>{p.descripcion}</p>
                      )}
                    </div>
                    {p.precio != null && (
                      <span style={{ fontWeight: 600, fontSize: 15, marginLeft: 16, whiteSpace: 'nowrap' }}>
                        {Number(p.precio).toFixed(2)} €
                      </span>
                    )}
                    <hr className="rule" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* HORARIOS */}
        {horarios.length > 0 && (
          <div className="max sec" style={{ paddingTop: 0 }}>
            <hr style={{ border: 'none', borderTop: '1px solid #E8E0D0', margin: '0 0 28px' }} />
            <h2 style={{ fontFamily: 'Newsreader', fontSize: 24, marginBottom: 16 }}>Horarios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 32px' }}>
              {horarios.map(({ dia, hora }) => (
                <div key={dia} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #EDE5D8' }}>
                  <span style={{ fontSize: 14, textTransform: 'capitalize', color: '#5A4A3A' }}>{dia}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{hora}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* UBICACIÓN */}
        {(rest?.direccion || web.url_google_maps) && (
          <div className="max sec" style={{ paddingTop: horarios.length > 0 ? 0 : undefined }}>
            {horarios.length > 0 && <div style={{ height: 28 }} />}
            <h2 style={{ fontFamily: 'Newsreader', fontSize: 24, marginBottom: 10 }}>Cómo llegar</h2>
            {rest?.direccion && (
              <p style={{ fontSize: 15, color: '#4A3728', marginBottom: 14 }}>
                {rest.direccion}{rest.ciudad ? `, ${rest.ciudad}` : ''}
              </p>
            )}
            {web.url_google_maps && (
              <a href={web.url_google_maps} target="_blank" rel="noopener noreferrer"
                className="btn-cta" style={{ fontSize: 13, padding: '10px 20px' }}>
                Ver en Google Maps
              </a>
            )}
          </div>
        )}

        {/* REDES */}
        {Object.values(redes).some(Boolean) && (
          <div className="max sec" style={{ paddingTop: 0, paddingBottom: 16 }}>
            <hr style={{ border: 'none', borderTop: '1px solid #E8E0D0', marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {redes.instagram && (
                <a href={`https://instagram.com/${redes.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#7A6A5A', fontWeight: 500 }}>Instagram</a>
              )}
              {redes.facebook && (
                <a href={redes.facebook} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#7A6A5A', fontWeight: 500 }}>Facebook</a>
              )}
              {redes.tiktok && (
                <a href={`https://tiktok.com/@${redes.tiktok.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#7A6A5A', fontWeight: 500 }}>TikTok</a>
              )}
              {redes.tripadvisor && (
                <a href={redes.tripadvisor} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#7A6A5A', fontWeight: 500 }}>TripAdvisor</a>
              )}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <footer style={{ background: '#1A1714', padding: '24px 20px', textAlign: 'center', marginTop: 40 }}>
          <p style={{ fontFamily: 'Inter Tight', fontSize: 12, color: '#4A3A2A' }}>
            Web gestionada con{' '}
            <a href="https://www.iarest.es" target="_blank" rel="noopener noreferrer"
              style={{ color: acento, fontWeight: 600 }}>
              ia.rest
            </a>
            {' '}· Sistema de gestión inteligente para hostelería
          </p>
        </footer>

      </body>
    </html>
  )
}
