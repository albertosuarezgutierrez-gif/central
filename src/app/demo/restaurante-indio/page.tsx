// /demo/restaurante-indio — landing para leads de cocina india/nepalesa/asiática
import { Metadata } from 'next'
import Link from 'next/link'
import { C, SE, SN, SM } from '@/lib/colors'

export const metadata: Metadata = {
  title: 'ia.rest para restaurantes indios y nepaleses — Demo gratuita',
  description: 'Comandas por voz que entienden variantes, alergias y platos complejos. Sin errores. Sin papel. Pruébalo gratis.',
}

const DEMO_TOKEN = '62d3124f5185d326ba0e5632'

export default function DemoRestauranteIndio() {
  const sh = (extra = {}) => ({ fontFamily: SN, ...extra } as React.CSSProperties)
  const dark = C.dark as string
  const paper = C.paper as string
  const red = C.red as string
  const ink2 = C.ink2 as string
  const ink3 = C.ink3 as string
  const bg2 = C.bg2 as string
  const rule = C.rule as string

  return (
    <main style={{ background: dark, minHeight: '100vh', color: paper }}>

      {/* NAV */}
      <nav style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${rule}` }}>
        <span style={{ fontFamily: SE, fontSize: 20, color: paper }}>
          ia<span style={{ color: red }}>.</span>rest
        </span>
        <Link href={`/login?t=${DEMO_TOKEN}`}
          style={{ background: red, color: '#fff', padding: '8px 18px', borderRadius: 8, fontFamily: SM, fontSize: 13, fontWeight: 700, textDecoration: 'none', letterSpacing: '.04em' }}>
          Probar demo →
        </Link>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '72px 24px 48px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: `${red}18`, border: `1px solid ${red}40`, borderRadius: 20, padding: '4px 14px', fontFamily: SM, fontSize: 11, color: red, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 24 }}>
          Para restaurantes indios y nepaleses
        </div>

        <h1 style={{ fontFamily: SE, fontSize: 42, fontWeight: 300, lineHeight: 1.15, margin: '0 0 20px', color: paper }}>
          Tu equipo habla.<br />
          <span style={{ color: red }}>ia.rest entiende.</span>
        </h1>

        <p style={{ ...sh({ fontSize: 18, color: ink2, lineHeight: 1.7, margin: '0 0 36px' }) }}>
          &ldquo;Pollo tikka sin picante, naan con mantequilla, biryani vegetariano sin cebolla.&rdquo;<br />
          Todo a cocina en 3 segundos. Sin papel. Sin errores.
        </p>

        <Link href={`/login?t=${DEMO_TOKEN}`}
          style={{ display: 'inline-block', background: red, color: '#fff', padding: '16px 36px', borderRadius: 10, fontFamily: SM, fontSize: 16, fontWeight: 700, textDecoration: 'none', letterSpacing: '.04em' }}>
          Ver la demo en vivo →
        </Link>
        <p style={{ ...sh({ fontSize: 12, color: ink3, marginTop: 12 }) }}>
          Sin registro · Sin tarjeta · 2 minutos
        </p>
      </section>

      {/* EL PROBLEMA */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ background: bg2, border: `1px solid ${rule}`, borderRadius: 14, padding: 28 }}>
          <p style={{ ...sh({ fontSize: 11, color: ink3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16, fontWeight: 600 }) }}>
            El problema real en cocina india y nepalesa
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['🌶', 'Variantes infinitas', '"Sin picante", "extra especiado", "sin gluten" — cada plato tiene 5 versiones posibles'],
              ['📋', 'Comandas en papel', 'El camarero escribe, la cocina interpreta, el cliente recibe algo distinto'],
              ['⏱', 'Hora punta', '2 locales, cocina saturada, y los tickets se pierden o llegan tarde'],
            ].map(([emoji, titulo, desc]) => (
              <div key={titulo as string} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{emoji}</span>
                <div>
                  <div style={{ ...sh({ fontSize: 14, fontWeight: 700, color: paper, marginBottom: 3 }) }}>{titulo as string}</div>
                  <div style={{ ...sh({ fontSize: 13, color: ink2, lineHeight: 1.5 }) }}>{desc as string}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 64px' }}>
        <h2 style={{ fontFamily: SE, fontSize: 26, fontWeight: 300, color: paper, marginBottom: 32, textAlign: 'center' }}>
          Cómo funciona
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            ['1', red, 'El camarero dicta', '"Tikka masala sin picante, arroz basmati, lassi de mango"'],
            ['2', '#E8A33B', 'ia.rest procesa', 'Whisper + IA estructuran la comanda con todas las variantes en tiempo real'],
            ['3', '#3F7D44', 'Cocina recibe', 'La pantalla KDS muestra cada plato con sus modificaciones sin ambigüedad'],
          ].map(([paso, color, label, desc]) => (
            <div key={paso as string} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingBottom: 28, borderLeft: `2px solid ${rule}`, marginLeft: 20, paddingLeft: 24, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -12, top: 0, width: 24, height: 24, borderRadius: '50%', background: color as string, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SM, fontSize: 11, fontWeight: 700, color: '#fff' }}>
                {paso as string}
              </div>
              <div>
                <div style={{ ...sh({ fontSize: 15, fontWeight: 700, color: paper, marginBottom: 4 }) }}>{label as string}</div>
                <div style={{ ...sh({ fontSize: 13, color: ink2, lineHeight: 1.5, fontStyle: 'italic' }) }}>"{desc as string}"</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PARA QUIEN */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ background: bg2, border: `1px solid ${rule}`, borderRadius: 14, padding: 28 }}>
          <p style={{ ...sh({ fontSize: 11, color: ink3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 20, fontWeight: 600 }) }}>
            Funciona especialmente bien en
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              '🍛 Restaurantes con menú extenso y variantes',
              '🏢 Grupos con varios locales',
              '🌿 Cartas con muchas opciones vegetarianas/veganas',
              '🌍 Equipos que mezclan idiomas en sala',
            ].map(item => (
              <div key={item} style={{ ...sh({ fontSize: 13, color: ink2, padding: '10px 14px', background: dark, borderRadius: 8, border: `1px solid ${rule}`, lineHeight: 1.5 }) }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: SE, fontSize: 30, fontWeight: 300, color: paper, marginBottom: 12 }}>
          Pruébalo ahora, sin compromisos
        </h2>
        <p style={{ ...sh({ fontSize: 15, color: ink2, marginBottom: 32, lineHeight: 1.6 }) }}>
          La demo está configurada con un restaurante real.<br />
          Dicta una comanda, ve cómo llega a cocina.
        </p>
        <Link href={`/login?t=${DEMO_TOKEN}`}
          style={{ display: 'inline-block', background: red, color: '#fff', padding: '16px 40px', borderRadius: 10, fontFamily: SM, fontSize: 16, fontWeight: 700, textDecoration: 'none', letterSpacing: '.04em' }}>
          Entrar a la demo →
        </Link>
        <p style={{ ...sh({ fontSize: 13, color: ink3, marginTop: 16 }) }}>
          ¿Prefieres que lo veamos juntos?{' '}
          <a href="mailto:hola@iarest.es" style={{ color: red, textDecoration: 'none' }}>
            hola@iarest.es
          </a>
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${rule}`, padding: '24px', textAlign: 'center' }}>
        <span style={{ ...sh({ fontSize: 12, color: ink3 }) }}>
          ia<span style={{ color: red }}>.</span>rest · Comandas por voz para hostelería · 
          <a href="https://www.iarest.es" style={{ color: ink3, textDecoration: 'none', marginLeft: 6 }}>www.iarest.es</a>
        </span>
      </footer>

    </main>
  )
}
