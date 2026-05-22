'use client'
// src/app/contable/page.tsx
// Módulo de contabilidad — accesible por cualquier persona con modulos_gestion: ['contabilidad']
// Mismo patrón que almacén, escáner, RRHH: el owner lo activa por persona desde /owner → Personal

import { useEffect, useState, useCallback } from 'react'
import ContabilidadTab from '@/components/owner/ContabilidadTab'
import { C, SE, SN, SM } from '@/lib/colors'

type Session = {
  id: string; nombre: string; rol: string
  restaurante_id: string; restaurante_nombre: string
  modulos_gestion?: string[]
}

export default function ContablePage() {
  const [session, setSession]   = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [noAcceso, setNoAcceso] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('ia_rest_session')
    if (!raw) {
      const ret = encodeURIComponent('/contable')
      window.location.href = `/login?return=${ret}`
      return
    }

    let s: Session
    try { s = JSON.parse(raw) } catch {
      window.location.href = '/login'
      return
    }

    // Owner y super_admin siempre tienen acceso a contabilidad
    const esOwner = ['owner', 'super_admin'].includes(s.rol)
    const tieneModulo = (s.modulos_gestion ?? []).includes('contabilidad')

    if (!esOwner && !tieneModulo) {
      setNoAcceso(true)
      setChecking(false)
      return
    }

    setSession(s)
    setChecking(false)
  }, [])

  const sh = useCallback(() => ({
    'x-ia-session': localStorage.getItem('ia_rest_session') ?? ''
  }), [])

  if (checking) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink3 }}>Cargando…</div>
    </div>
  )

  if (noAcceso) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.bg2, borderRadius: 14, padding: 32, maxWidth: 340, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink, marginBottom: 8 }}>Sin acceso</div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>
          El módulo de Contabilidad no está activado para este usuario. El owner puede habilitarlo desde{' '}
          <strong style={{ color: C.ink }}>Personal → editar usuario → Módulos</strong>.
        </div>
        <button onClick={() => window.location.href = '/login'}
          style={{ marginTop: 16, fontFamily: SN, fontSize: 12, padding: '8px 16px', background: 'none', border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink3, cursor: 'pointer' }}>
          Volver al inicio
        </button>
      </div>
    </div>
  )

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink }}>
      {/* Header */}
      <div style={{ background: C.bg2, borderBottom: `1px solid ${C.rule}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.verm }}>ia.rest</div>
          <div style={{ width: 1, height: 16, background: C.rule }} />
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink }}>Contabilidad</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
            {session.nombre} · <span style={{ color: C.ink4 }}>{session.restaurante_nombre}</span>
          </div>
          <button onClick={() => { localStorage.removeItem('ia_rest_session'); window.location.href = '/login' }}
            style={{ fontFamily: SN, fontSize: 11, padding: '4px 10px', background: 'none', border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink4, cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </div>

      {/* Panel contabilidad — mismo componente que usa /owner */}
      <ContabilidadTab sh={sh} />
    </div>
  )
}
