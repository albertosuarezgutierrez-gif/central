'use client'
/**
 * AppBadge — badge global de identidad
 * Aparece en esquina inferior izquierda en todas las rutas privadas.
 * Muestra: entorno (DEMO/PROD) · restaurante · rol · versión
 */
import { useEffect, useState } from 'react'

const APP_VERSION = '2.6.0'

// Rutas donde NO debe aparecer
const PUBLIC_PATHS = ['/', '/login', '/registro', '/blog', '/pricing',
  '/comanda-por-voz', '/tienda', '/q/', '/pedido/', '/propuesta',
  '/contrato-iarest-v1.pdf']

interface Session {
  restaurante_id?: string
  restaurante_nombre?: string
  nombre?: string
  rol?: string
}

export default function AppBadge() {
  const [session, setSession] = useState<Session | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const path = window.location.pathname
    const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith(p))
    if (isPublic) return

    const raw = localStorage.getItem('ia_rest_session')
    if (!raw) return

    try {
      const s: Session = JSON.parse(raw)
      setSession(s)
      setVisible(true)
    } catch { /* noop */ }
  }, [])

  if (!visible || !session) return null

  const isDemo = session.restaurante_id === '00000000-0000-0000-0000-000000000001'
  const restaurante = session.restaurante_nombre ?? 'ia.rest'
  const rol = session.rol ?? ''

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        left: 10,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(20,17,14,0.82)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20,
        padding: '4px 10px 4px 6px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Pill DEMO o dot PROD */}
      {isDemo ? (
        <span style={{
          fontFamily: 'Inter Tight, sans-serif',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '.08em',
          background: '#E8A33B',
          color: '#14110E',
          borderRadius: 10,
          padding: '2px 6px',
          lineHeight: 1,
        }}>
          DEMO
        </span>
      ) : (
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#3F7D44',
          flexShrink: 0,
          display: 'inline-block',
        }} />
      )}

      {/* Restaurante */}
      <span style={{
        fontFamily: 'Inter Tight, sans-serif',
        fontSize: 10,
        fontWeight: 500,
        color: '#F6F1E7',
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {restaurante}
      </span>

      {/* Separador */}
      <span style={{ color: 'rgba(246,241,231,0.3)', fontSize: 10 }}>·</span>

      {/* Rol */}
      {rol && (
        <>
          <span style={{
            fontFamily: 'Inter Tight, sans-serif',
            fontSize: 9,
            color: 'rgba(246,241,231,0.55)',
            textTransform: 'uppercase',
            letterSpacing: '.05em',
          }}>
            {rol.replace('_', ' ')}
          </span>
          <span style={{ color: 'rgba(246,241,231,0.3)', fontSize: 10 }}>·</span>
        </>
      )}

      {/* Versión */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        color: 'rgba(246,241,231,0.4)',
        letterSpacing: '.03em',
      }}>
        v{APP_VERSION}
      </span>
    </div>
  )
}
