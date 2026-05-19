'use client'
import React, { useState, useEffect } from 'react'
import SmartScanModal from './SmartScanModal'

// Roles que siempre pueden escanear sin toggle
const ROLES_SIEMPRE = ['owner', 'super_admin', 'jefe_sala']

// Solo los campos que SmartScanFAB realmente usa — sin exigir restaurante_nombre
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
  /** Posición vertical desde abajo (default: 80px para dejar espacio al nav) */
  bottom?: number
  /** Posición horizontal desde la derecha */
  right?: number
}

export default function SmartScanFAB({ session, bottom = 88, right = 16 }: Props) {
  const [puedeEscanear, setPuedeEscanear] = useState<boolean | null>(
    // Roles siempre permitidos → true inmediato, sin esperar fetch
    ROLES_SIEMPRE.includes(session.rol) ? true : null
  )
  const [open, setOpen] = useState(false)

  // Para camareros: verificar permiso en BD
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

  // No mostrar si no tiene permiso (o mientras carga)
  if (!puedeEscanear) return null

  return (
    <>
      {/* Botón flotante */}
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
        {/* Icono cámara */}
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F6F1E7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        {/* Spark IA */}
        <span style={{
          position: 'absolute', top: -2, right: -2,
          width: 14, height: 14, borderRadius: '50%',
          background: '#D9442B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: '#fff', fontWeight: 700,
          border: '2px solid #F6F1E7',
        }}>✦</span>
      </button>

      {/* Modal */}
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
