'use client'
import React, { useState, useEffect } from 'react'
import SmartScanModal from './SmartScanModal'

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
   * inline=true → botón compacto 30x30 para colocar en un header
   * inline=false/undefined → FAB flotante (posición fija)
   */
  inline?: boolean
  /** Solo aplica cuando inline=false */
  bottom?: number
  /** Solo aplica cuando inline=false */
  right?: number
}

export default function SmartScanFAB({ session, inline = false, bottom = 88, right = 16 }: Props) {
  const [puedeEscanear, setPuedeEscanear] = useState<boolean | null>(
    ROLES_SIEMPRE.includes(session.rol) ? true : null
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (ROLES_SIEMPRE.includes(session.rol)) {
      setPuedeEscanear(true)
      return
    }
    if (session.rol !== 'camarero') {
      setPuedeEscanear(false)
      return
    }
    const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''
    fetch('/api/scanner/permiso-check', {
      headers: { 'x-ia-session': ses },
    })
      .then(r => r.json())
      .then(d => setPuedeEscanear(!!d.puede_escanear))
      .catch(() => setPuedeEscanear(false))
  }, [session.id, session.rol])

  if (!puedeEscanear) return null

  // ── Modo inline — botón compacto para header ─────────────
  if (inline) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          title="Escáner IA — fotografía un documento"
          style={{
            position: 'relative',
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: open ? '#2A1F1A' : 'transparent',
            border: '1px solid rgba(216,205,182,.25)',
            borderRadius: 16,
            cursor: 'pointer',
            color: 'rgba(246,241,231,.65)',
            flexShrink: 0,
            transition: 'background .15s, border-color .15s',
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.background = '#2A1F1A'
            b.style.borderColor = 'rgba(216,205,182,.5)'
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.background = open ? '#2A1F1A' : 'transparent'
            b.style.borderColor = 'rgba(216,205,182,.25)'
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
            background: '#D9442B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 6, color: '#fff', fontWeight: 700,
            border: '1.5px solid #14110E',
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

  // ── Modo FAB flotante (legacy) ────────────────────────────
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Escáner IA — fotografía un documento"
        style={{
          position: 'fixed',
          bottom,
          right,
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: '#1A1714',
          border: '2px solid #D8CDB6',
          boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F6F1E7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span style={{
          position: 'absolute', top: -2, right: -2,
          width: 14, height: 14, borderRadius: '50%',
          background: '#D9442B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: '#fff', fontWeight: 700,
          border: '2px solid #F6F1E7',
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
