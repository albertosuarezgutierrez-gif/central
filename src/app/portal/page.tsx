'use client'
// src/app/portal/page.tsx
// Portal de gestión para usuarios especializados sin rol de sala
// Muestra solo los módulos asignados en camareros.modulos_gestion

import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'
import { useAuth } from '@/hooks/useAuth'
import dynamic from 'next/dynamic'

const RRHHTab     = dynamic(() => import('@/components/owner/RRHHTab'), { ssr: false })
const ForecasterTab = dynamic(() => import('@/components/owner/ForecasterTab'), { ssr: false })

const MODULOS_PORTAL = [
  { id: 'almacen',      label: 'Almacén',       icon: 'M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2' },
  { id: 'carta',        label: 'Carta',          icon: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 9h6M9 13h4' },
  { id: 'reservas',     label: 'Reservas',       icon: 'M3 9h18M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9M9 14h6' },
  { id: 'contabilidad', label: 'Contabilidad',   icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4' },
  { id: 'rrhh',         label: 'RRHH',           icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'escaner',      label: 'Escáner IA',     icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { id: 'analytics',    label: 'Analytics',      icon: 'M18 20V10M12 20V4M6 20v-6' },
]

// Módulos con componente propio ya listo
const CON_COMPONENTE = new Set(['rrhh', 'analytics'])

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {path.split('M').filter(Boolean).map((seg, i) => <path key={i} d={`M${seg}`} />)}
    </svg>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
        Este módulo estará disponible en el portal próximamente.<br />
        Por ahora puedes acceder desde el <a href="/owner" style={{ color: C.red }}>panel del dueño</a>.
      </div>
    </div>
  )
}

export default function PortalPage() {
  const { session, checking } = useAuth()
  const [tab, setTab] = useState<string | null>(null)

  const modulosGestion: string[] = session?.modulos_gestion ?? []
  const modulosVisibles = MODULOS_PORTAL.filter(m => modulosGestion.includes(m.id))

  useEffect(() => {
    if (modulosVisibles.length > 0 && !tab) setTab(modulosVisibles[0].id)
  }, [modulosVisibles.length, tab])

  const sh = () => {
    const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''
    return { 'x-ia-session': ses }
  }

  const logout = () => {
    fetch('/api/auth', { method: 'DELETE' })
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  if (checking) return (
    <div style={{ minHeight: '100dvh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, letterSpacing: '.12em' }}>Cargando…</span>
    </div>
  )

  if (!session) {
    if (typeof window !== 'undefined') window.location.href = '/login'
    return null
  }

  if (modulosGestion.length === 0) return (
    <div style={{ minHeight: '100dvh', background: C.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink }}>Sin módulos asignados</div>
      <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
        Tu cuenta no tiene módulos de gestión asignados.<br />
        El dueño puede configurarlos en Personal → Permisos.
      </div>
      <button onClick={logout} style={{ fontFamily: SN, fontSize: 12, color: C.red, background: 'none', border: `1px solid ${C.red}`, borderRadius: 6, padding: '8px 16px', cursor: 'pointer', marginTop: 8 }}>
        Cerrar sesión
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: C.paper, display: 'flex', flexDirection: 'column', fontFamily: SN }}>

      {/* HEADER */}
      <div style={{ height: 52, padding: '0 20px', borderBottom: `1px solid ${C.rule}`, background: C.bone, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.red }}>ia.rest</span>
          <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>· Portal gestión</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2, fontWeight: 500 }}>{session.nombre}</span>
          <button onClick={logout} style={{ fontFamily: SN, fontSize: 10, fontWeight: 600, color: C.ink3, background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* SIDEBAR */}
        <div style={{ width: 200, background: C.bone, borderRight: `1px solid ${C.rule}`, padding: '16px 8px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {modulosVisibles.map(m => (
            <button key={m.id} onClick={() => setTab(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '9px 10px', background: tab === m.id ? C.paper2 : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontFamily: SN, fontSize: 13,
              fontWeight: tab === m.id ? 600 : 500,
              color: tab === m.id ? C.ink : C.ink2,
              textAlign: 'left', width: '100%',
            }}>
              <NavIcon path={m.icon} />
              {m.label}
            </button>
          ))}
          {/* Enlace al panel completo si también es owner/jefe */}
          {(session.rol === 'owner' || session.rol === 'jefe_sala') && (
            <a href={session.rol === 'owner' ? '/owner' : '/jefe'} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              background: C.red, borderRadius: 6, color: '#fff',
              textDecoration: 'none', fontSize: 12, fontWeight: 600, marginTop: 'auto',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3"/></svg>
              Panel completo
            </a>
          )}
        </div>

        {/* CONTENIDO */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {tab === 'rrhh'      && <RRHHTab sh={sh} />}
          {tab === 'analytics' && <ForecasterTab sh={sh} />}
          {tab && !CON_COMPONENTE.has(tab) && <Placeholder label={modulosVisibles.find(m => m.id === tab)?.label ?? tab} />}
        </div>
      </div>
    </div>
  )
}
