// /demo/restaurante-indio v3 — landing potente para leads cocina india/nepalesa
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ia.rest · El sistema que entiende tu restaurante',
  description: 'Voz, IA, almacén, eventos y proveedores. Todo conectado. Para restaurantes que quieren escalar sin perder el control.',
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
      <nav style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${RULE_L}`, background: PAPER }}>
        <span style={{ fontFamily: SE, fontSize: 22, color: DARK }}>
          ia<span style={{ color: RED }}>.</span>rest
        </span>
        <a href={MAIL} style={{ background: RED, color: '#fff', padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Solicitar videollamada →
        </a>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '80px 28px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: `${RED}15`, border: `1px solid ${RED}35`, borderRadius: 20, padding: '4px 16px', fontSize: 11, color: RED, letterSpacing: '.12em', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 30 }}>
          Para restaurantes indios · nepaleses · asiáticos
        </div>
        <h1 style={{ fontFamily: SE, fontSize: 50, fontWeight: 300, lineHeight: 1.1, margin: '0 0 24px', color: DARK }}>
          No es un TPV.<br />
          <span style={{ color: RED }}>Es el cerebro de tu restaurante.</span>
        </h1>
        <p style={{ fontSize: 19, color: INK4, lineHeight: 1.7, margin: '0 0 44px', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          Voz, IA, almacén, catering y proveedores. Todo conectado. Para los que gestionan más de un local y quieren tenerlo todo bajo control.
        </p>
        <a href={MAIL} style={{ display: 'inline-block', background: RED, color: '#fff', padding: '18px 44px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
          Ver cómo funciona — 15 min
        </a>
        <p style={{ fontSize: 12, color: INK3, marginTop: 14 }}>Videollamada gratuita · Sin compromiso · Te lo mostramos en vivo</p>
      </section>

      {/* CAPACIDADES — LA PARTE POTENTE */}
      <section style={{ background: DARK, padding: '72px 28px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontSize: 11, color: INK3, textTransform: 'uppercase' as const, letterSpacing: '.12em', fontWeight: 700, textAlign: 'center' as const, marginBottom: 48 }}>
            Todo lo que hace ia.rest
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2 }}>
            {[
              { emoji: '🎙', titulo: 'Comandas por voz', desc: 'El camarero dicta. La IA entiende variantes, alergias y cantidades al instante. Sin papel, sin errores.', color: RED },
              { emoji: '📺', titulo: 'KDS cocina', desc: 'Pantalla de cocina en tiempo real. Cada partida ve exactamente lo que tiene que preparar.', color: RED },
              { emoji: '📦', titulo: 'Almacén inteligente', desc: 'Escandallos por plato, stock real, alertas de reposición automáticas. Sabes cuánto gastas en cada comanda.', color: AMBER },
              { emoji: '🤝', titulo: 'Pedidos a proveedores', desc: 'La IA sugiere los pedidos según stock y previsión de demanda. Un clic para enviar. Sin emails manuales.', color: AMBER },
              { emoji: '🎉', titulo: 'Eventos y catering', desc: 'Presupuestos, menús personalizados, portal para el cliente. Todo desde el mismo sistema.', color: GREEN },
              { emoji: '📊', titulo: 'Analytics en tiempo real', desc: 'Qué vende más, cuándo, en qué local. Ticket medio, cobros por canal, comparativa entre sedes.', color: GREEN },
              { emoji: '🔮', titulo: 'IA predictiva', desc: 'Previsión de demanda para la próxima semana. Sabe cuándo va a haber pico y te avisa con antelación.', color: '#6B8CFF' },
              { emoji: '🏢', titulo: 'Multi-local', desc: 'Un panel centralizado para todos los locales. Stock compartido, transferencias internas, visión de grupo.', color: '#6B8CFF' },
            ].map(({ emoji, titulo, desc, color }) => (
              <div key={titulo} style={{ background: BG2, border: `1px solid ${RULE_D}`, padding: '24px 22px' }}>
                <div style={{ fontSize: 26, marginBottom: 12 }}>{emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: color, marginBottom: 8 }}>{titulo}</div>
                <div style={{ fontSize: 13, color: INK3, lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ESPECÍFICO PARA ELLOS */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '72px 28px' }}>
        <h2 style={{ fontFamily: SE, fontSize: 32, fontWeight: 300, color: DARK, marginBottom: 12, textAlign: 'center' as const }}>
          Por qué funciona especialmente bien<br />en cocina india y nepalesa
        </h2>
        <p style={{ fontSize: 15, color: INK4, textAlign: 'center' as const, marginBottom: 44, lineHeight: 1.6 }}>
          Vuestros menús son los más complejos de gestionar. ia.rest está pensado para exactamente eso.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          {[
            { label: 'Variantes infinitas gestionadas solas', desc: '"Sin picante, sin gluten, extra especiado, sin cebolla" — la IA lo entiende todo sin que el camarero teclee nada.', badge: 'Voz' },
            { label: 'Escandallos por plato con coste real', desc: 'Sabes exactamente cuánto cuesta cada biryani, cada tikka. El almacén descuenta ingredientes automáticamente.', badge: 'Almacén' },
            { label: 'Eventos y banquetes con portal para el cliente', desc: 'Para bodas, eventos corporativos, celebraciones — presupuesto online, menú personalizado, confirmación digital.', badge: 'Eventos' },
            { label: 'Multi-local sin perder el control', desc: 'Si tenéis 2 locales o 10, el panel muestra todo en tiempo real. Transferencias de stock entre sedes incluidas.', badge: 'Multi-local' },
          ].map(({ label, desc, badge }) => (
            <div key={label} style={{ display: 'flex', gap: 20, alignItems: 'flex-start', background: '#EFEDE8', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ background: RED, color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', padding: '3px 10px', borderRadius: 6, flexShrink: 0, marginTop: 3, whiteSpace: 'nowrap' as const }}>
                {badge}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 13, color: INK4, lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* VS COMPETENCIA */}
      <section style={{ background: DARK, padding: '64px 28px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <p style={{ fontSize: 11, color: INK3, textTransform: 'uppercase' as const, letterSpacing: '.12em', fontWeight: 700, textAlign: 'center' as const, marginBottom: 36 }}>
            Sin ia.rest vs con ia.rest
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <div style={{ background: BG3, border: `1px solid ${RULE_D}`, borderRadius: '12px 0 0 12px', padding: '28px 24px' }}>
              <p style={{ fontSize: 12, color: INK3, fontWeight: 700, letterSpacing: '.08em', marginBottom: 20 }}>ANTES</p>
              {['Comandas en papel → errores', 'Stock sin control real', 'Eventos gestionados por email', 'Sin datos de qué vende más', 'Cada local funciona por su cuenta'].map(t => (
                <div key={t} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                  <span style={{ color: RED, fontWeight: 700, flexShrink: 0 }}>✕</span>
                  <span style={{ fontSize: 13, color: INK3, lineHeight: 1.45 }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ background: BG2, border: `1px solid ${GREEN}40`, borderRadius: '0 12px 12px 0', padding: '28px 24px' }}>
              <p style={{ fontSize: 12, color: GREEN, fontWeight: 700, letterSpacing: '.08em', marginBottom: 20 }}>CON ia.rest</p>
              {['Voz a cocina en 3 segundos, sin errores', 'Almacén con escandallos y alertas', 'Portal de eventos para el cliente', 'Analytics en tiempo real', 'Un panel para todos los locales'].map(t => (
                <div key={t} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                  <span style={{ color: GREEN, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: INK2, lineHeight: 1.45 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRECIO */}
      <section style={{ maxWidth: 600, margin: '0 auto', padding: '72px 28px', textAlign: 'center' as const }}>
        <div style={{ background: '#EFEDE8', borderRadius: 16, padding: '40px 36px', border: `1px solid ${RULE_L}` }}>
          <p style={{ fontSize: 11, color: INK3, textTransform: 'uppercase' as const, letterSpacing: '.12em', fontWeight: 700, marginBottom: 16 }}>Precio</p>
          <p style={{ fontFamily: SE, fontSize: 38, fontWeight: 300, color: DARK, margin: '0 0 8px' }}>
            Sin sorpresas
          </p>
          <p style={{ fontSize: 15, color: INK4, margin: '0 0 28px', lineHeight: 1.6 }}>
            Precio fijo mensual según número de usuarios.<br />
            <strong style={{ color: DARK }}>Sin comisión por venta. Sin permanencia.</strong>
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 28 }}>
            {[
              ['59€/mes', 'Plan base'],
              ['+20€', 'Por usuario (2-6)'],
              ['+15€', 'Por usuario (7+)'],
            ].map(([precio, label]) => (
              <div key={label} style={{ background: PAPER, border: `1px solid ${RULE_L}`, borderRadius: 10, padding: '12px 20px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 400, color: RED }}>{precio}</div>
                <div style={{ fontSize: 11, color: INK3, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: INK3 }}>14 días de prueba gratuita · Sin tarjeta de crédito</p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ background: DARK, padding: '72px 28px', textAlign: 'center' as const }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ fontFamily: SE, fontSize: 36, fontWeight: 300, color: PAPER, marginBottom: 16 }}>
            ¿Lo vemos juntos?
          </h2>
          <p style={{ fontSize: 16, color: INK3, marginBottom: 36, lineHeight: 1.65 }}>
            15 minutos de videollamada. Te mostramos el sistema funcionando en un restaurante real con cocina india configurada.
          </p>
          <a href={MAIL} style={{ display: 'inline-block', background: RED, color: '#fff', padding: '18px 48px', borderRadius: 10, fontSize: 17, fontWeight: 700, textDecoration: 'none' }}>
            Solicitar videollamada gratuita →
          </a>
          <p style={{ fontSize: 13, color: INK4, marginTop: 18 }}>
            O escríbenos a{' '}
            <a href="mailto:hola@iarest.es" style={{ color: RED, textDecoration: 'none', fontWeight: 600 }}>hola@iarest.es</a>
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${RULE_D}`, background: DARK, padding: '24px', textAlign: 'center' as const }}>
        <span style={{ fontSize: 12, color: INK4 }}>
          ia<span style={{ color: RED }}>.</span>rest · Comandas por voz para hostelería ·{' '}
          <a href="https://www.iarest.es" style={{ color: INK4, textDecoration: 'none' }}>www.iarest.es</a>
        </span>
      </footer>

    </main>
  )
}
