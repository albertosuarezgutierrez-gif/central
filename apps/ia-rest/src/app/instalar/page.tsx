'use client'
import { SE, SN, SM } from '@/lib/colors'
import { useEffect, useState } from 'react'
import { BRIDGE_VERSION, BRIDGE_SIZE, BRIDGE_EXE_URL } from '@/lib/bridge-config'

const C = {
  bg:   '#F6F1E7',
  bg2:  '#EDE8DC',
  bg3:  '#E4DDD0',
  rule: '#D4CBB8',
  fg:   '#1A1714',
  fg2:  '#2C2520',
  fg3:  '#7A6D5E',
  verm: '#D9442B',
  gr:   '#3F7D44',
}


export default function InstalarPage() {
  const [downloaded, setDownloaded] = useState(false)
  const [os, setOs] = useState<'windows'|'other'>('windows')

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    setOs(ua.includes('win') ? 'windows' : 'other')
  }, [])

  const handleDownload = () => {
    window.location.href = BRIDGE_EXE_URL
    setDownloaded(true)
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px 80px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;1,400;1,600&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 40, animation: 'fadeUp .4s ease' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 56 56">
            <rect width="56" height="56" rx="8" fill="#1F1A15"/>
            <g transform="translate(11,14)">
              <rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/>
              <rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/>
              <rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/>
              <rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/>
              <rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/>
              <rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/>
            </g>
          </svg>
          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.verm, letterSpacing: '-.4px' }}>ia.rest</span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 36, fontWeight: 400, color: C.fg, lineHeight: 1.15 }}>
            Instala ia.rest<br/>en tu restaurante
          </h1>
          <p style={{ fontFamily: SN, fontSize: 15, color: C.fg3, lineHeight: 1.6 }}>
            El asistente de instalación configura el bridge y tus impresoras automáticamente en menos de 5 minutos. Solo necesitas la referencia que recibiste por email.
          </p>
        </div>

        {/* Pasos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { n: '1', txt: 'Descarga el instalador en el PC del TPV' },
            { n: '2', txt: 'Doble clic y sigue el asistente' },
            { n: '3', txt: 'Introduce tu referencia de ia.rest' },
            { n: '4', txt: 'El asistente detecta tus impresoras y las configura solo' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.verm}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontFamily: SM, fontSize: 11, color: C.verm, fontWeight: 700,
              }}>{s.n}</div>
              <span style={{ fontFamily: SN, fontSize: 14, color: C.fg2, paddingTop: 5, lineHeight: 1.4 }}>{s.txt}</span>
            </div>
          ))}
        </div>

        {/* Botón descarga o aviso si no es Windows */}
        {os === 'windows' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={handleDownload}
              style={{
                background: C.verm, border: 'none', borderRadius: 12,
                color: C.fg, cursor: 'pointer', fontFamily: SN,
                fontSize: 16, fontWeight: 700, padding: '16px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#C03A24')}
              onMouseLeave={e => (e.currentTarget.style.background = C.verm)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Descargar iarest-setup-v{BRIDGE_VERSION}.exe
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
              <span style={{ fontFamily: SM, fontSize: 10, color: C.fg3 }}>Windows 10 / 11 · 64 bits</span>
              <span style={{ fontFamily: SM, fontSize: 10, color: C.fg3 }}>v{BRIDGE_VERSION} · {BRIDGE_SIZE}</span>
            </div>
          </div>
        ) : (
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontFamily: SN, fontSize: 14, color: C.fg2 }}>
              El instalador es para Windows. Ábrelo desde el PC del TPV del restaurante.
            </p>
            <a href={BRIDGE_EXE_URL} style={{ fontFamily: SM, fontSize: 12, color: C.verm, textDecoration: 'none' }}>
              Descargar igualmente →
            </a>
          </div>
        )}

        {/* Tras descarga */}
        {downloaded && (
          <div style={{
            background: 'rgba(63,125,68,0.1)', border: '1px solid rgba(63,125,68,0.35)',
            borderRadius: 10, padding: '14px 16px',
            fontFamily: SN, fontSize: 13, color: '#6DBF74', lineHeight: 1.5,
            animation: 'fadeUp .3s ease',
          }}>
            ✓ Descarga iniciada — busca <span style={{ fontFamily: SM }}>iarest-setup-v{BRIDGE_VERSION}.exe</span> en tu carpeta de Descargas y dale doble clic.
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: `1px solid ${C.rule}` }}>
          <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, lineHeight: 1.5 }}>
            ¿Tienes problemas? Escríbenos a{' '}
            <a href="mailto:soporte@iarest.es" style={{ color: C.verm, textDecoration: 'none' }}>soporte@iarest.es</a>
          </p>
          <a href="/owner" style={{ fontFamily: SN, fontSize: 12, color: C.fg3, textDecoration: 'none' }}>
            Ir al panel de control →
          </a>
        </div>

      </div>
    </div>
  )
}
