import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Descargar Bridge de impresoras · ia.rest',
  description: 'Instala el Bridge de ia.rest para conectar tus impresoras ESC/POS a tu TPV por voz. Instalador para Windows todo incluido.',
}

const C = {
  bg:   '#14110E',
  red:  '#D9442B',
  redD: '#A8311E',
  ink:  '#F6F1E7',
  ink2: '#D8CDB6',
  ink3: '#9A8F82',
  bone: '#1E1A16',
  rule: '#2E2925',
}

const steps = [
  { n: '1', title: 'Descarga el instalador', desc: 'Haz clic en el botón de abajo. El instalador incluye todo lo necesario.' },
  { n: '2', title: 'Ejecuta el .exe',        desc: 'Doble clic en el archivo descargado. Si Windows avisa, haz clic en "Más información → Ejecutar de todas formas".' },
  { n: '3', title: 'Pega tu token',          desc: 'Cópialo desde /owner → Config → Impresoras → Bridge local y pégalo en el instalador.' },
  { n: '4', title: 'Busca tus impresoras',   desc: 'El wizard escanea tu red y encuentra las impresoras automáticamente. Solo pon un nombre a cada una.' },
  { n: '5', title: 'Configura los flujos',   desc: 'Asigna qué sección va a qué impresora desde el panel de Flujos de trabajo. Listo.' },
]

const faqs = [
  { q: '¿Qué impresoras son compatibles?', a: 'Todas las impresoras ESC/POS conectadas por red WiFi o LAN con IP fija. Modelos validados: Star TSP143IIILAN, Star TSP143IIIW, Epson TM-T20III LAN, Sunmi NT311.' },
  { q: '¿Necesito dejar el ordenador encendido?', a: 'Sí, el Bridge debe estar en ejecución para que las comandas lleguen a la impresora. Se recomienda un mini PC o el propio ordenador de caja.' },
  { q: '¿Funciona en Mac o Linux?', a: 'Sí, descarga el script para Mac/Linux más abajo.' },
  { q: '¿Qué pasa si se cae la conexión a internet?', a: 'Las comandas se guardan en cola y se imprimen en cuanto vuelva la conexión.' },
]

export default function DescargarPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.ink, fontFamily: "'Inter Tight', sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: '0 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ textDecoration: 'none', color: C.red, fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>ia.rest</Link>
          <Link href="/owner" style={{ textDecoration: 'none', color: C.ink3, fontSize: 14 }}>Panel →</Link>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '64px 24px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 20, padding: '6px 14px', fontSize: 13, color: C.ink3, marginBottom: 24 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3F7D44', display: 'inline-block' }} />
            Bridge v5.1 · Incluye Node.js
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 16, fontFamily: "'Newsreader', serif" }}>
            Bridge de <span style={{ color: C.red }}>impresoras</span>
          </h1>
          <p style={{ fontSize: 18, color: C.ink2, maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.6 }}>
            Conecta tus impresoras ESC/POS a ia.rest en menos de 5 minutos. Instalador todo incluido para Windows.
          </p>

          {/* Download button */}
          <a
            href="https://github.com/albertosuarezgutierrez-gif/ia.rest/releases/download/bridge-v5.1/iarest-setup-v5.1.exe"
            download
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: C.red, color: '#fff', textDecoration: 'none',
              padding: '16px 32px', borderRadius: 10, fontSize: 17, fontWeight: 700,
              transition: 'background 0.15s',
            }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 16l-6-6h4V4h4v6h4l-6 6z"/><path d="M4 20h16"/>
            </svg>
            Descargar para Windows
          </a>

          <div style={{ marginTop: 12, fontSize: 13, color: C.ink3 }}>
            v5.1 · ~37 MB · Windows 10/11 · Incluye Node.js
          </div>

          {/* Mac/Linux */}
          <div style={{ marginTop: 16 }}>
            <a href="/bridge-setup.sh" download style={{ color: C.ink3, fontSize: 13, textDecoration: 'underline' }}>
              Mac / Linux / Raspberry Pi →
            </a>
          </div>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>Cómo instalar</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {steps.map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 20, alignItems: 'flex-start', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.red, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ color: C.ink2, fontSize: 14, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>Preguntas frecuentes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faqs.map((f, i) => (
              <div key={i} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.q}</div>
                <div style={{ color: C.ink2, fontSize: 14, lineHeight: 1.6 }}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA soporte */}
        <div style={{ textAlign: 'center', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '40px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¿Necesitas ayuda?</div>
          <div style={{ color: C.ink2, marginBottom: 20, fontSize: 15 }}>El equipo de ia.rest está disponible para guiarte en la instalación.</div>
          <Link href="/owner?tab=soporte" style={{ display: 'inline-block', background: C.bone, border: `1px solid ${C.rule}`, color: C.ink, textDecoration: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
            Abrir soporte
          </Link>
        </div>

      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.rule}`, padding: '24px', textAlign: 'center', color: C.ink3, fontSize: 13 }}>
        © 2026 ia.rest · <Link href="/privacidad" style={{ color: C.ink3 }}>Privacidad</Link> · <Link href="/" style={{ color: C.ink3 }}>Inicio</Link>
      </div>
    </div>
  )
}
