import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BRIDGE_VERSION, BRIDGE_SIZE, BRIDGE_EXE_URL } from '@/lib/bridge-config'

export const metadata: Metadata = {
  title: 'Descargar ia.rest · App y Bridge',
  description: 'Descarga la app ia.rest para Android o el bridge de impresoras para PC.',
}

const C = {
  bg:   '#14110E',
  red:  '#D9442B',
  redD: '#A8311E',
  ink:  '#F6F1E7',
  ink2: '#D8CDB6',
  ink3: '#9A8F82',
  ink4: '#5A5147',
  bone: '#1E1A16',
  rule: '#2E2925',
  green:'#3F7D44',
}
const SE2 = "'Newsreader', serif"
const SM2 = "'Inter Tight', sans-serif"

const APK_URL = 'https://github.com/albertosuarezgutierrez-gif/ia.rest/releases/download/android-v3.0/iarest.apk'
const APK_VERSION = '3.0'
const APK_SIZE = '4.8 MB'

export default function DescargarPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.ink, fontFamily: SM2 }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: '0 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ textDecoration: 'none', color: C.red, fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>ia.rest</Link>
          <Link href="/owner" style={{ textDecoration: 'none', color: C.ink3, fontSize: 14 }}>Panel →</Link>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 12, fontFamily: SE2 }}>
            Descargas
          </h1>
          <p style={{ fontSize: 16, color: C.ink3, margin: 0 }}>
            App para camareros · Bridge para impresoras
          </p>
        </div>

        {/* ── APK Android ── */}
        <div style={{ background: C.bone, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '28px 28px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>📱</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: SE2, fontSize: 22, fontWeight: 700, color: C.ink }}>App Android</span>
                <span style={{ fontFamily: SM2, fontSize: 11, fontWeight: 700, color: C.green, background: '#1A2A1C', border: `1px solid ${C.green}44`, borderRadius: 4, padding: '2px 7px' }}>RECOMENDADO</span>
              </div>
              <p style={{ fontSize: 14, color: C.ink3, margin: 0, lineHeight: 1.6 }}>
                Para camareros, KDS y tablets de cobro. Incluye PTT por voz, comandas y bridge de impresión integrado.
              </p>
            </div>
          </div>

          <a
            href={APK_URL}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: C.green, color: '#fff', textDecoration: 'none',
              padding: '14px 28px', borderRadius: 10, fontSize: 16, fontWeight: 700,
              marginBottom: 12,
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 16l-6-6h4V4h4v6h4l-6 6z"/><path d="M4 20h16"/>
            </svg>
            Descargar APK · v{APK_VERSION}
          </a>

          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: C.ink4, justifyContent: 'center' }}>
            <span>Android 8.0+</span>
            <span>·</span>
            <span>{APK_SIZE}</span>
            <span>·</span>
            <span>Firmada RSA2048</span>
          </div>

          {/* Instrucciones */}
          <div style={{ marginTop: 20, borderTop: `1px solid ${C.rule}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { n: '1', t: 'Descarga el APK en el móvil Android' },
              { n: '2', t: 'Si Android pregunta, permite "instalar apps desconocidas"' },
              { n: '3', t: 'Abre ia.rest e inicia sesión — el bridge se activa solo' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.green, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{s.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bridge PC ── */}
        <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '28px 28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>🖥</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SE2, fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                Bridge PC · Windows
              </div>
              <p style={{ fontSize: 14, color: C.ink3, margin: 0, lineHeight: 1.6 }}>
                Para restaurantes con impresoras conectadas a un PC fijo. Sin Node.js, sin instalar nada más.
              </p>
            </div>
          </div>

          <a
            href={BRIDGE_EXE_URL}
            download
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#2A2520', color: C.ink2, textDecoration: 'none',
              border: `1px solid ${C.rule}`,
              padding: '14px 28px', borderRadius: 10, fontSize: 15, fontWeight: 600,
              marginBottom: 12,
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 16l-6-6h4V4h4v6h4l-6 6z"/><path d="M4 20h16"/>
            </svg>
            Descargar para Windows · v{BRIDGE_VERSION}
          </a>

          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: C.ink4, justifyContent: 'center' }}>
            <span>Windows 10/11</span>
            <span>·</span>
            <span>{BRIDGE_SIZE}</span>
            <span>·</span>
            <span>Sin antivirus issues</span>
          </div>

          <div style={{ marginTop: 20, borderTop: `1px solid ${C.rule}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { n: '1', t: 'Descarga y ejecuta. Si Windows avisa, "Más información → Ejecutar de todas formas"' },
              { n: '2', t: 'Pega tu token desde /owner → Impresoras → Bridge' },
              { n: '3', t: 'Listo. Se registra en el inicio de Windows y arranca solo' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.rule, color: C.ink3, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{s.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Demo */}
        <div style={{ textAlign: 'center', marginTop: 40, padding: '20px', background: C.bone, borderRadius: 12, border: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 13, color: C.ink3, marginBottom: 10 }}>¿Quieres ver ia.rest antes de instalar?</div>
          <a href="/login?t=62d3124f5185d326ba0e5632" style={{ color: C.red, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Acceder a la demo →
          </a>
        </div>

      </div>
    </div>
  )
}
