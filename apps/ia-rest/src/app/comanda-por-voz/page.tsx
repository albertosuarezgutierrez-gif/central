import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Comanda por voz para restaurantes y bares | ia.rest',
  description: 'Toma comandas en tu restaurante hablando. Sin libreta, sin TPV táctil, sin errores. ia.rest transcribe la voz del camarero y la manda a cocina en menos de 0,5 segundos. Prueba gratis 14 días.',
  alternates: { canonical: 'https://www.iarest.es/comanda-por-voz' },
  keywords: [
    'comanda por voz', 'comandas por voz restaurante', 'tpv por voz', 'tpv con voz',
    'tomar comanda hablando', 'comanda sin libreta', 'comandero por voz',
    'software voz restaurante', 'tpv inteligencia artificial hosteleria',
    'voice pos hosteleria', 'camarero ia', 'pedidos por voz restaurante',
    'reducir errores comanda', 'comanda rapida restaurante',
  ],
  openGraph: {
    title: 'Comanda por voz para restaurantes — ia.rest',
    description: 'El camarero habla. Cocina recibe. Sin tocar pantalla. ia.rest transforma la voz en comandas en menos de 0,5 segundos.',
    url: 'https://www.iarest.es/comanda-por-voz',
    type: 'website',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'ia.rest — Comanda por voz para hostelería' }],
  },
}

const jsonLdFaq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '¿Cómo funciona la comanda por voz en ia.rest?',
      acceptedAnswer: { '@type': 'Answer', text: 'El camarero mantiene pulsado el botón PTT (pulsar para hablar) y dicta la comanda en voz natural: "dos de la casa, un agua sin gas, el del cuatro sin sal". ia.rest transcribe la voz con Whisper, la estructura con IA y la envía al KDS de cocina en menos de 0,5 segundos. Sin libreta, sin pantalla táctil, sin errores de transcripción.' }
    },
    {
      '@type': 'Question',
      name: '¿Funciona con acento andaluz, catalán o canario?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. El motor de voz está entrenado con vocabulario hostelero real en español: marchar, 86, sin, para llevar, la dos, media ración... Funciona con todos los acentos regionales y mejora con el uso.' }
    },
    {
      '@type': 'Question',
      name: '¿Qué pasa si hay ruido en la sala?',
      acceptedAnswer: { '@type': 'Answer', text: 'ia.rest incluye detección de ruido en 4 capas. Si detecta una transcripción poco fiable, avisa al camarero y le pide que repita la comanda. En la práctica, la tasa de error es inferior al 2% incluso en servicios con mucho ruido ambiente.' }
    },
    {
      '@type': 'Question',
      name: '¿Necesito hardware especial para usar la comanda por voz?',
      acceptedAnswer: { '@type': 'Answer', text: 'Solo necesitas un smartphone Android (recomendamos Samsung Galaxy A15 5G desde 180 €) y auriculares con micrófono si el ruido es muy elevado. Sin terminales propietarios, sin licencias de hardware.' }
    },
    {
      '@type': 'Question',
      name: '¿La comanda por voz funciona sin internet?',
      acceptedAnswer: { '@type': 'Answer', text: 'La transcripción requiere conexión (Groq Whisper en cloud). Si la fibra falla, ia.rest continúa operativo en modo manual. Recomendamos un router con SIM 4G de backup como el Teltonika RUT951 (~120 €) para garantizar disponibilidad 99,9%.' }
    },
  ],
}

export default function ComandaPorVoz() {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714', fontFamily: SN }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, background: 'rgba(246,241,231,0.95)',
        backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(26,23,20,0.08)',
        padding: '0 24px', height: 60, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', zIndex: 100,
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: '#1A1714' }}>
            ia<span style={{ color: '#D9442B' }}>.</span>rest
          </span>
        </a>
        <a href="/registro" style={{
          background: '#D9442B', color: '#fff', textDecoration: 'none',
          padding: '8px 20px', borderRadius: 100, fontSize: 13, fontWeight: 600,
        }}>
          Probar gratis 14 días
        </a>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: 760, margin: '0 auto', padding: '72px 24px 56px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#D9442B10', border: '1px solid #D9442B30',
          borderRadius: 100, padding: '5px 14px 5px 8px', marginBottom: 28,
        }}>
          <span style={{
            background: '#D9442B', color: '#fff', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 100, fontFamily: SM,
          }}>Nuevo</span>
          <span style={{ fontSize: 13, color: '#6B5F52' }}>Voice POS para hostelería española</span>
        </div>

        <h1 style={{
          fontFamily: SE, fontStyle: 'italic',
          fontSize: 'clamp(42px, 7vw, 72px)',
          fontWeight: 400, lineHeight: 1.05,
          letterSpacing: '-0.03em', color: '#1A1714',
          margin: '0 0 24px',
        }}>
          Comanda por voz.<br />
          <span style={{ color: '#D9442B' }}>Sin libreta. Sin errores.</span>
        </h1>

        <p style={{
          fontSize: 19, lineHeight: 1.7, color: '#3A332C',
          maxWidth: 560, margin: '0 auto 36px',
        }}>
          El camarero habla. ia.rest transcribe la comanda y la manda a cocina en{' '}
          <strong style={{ color: '#1A1714' }}>menos de 0,5 segundos</strong>.
          Sin tocar pantalla. Sin errores de anotación. Sin vuelta a la barra.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/registro" style={{
            background: '#D9442B', color: '#fff', textDecoration: 'none',
            padding: '15px 32px', borderRadius: 100, fontSize: 16, fontWeight: 700,
            boxShadow: 'rgba(217,68,43,0.45) 0 8px 28px -6px',
          }}>
            Empezar prueba gratis →
          </a>
          <a href="#como-funciona" style={{
            background: 'transparent', color: '#1A1714', textDecoration: 'none',
            padding: '15px 28px', borderRadius: 100, fontSize: 16, fontWeight: 500,
            border: '1px solid rgba(26,23,20,0.18)',
          }}>
            Ver cómo funciona
          </a>
        </div>

        <p style={{ marginTop: 16, fontSize: 13, color: '#9A8D7C', fontFamily: SM }}>
          14 días gratis · Sin tarjeta · Sin instalador
        </p>
      </section>

      {/* Demo visual */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 72px' }}>
        <div style={{
          background: '#1A1714', borderRadius: 16, padding: '32px',
          border: '1px solid rgba(246,241,231,0.08)',
        }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
            <span style={{ fontSize: 11, color: '#6B5F52', fontFamily: SM, marginLeft: 8 }}>ia.rest — camarero sala</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0 }}>
            {/* Camarero */}
            <div style={{ paddingRight: 24 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B5F52', fontFamily: SM, margin: '0 0 16px' }}>🎙️ CAMARERO dice</p>
              <div style={{
                background: 'rgba(217,68,43,0.12)', border: '1px solid rgba(217,68,43,0.25)',
                borderRadius: 10, padding: '14px 16px', marginBottom: 12,
              }}>
                <p style={{ margin: 0, fontSize: 14, color: '#F6F1E7', fontFamily: SM, lineHeight: 1.5, fontStyle: 'italic' }}>
                  &ldquo;Mesa cuatro: dos de la casa, un agua sin gas, el del cuatro sin sal ojo&rdquo;
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6B5F52' }}>⏱ 4 segundos · PTT pulsado</p>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: '#3F7D44', fontFamily: SM,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3F7D44', display: 'inline-block' }} />
                Transcrito · Estructurado · Enviado
              </div>
            </div>

            {/* Divider */}
            <div style={{ background: 'rgba(246,241,231,0.08)' }} />

            {/* KDS */}
            <div style={{ paddingLeft: 24 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B5F52', fontFamily: SM, margin: '0 0 16px' }}>📺 COCINA ve</p>
              {[
                { n: 2, item: 'Menú del día', nota: null },
                { n: 1, item: 'Agua sin gas', nota: null },
                { n: 1, item: 'Menú del día', nota: '⚠️ Sin sal' },
              ].map((p, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '8px 0', borderBottom: i < 2 ? '1px solid rgba(246,241,231,0.06)' : 'none',
                }}>
                  <span style={{
                    background: '#D9442B', color: '#fff', fontSize: 12, fontWeight: 700,
                    width: 22, height: 22, borderRadius: 6, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{p.n}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: '#F6F1E7', fontWeight: 500 }}>{p.item}</p>
                    {p.nota && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#E8A33B' }}>{p.nota}</p>}
                  </div>
                </div>
              ))}
              <p style={{ margin: '12px 0 0', fontSize: 11, color: '#3F7D44', fontFamily: SM }}>✓ Llegado en 0,4s · Mesa 4</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 72px' }}>
        <h2 style={{
          fontFamily: SE, fontStyle: 'italic', fontSize: 36, color: '#1A1714',
          margin: '0 0 40px', textAlign: 'center',
        }}>
          Cómo funciona la comanda por voz
        </h2>

        {[
          {
            n: '01', titulo: 'El camarero pulsa PTT y habla',
            desc: 'Nada de abrir apps ni buscar platos. El camarero mantiene pulsado el botón y dicta: "dos de la casa, el del ocho sin gluten, para la seis". Cuatro segundos.',
          },
          {
            n: '02', titulo: 'ia.rest transcribe y estructura',
            desc: 'Groq Whisper convierte la voz en texto en menos de 200ms. La IA identifica productos, cantidades, modificaciones y alérgenos. Si hay ruido o ambigüedad, pide confirmación.',
          },
          {
            n: '03', titulo: 'La comanda llega a cocina',
            desc: 'En 0,4 segundos el KDS de cocina muestra la comanda, con alérgenos destacados en ámbar y los platos ordenados por partida. El camarero ya puede atender la siguiente mesa.',
          },
          {
            n: '04', titulo: 'Cierre, cobro y VeriFactu automático',
            desc: 'Cuando la mesa pide la cuenta, el camarero dice "cuenta mesa cuatro". ia.rest genera el ticket con hash SHA-256 (VeriFactu) y el camarero cobra con tarjeta o Bizum.',
          },
        ].map((s) => (
          <div key={s.n} style={{
            display: 'flex', gap: 20, padding: '24px 0',
            borderBottom: '1px solid rgba(26,23,20,0.08)',
          }}>
            <span style={{
              fontFamily: SM, fontSize: 13, color: '#D9442B', fontWeight: 700,
              minWidth: 32, paddingTop: 2,
            }}>{s.n}</span>
            <div>
              <h3 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: '#1A1714', margin: '0 0 8px' }}>{s.titulo}</h3>
              <p style={{ margin: 0, fontSize: 15, color: '#3A332C', lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Ventajas */}
      <section style={{ background: '#1A1714', padding: '72px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 36, color: '#F6F1E7',
            margin: '0 0 48px', textAlign: 'center',
          }}>
            Por qué la comanda por voz cambia el servicio
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {[
              { stat: '−85%', label: 'Errores de comanda', sub: 'vs libreta manual' },
              { stat: '4 seg', label: 'Tiempo por comanda', sub: 'vs 40 seg en TPV táctil' },
              { stat: '+30%', label: 'Mesas por turno', sub: 'en locales de alta rotación' },
              { stat: '0€', label: 'Coste de hardware extra', sub: 'usa el móvil del camarero' },
            ].map((v) => (
              <div key={v.stat} style={{
                background: 'rgba(246,241,231,0.05)', borderRadius: 10,
                padding: '24px 20px', textAlign: 'center',
                border: '1px solid rgba(246,241,231,0.08)',
              }}>
                <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 40, color: '#D9442B', margin: '0 0 6px' }}>{v.stat}</p>
                <p style={{ fontSize: 14, color: '#F6F1E7', fontWeight: 600, margin: '0 0 4px' }}>{v.label}</p>
                <p style={{ fontSize: 12, color: '#9A8D7C', margin: 0 }}>{v.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '72px 24px' }}>
        <h2 style={{
          fontFamily: SE, fontStyle: 'italic', fontSize: 32, color: '#1A1714',
          margin: '0 0 40px', textAlign: 'center',
        }}>
          Preguntas frecuentes sobre la comanda por voz
        </h2>
        {[
          {
            q: '¿Funciona con acento andaluz, catalán o canario?',
            a: 'Sí. El motor de voz está entrenado con vocabulario hostelero real en español. Funciona con todos los acentos regionales y mejora con el uso.',
          },
          {
            q: '¿Qué pasa si hay mucho ruido en la sala?',
            a: 'ia.rest incluye detección de ruido en 4 capas. Si detecta una transcripción poco fiable, avisa al camarero para que repita. En la práctica, la tasa de error es inferior al 2% incluso en servicios con mucho ruido.',
          },
          {
            q: '¿Necesito hardware especial?',
            a: 'Solo un smartphone Android (desde 180 €). Sin terminales propietarios, sin licencias de hardware. Los auriculares con micrófono mejoran la experiencia en ambientes muy ruidosos.',
          },
          {
            q: '¿Cómo dicta el camarero los alérgenos?',
            a: 'Naturalmente: "sin gluten", "sin sal", "sin lactosa", "ojo alergia mariscos". ia.rest los detecta y los marca en ámbar en el KDS para que cocina los vea de forma destacada.',
          },
          {
            q: '¿Funciona si se cae el WiFi del restaurante?',
            a: 'La transcripción necesita conexión. Recomendamos un router con SIM 4G de backup (Teltonika RUT951, ~120 €) para garantizar disponibilidad 99,9%. Con failover automático <30 segundos, ia.rest no se interrumpe.',
          },
        ].map((faq, i) => (
          <div key={i} style={{
            padding: '20px 0', borderBottom: '1px solid rgba(26,23,20,0.08)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1A1714', margin: '0 0 8px' }}>{faq.q}</h3>
            <p style={{ margin: 0, fontSize: 15, color: '#3A332C', lineHeight: 1.7 }}>{faq.a}</p>
          </div>
        ))}
      </section>

      {/* CTA Final */}
      <section style={{ background: '#D9442B', padding: '72px 24px', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: SE, fontStyle: 'italic', fontSize: 40, color: '#fff',
          margin: '0 0 16px', letterSpacing: '-0.02em',
        }}>
          Prueba la comanda por voz gratis
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', margin: '0 0 32px', maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
          14 días sin tarjeta. Alta en menos de 30 minutos. Sin instalador.
        </p>
        <a href="/registro" style={{
          background: '#fff', color: '#D9442B', textDecoration: 'none',
          padding: '16px 36px', borderRadius: 100, fontSize: 16, fontWeight: 700,
          display: 'inline-block',
        }}>
          Empezar ahora →
        </a>
        <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
          Sin permanencia · Sin comisiones · Cancela cuando quieras
        </p>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 24px', textAlign: 'center', borderTop: '1px solid rgba(26,23,20,0.08)' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: '#1A1714' }}>
            ia<span style={{ color: '#D9442B' }}>.</span>rest
          </span>
        </a>
        <p style={{ fontSize: 12, color: '#9A8D7C', margin: '8px 0 0' }}>
          © 2026 ia.rest · TPV por voz para hostelería española ·{' '}
          <a href="/privacidad" style={{ color: '#9A8D7C' }}>Privacidad</a> ·{' '}
          <a href="/aviso-legal" style={{ color: '#9A8D7C' }}>Aviso legal</a>
        </p>
      </footer>
    </div>
  )
}
