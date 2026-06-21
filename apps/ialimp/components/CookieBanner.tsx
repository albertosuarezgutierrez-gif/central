'use client'
import { useEffect, useState } from 'react'

// Banner informativo de cookies para la app IALIMP.
// La app solo usa cookies TÉCNICAS necesarias (sesión: ialimp_session / ialimp_prop /
// limpiadora_token), que están exentas de consentimiento (LSSI art. 22.2). Por eso el
// banner es informativo (botón "Aceptar" que lo recuerda) y enlaza la política de cookies;
// no hay cookies de seguimiento que rechazar.
const STORAGE_KEY = 'ialimp_cookies_ok'

export default function CookieBanner() {
  // Arranca oculto para no romper la hidratación; se decide en el cliente.
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
    } catch {
      /* localStorage no disponible → no mostramos nada */
    }
  }, [])

  function aceptar() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      style={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        padding: '12px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 880,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          boxShadow: '0 18px 50px -18px rgba(30,27,75,.35)',
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          fontFamily: "'Nunito', -apple-system, sans-serif",
          color: '#1e1b4b',
        }}
      >
        <div style={{ flex: '1 1 280px', minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: '#475569' }}>
          Usamos únicamente <strong>cookies técnicas necesarias</strong> para mantener tu sesión y el
          funcionamiento de la aplicación. <strong>No usamos cookies de seguimiento ni publicidad.</strong>{' '}
          <a href="/legal/cookies" style={{ color: '#4f46e5', fontWeight: 700, textDecoration: 'none' }}>
            Más información
          </a>
        </div>
        <button
          onClick={aceptar}
          style={{
            flex: '0 0 auto',
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '11px 22px',
            fontFamily: 'inherit',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(79,70,229,.3)',
          }}
        >
          Aceptar
        </button>
      </div>
    </div>
  )
}
