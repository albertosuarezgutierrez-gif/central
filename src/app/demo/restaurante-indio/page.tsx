// /demo/restaurante-indio — landing para leads cocina india/nepalesa
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ia.rest · Restaurantes indios y nepaleses',
  description: 'Comandas por voz que entienden variantes y alergias. Sin errores. Sin papel.',
}

export default function DemoRestauranteIndio() {
  return (
    <main style={{ background: '#F6F1E7', minHeight: '100vh', color: '#1A1714', fontFamily: "'Inter Tight', system-ui, sans-serif" }}>

      {/* NAV */}
      <nav style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #D8CDB6' }}>
        <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, color: '#1A1714', letterSpacing: '-.3px' }}>
          ia<span style={{ color: '#D9442B' }}>.</span>rest
        </span>
        <a href="mailto:hola@iarest.es?subject=Videollamada%20ia.rest%20–%20Restaurante&body=Hola%2C%20me%20gustar%C3%ADa%20ver%20c%C3%B3mo%20funciona%20ia.rest%20para%20nuestro%20restaurante."
          style={{ background: '#D9442B', color: '#fff', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', letterSpacing: '.03em' }}>
          Solicitar videollamada →
        </a>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 660, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: '#D9442B18', border: '1px solid #D9442B40', borderRadius: 20, padding: '4px 14px', fontSize: 11, color: '#D9442B', letterSpacing: '.12em', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 28 }}>
          Para restaurantes indios y nepaleses
        </div>

        <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 44, fontWeight: 300, lineHeight: 1.12, margin: '0 0 22px', color: '#14110E' }}>
          Tu equipo habla.<br />
          <span style={{ color: '#D9442B' }}>ia.rest entiende.</span>
        </h1>

        <p style={{ fontSize: 18, color: '#3D3530', lineHeight: 1.7, margin: '0 0 14px' }}>
          &ldquo;Pollo tikka sin picante, naan con mantequilla, biryani vegetariano sin cebolla.&rdquo;
        </p>
        <p style={{ fontSize: 16, color: '#6B5F52', lineHeight: 1.6, margin: '0 0 40px' }}>
          Todo a cocina en 3 segundos. Sin papel. Sin errores.
        </p>

        <a href="mailto:hola@iarest.es?subject=Videollamada%20ia.rest%20–%20Restaurante&body=Hola%2C%20me%20gustar%C3%ADa%20ver%20c%C3%B3mo%20funciona%20ia.rest%20para%20nuestro%20restaurante."
          style={{ display: 'inline-block', background: '#D9442B', color: '#fff', padding: '16px 40px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none', letterSpacing: '.03em' }}>
          Solicitar videollamada gratuita →
        </a>
        <p style={{ fontSize: 12, color: '#9C8E7E', marginTop: 12 }}>
          15 minutos · Sin compromiso · Te lo mostramos en vivo
        </p>
      </section>

      {/* EL PROBLEMA */}
      <section style={{ background: '#14110E', padding: '56px 24px' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <p style={{ fontSize: 11, color: '#6B5F52', textTransform: 'uppercase' as const, letterSpacing: '.12em', fontWeight: 700, marginBottom: 32, textAlign: 'center' as const }}>
            El problema en cocina india y nepalesa
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {[
              ['🌶', 'Variantes infinitas', '"Sin picante, extra especiado, sin cebolla" — cada plato tiene 5 versiones'],
              ['📋', 'Papel y errores', 'El camarero escribe, cocina interpreta, el cliente recibe otra cosa'],
              ['⏱', 'Hora punta', 'Tickets perdidos, cocina saturada, esperas que se notan en las reseñas'],
            ].map(([emoji, titulo, desc]) => (
              <div key={titulo as string} style={{ background: '#1E1A15', border: '1px solid #2A2520', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>{emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F6F1E7', marginBottom: 6 }}>{titulo as string}</div>
                <div style={{ fontSize: 13, color: '#9C8E7E', lineHeight: 1.55 }}>{desc as string}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section style={{ maxWidth: 660, margin: '0 auto', padding: '64px 24px' }}>
        <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 28, fontWeight: 300, color: '#14110E', marginBottom: 36, textAlign: 'center' as const }}>
          Cómo funciona
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
          {[
            { num: '1', color: '#D9442B', label: 'El camarero habla', desc: '"Tikka masala sin picante, arroz basmati, lassi de mango"' },
            { num: '2', color: '#E8A33B', label: 'ia.rest procesa en tiempo real', desc: 'Entiende variantes, alergias y cantidades en el idioma natural del camarero' },
            { num: '3', color: '#3F7D44', label: 'Cocina recibe sin ambigüedad', desc: 'La pantalla muestra cada plato con sus modificaciones exactas' },
          ].map(({ num, color, label, desc }) => (
            <div key={num} style={{ display: 'flex', gap: 20, paddingBottom: 32, position: 'relative' as const }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', zIndex: 1 }}>
                {num}
              </div>
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#14110E', marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 14, color: '#6B5F52', lineHeight: 1.55, fontStyle: 'italic' as const }}>"{desc}"</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PARA QUIÉN */}
      <section style={{ background: '#1A1714', padding: '48px 24px' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <p style={{ fontSize: 11, color: '#6B5F52', textTransform: 'uppercase' as const, letterSpacing: '.12em', fontWeight: 700, marginBottom: 24, textAlign: 'center' as const }}>
            Funciona especialmente bien en
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {[
              '🍛 Menús extensos con muchas variantes',
              '🏢 Grupos con varios locales',
              '🌿 Cartas vegetarianas y veganas',
              '🌍 Equipos multilingüe en sala',
            ].map(item => (
              <div key={item} style={{ fontSize: 13, color: '#D8CDB6', padding: '12px 16px', background: '#14110E', borderRadius: 8, border: '1px solid #2A2520' }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ maxWidth: 560, margin: '0 auto', padding: '72px 24px 80px', textAlign: 'center' as const }}>
        <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 32, fontWeight: 300, color: '#14110E', marginBottom: 14 }}>
          ¿Lo vemos juntos en 15 minutos?
        </h2>
        <p style={{ fontSize: 15, color: '#6B5F52', marginBottom: 36, lineHeight: 1.65 }}>
          Te mostramos cómo funciona con un restaurante real configurado para cocina india. Sin instalación, sin compromiso.
        </p>
        <a href="mailto:hola@iarest.es?subject=Videollamada%20ia.rest%20–%20Restaurante&body=Hola%2C%20me%20gustar%C3%ADa%20ver%20c%C3%B3mo%20funciona%20ia.rest%20para%20nuestro%20restaurante."
          style={{ display: 'inline-block', background: '#D9442B', color: '#fff', padding: '16px 44px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none', letterSpacing: '.03em' }}>
          Solicitar videollamada →
        </a>
        <p style={{ fontSize: 13, color: '#9C8E7E', marginTop: 16 }}>
          O escríbenos directamente a{' '}
          <a href="mailto:hola@iarest.es" style={{ color: '#D9442B', textDecoration: 'none', fontWeight: 600 }}>hola@iarest.es</a>
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #D8CDB6', padding: '24px', textAlign: 'center' as const }}>
        <span style={{ fontSize: 12, color: '#9C8E7E' }}>
          ia<span style={{ color: '#D9442B' }}>.</span>rest · Comandas por voz para hostelería ·{' '}
          <a href="https://www.iarest.es" style={{ color: '#9C8E7E', textDecoration: 'none' }}>www.iarest.es</a>
        </span>
      </footer>

    </main>
  )
}
