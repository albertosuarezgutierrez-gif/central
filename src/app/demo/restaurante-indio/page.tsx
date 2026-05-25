import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ia.rest · El sistema de gestión para tu restaurante',
  description: 'Voz, cocina, almacén, proveedores y eventos. Todo conectado. Todo automatizado.',
}

const RED = '#D9442B'
const DARK = '#14110E'
const PAPER = '#F6F1E7'
const BG2 = '#1E1A15'
const BG3 = '#2A221A'
const INK2 = '#D8CDB6'
const INK3 = '#9C8E7E'
const INK4 = '#6B5F52'
const RULE_D = '#2A2520'
const RULE_L = '#D8CDB6'
const AMBER = '#E8A33B'
const GREEN = '#3F7D44'
const SE = "'Newsreader', Georgia, serif"
const SN = "'Inter Tight', system-ui, sans-serif"
const MAIL = 'mailto:hola@iarest.es?subject=Videollamada%20ia.rest&body=Hola%2C%20me%20gustar%C3%ADa%20ver%20ia.rest%20para%20nuestro%20restaurante.'

export default function DemoRestauranteIndio() {
  return (
    <main style={{ background: PAPER, minHeight: '100vh', color: DARK, fontFamily: SN }}>

      {/* NAV */}
      <nav style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${RULE_L}` }}>
        <span style={{ fontFamily: SE, fontSize: 22, color: DARK }}>ia<span style={{ color: RED }}>.</span>rest</span>
        <a href={MAIL} style={{ background: RED, color: '#fff', padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Solicitar videollamada →
        </a>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '80px 28px 72px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: `${RED}15`, border: `1px solid ${RED}35`, borderRadius: 20, padding: '4px 16px', fontSize: 11, color: RED, letterSpacing: '.12em', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 32 }}>
          Restaurantes indios · nepaleses · asiáticos
        </div>
        <h1 style={{ fontFamily: SE, fontSize: 52, fontWeight: 300, lineHeight: 1.1, margin: '0 0 24px', color: DARK }}>
          Todo tu restaurante.<br />
          <span style={{ color: RED }}>Un solo sistema.</span>
        </h1>
        <p style={{ fontSize: 19, color: INK4, lineHeight: 1.7, margin: '0 0 48px', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          Sala, cocina, almacén, proveedores y eventos. Conectados, automatizados, bajo control.
        </p>
        <a href={MAIL} style={{ display: 'inline-block', background: RED, color: '#fff', padding: '18px 44px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
          Ver cómo funciona — 15 min
        </a>
        <p style={{ fontSize: 12, color: INK3, marginTop: 14 }}>Videollamada gratuita · Sin compromiso</p>
      </section>

      {/* 3 BLOQUES */}
      <section style={{ background: DARK, padding: '80px 28px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>

          {/* BLOQUE 1 — SALA */}
          <div style={{ marginBottom: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
              <div style={{ width: 3, height: 32, background: RED, borderRadius: 2, flexShrink: 0 }} />
              <h2 style={{ fontFamily: SE, fontSize: 28, fontWeight: 300, color: PAPER, margin: 0 }}>En sala</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
              {[
                ['🎙', 'Comandas por voz', 'Desde cualquier dispositivo. En cualquier idioma.'],
                ['📺', 'Cocina en tiempo real', 'Cada partida ve lo que tiene que preparar, al instante.'],
                ['💳', 'Cobro y cierre', 'Varios métodos. Factura automática. Sin papeles.'],
                ['📊', 'Analytics', 'Ventas, tendencias y comparativas. En tiempo real.'],
              ].map(([e, t, d]) => (
                <div key={t as string} style={{ background: BG2, border: `1px solid ${RULE_D}`, padding: '24px 20px' }}>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>{e}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginBottom: 8 }}>{t as string}</div>
                  <div style={{ fontSize: 13, color: INK3, lineHeight: 1.6 }}>{d as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* BLOQUE 2 — COCINA */}
          <div style={{ marginBottom: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
              <div style={{ width: 3, height: 32, background: AMBER, borderRadius: 2, flexShrink: 0 }} />
              <h2 style={{ fontFamily: SE, fontSize: 28, fontWeight: 300, color: PAPER, margin: 0 }}>En cocina</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
              {[
                ['🧑‍🍳', 'Asistente IA', 'El jefe pregunta. La IA responde. Sin pantallas.'],
                ['📋', 'Elaboraciones', 'Fichas técnicas, alérgenos y caducidades controladas.'],
                ['🏷', 'Etiquetado', 'Caducidades, lotes y trazabilidad. Automático.'],
                ['✅', 'Control APPCC', 'Registros sanitarios sin burocracia manual.'],
              ].map(([e, t, d]) => (
                <div key={t as string} style={{ background: BG2, border: `1px solid ${RULE_D}`, padding: '24px 20px' }}>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>{e}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: AMBER, marginBottom: 8 }}>{t as string}</div>
                  <div style={{ fontSize: 13, color: INK3, lineHeight: 1.6 }}>{d as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* BLOQUE 3 — GESTIÓN */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
              <div style={{ width: 3, height: 32, background: GREEN, borderRadius: 2, flexShrink: 0 }} />
              <h2 style={{ fontFamily: SE, fontSize: 28, fontWeight: 300, color: PAPER, margin: 0 }}>En gestión</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
              {[
                ['📷', 'Control albaranes', 'Foto y listo. Sin teclear nada.'],
                ['📦', 'Almacén y escandallos', 'Stock real. Coste por plato. Alertas automáticas.'],
                ['🤝', 'Proveedores', 'Pedidos, recepciones y pagos. Todo en un sitio.'],
                ['🎉', 'Eventos y catering', 'Presupuestos, menús y coordinación. Sin emails.'],
                ['🔮', 'Previsión de demanda', 'La IA anticipa lo que vas a necesitar.'],
                ['🏢', 'Multi-local', 'Todos los locales desde un panel. Stock compartido.'],
              ].map(([e, t, d]) => (
                <div key={t as string} style={{ background: BG2, border: `1px solid ${RULE_D}`, padding: '24px 20px' }}>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>{e}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GREEN, marginBottom: 8 }}>{t as string}</div>
                  <div style={{ fontSize: 13, color: INK3, lineHeight: 1.6 }}>{d as string}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* PARA QUIÉN */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '72px 28px' }}>
        <h2 style={{ fontFamily: SE, fontSize: 32, fontWeight: 300, color: DARK, textAlign: 'center' as const, marginBottom: 14 }}>
          Pensado para restaurantes como el vuestro
        </h2>
        <p style={{ fontSize: 15, color: INK4, textAlign: 'center' as const, marginBottom: 44, lineHeight: 1.65 }}>
          Menús complejos con variantes, equipos grandes, varios locales. ia.rest está hecho para escenarios donde los demás sistemas se quedan cortos.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            '🍛 Menús con muchas variantes y alergias',
            '🌿 Cartas vegetarianas, veganas, sin gluten',
            '🏢 Grupos con 2 o más locales',
            '🎉 Restaurantes con servicio de eventos',
            '📦 Alta rotación de proveedores',
            '🌍 Equipos en varios idiomas',
          ].map(item => (
            <div key={item} style={{ fontSize: 13, color: INK4, padding: '14px 18px', background: '#EFEDE8', borderRadius: 10, border: `1px solid ${RULE_L}`, lineHeight: 1.5 }}>
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* PRECIO */}
      <section style={{ background: DARK, padding: '64px 28px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' as const }}>
          <p style={{ fontSize: 11, color: INK3, textTransform: 'uppercase' as const, letterSpacing: '.12em', fontWeight: 700, marginBottom: 20 }}>Precio</p>
          <p style={{ fontFamily: SE, fontSize: 40, fontWeight: 300, color: PAPER, margin: '0 0 12px' }}>Sin sorpresas</p>
          <p style={{ fontSize: 15, color: INK3, margin: '0 0 32px', lineHeight: 1.65 }}>
            Precio fijo mensual. <strong style={{ color: PAPER }}>Sin comisión por venta. Sin permanencia.</strong>
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 20 }}>
            {[['59€/mes', 'Plan base'], ['+20€', 'Por usuario (2-6)'], ['+15€', 'Por usuario (7+)']].map(([p, l]) => (
              <div key={l} style={{ background: BG3, border: `1px solid ${RULE_D}`, borderRadius: 10, padding: '14px 22px' }}>
                <div style={{ fontFamily: SE, fontSize: 24, fontWeight: 400, color: RED }}>{p}</div>
                <div style={{ fontSize: 11, color: INK3, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: INK4 }}>14 días de prueba gratuita · Sin tarjeta</p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ maxWidth: 560, margin: '0 auto', padding: '80px 28px', textAlign: 'center' as const }}>
        <h2 style={{ fontFamily: SE, fontSize: 36, fontWeight: 300, color: DARK, marginBottom: 16 }}>
          ¿Lo vemos juntos?
        </h2>
        <p style={{ fontSize: 15, color: INK4, marginBottom: 36, lineHeight: 1.65 }}>
          15 minutos. Te mostramos el sistema funcionando en un restaurante real. Sin instalación, sin compromiso.
        </p>
        <a href={MAIL} style={{ display: 'inline-block', background: RED, color: '#fff', padding: '18px 48px', borderRadius: 10, fontSize: 17, fontWeight: 700, textDecoration: 'none' }}>
          Solicitar videollamada gratuita →
        </a>
        <p style={{ fontSize: 13, color: INK3, marginTop: 18 }}>
          O escríbenos a{' '}
          <a href="mailto:hola@iarest.es" style={{ color: RED, textDecoration: 'none', fontWeight: 600 }}>hola@iarest.es</a>
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${RULE_L}`, padding: '24px', textAlign: 'center' as const }}>
        <span style={{ fontSize: 12, color: INK3 }}>
          ia<span style={{ color: RED }}>.</span>rest ·{' '}
          <a href="https://www.iarest.es" style={{ color: INK3, textDecoration: 'none' }}>www.iarest.es</a>
        </span>
      </footer>

    </main>
  )
}
