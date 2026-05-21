'use client'
import React, { useState, useEffect } from 'react'
import SmartScanModal from './SmartScanModal'
import { C, DARK_C } from '@/lib/colors'

// Roles que siempre pueden escanear sin toggle
const ROLES_SIEMPRE = ['owner', 'super_admin', 'jefe_sala']

interface SessionMinima {
  id: string
  nombre: string
  rol: string
  restaurante_id: string
  cuenta_id?: string
  seccion_id?: string | null
}

interface Props {
  session: SessionMinima
  /**
   * inline=true → botón compacto para colocar en un header
   * inline=false/undefined → FAB flotante (posición fija)
   */
  inline?: boolean
  /**
   * tema del header donde se inserta el botón inline
   * 'dark' → /edge (DARK_C)  |  'light' → /owner (C)
   * Solo aplica cuando inline=true. Default: 'dark'
   */
  tema?: 'dark' | 'light'
  /** Solo aplica cuando inline=false */
  bottom?: number
  /** Solo aplica cuando inline=false */
  right?: number
}

export default function SmartScanFAB({
  session,
  inline = false,
  tema = 'dark',
  bottom = 88,
  right = 16,
}: Props) {
  const [puedeEscanear, setPuedeEscanear] = useState<boolean | null>(
    ROLES_SIEMPRE.includes(session.rol) ? true : null
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (ROLES_SIEMPRE.includes(session.rol)) { setPuedeEscanear(true); return }
    if (session.rol !== 'camarero') { setPuedeEscanear(false); return }
    const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''
    fetch('/api/scanner/permiso-check', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => setPuedeEscanear(!!d.puede_escanear))
      .catch(() => setPuedeEscanear(false))
  }, [session.id, session.rol])

  if (!puedeEscanear) return null

  // ── Modo inline — botón compacto para header ──────────────────
  if (inline) {
    const dk = tema === 'dark'
    // Espejo exacto de los botones del header en cada tema:
    // dark (/edge)  → redondo 30×30, bg=DARK_C.bg2, border=DARK_C.rule, color=DARK_C.ink3
    // light (/owner) → pill 30×30, bg=none, border=C.rule, color=C.ink3, radius=4 como resto header
    const btnStyle: React.CSSProperties = dk
      ? {
          position: 'relative',
          width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? DARK_C.bg3 : DARK_C.bg2,
          border: `1px solid ${open ? DARK_C.rule : DARK_C.rule}`,
          borderRadius: 16,
          cursor: 'pointer',
          color: DARK_C.ink3,
          flexShrink: 0,
          transition: 'background .15s',
        }
      : {
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none',
          border: `1px solid ${C.rule}`,
          borderRadius: 4,
          padding: '6px 10px',
          cursor: 'pointer',
          color: C.ink3,
          flexShrink: 0,
          transition: 'background .15s',
        }

    return (
      <>
        <button
          onClick={() => setOpen(true)}
          title="Escáner IA — fotografía un documento"
          style={btnStyle}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.background = dk ? DARK_C.bg3 : C.paper2
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.background = dk ? (open ? DARK_C.bg3 : DARK_C.bg2) : 'none'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          {/* Spark IA */}
          <span style={{
            position: 'absolute', top: -3, right: -3,
            width: 10, height: 10, borderRadius: '50%',
            background: C.red,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 6, color: '#fff', fontWeight: 700,
            border: `1.5px solid ${dk ? DARK_C.bg : C.paper}`,
          }}>✦</span>
        </button>

        {open && (
          <SmartScanModal
            onClose={() => setOpen(false)}
            sessionNombre={session.nombre}
            sessionRol={session.rol}
          />
        )}
      </>
    )
  }

  // ── Modo FAB flotante ─────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Escáner IA — fotografía un documento"
        style={{
          position: 'fixed',
          bottom, right,
          width: 50, height: 50,
          borderRadius: '50%',
          background: DARK_C.bg2,
          border: `2px solid ${DARK_C.rule}`,
          boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 800,
          transition: 'transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 22px rgba(0,0,0,.45)'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.35)'
        }}
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={DARK_C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span style={{
          position: 'absolute', top: -2, right: -2,
          width: 14, height: 14, borderRadius: '50%',
          background: C.red,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: '#fff', fontWeight: 700,
          border: `2px solid ${DARK_C.bg}`,
        }}>✦</span>
      </button>

      {open && (
        <SmartScanModal
          onClose={() => setOpen(false)}
          sessionNombre={session.nombre}
          sessionRol={session.rol}
        />
      )}
    </>
  )
}
