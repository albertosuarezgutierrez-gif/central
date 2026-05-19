'use client'
import { SE, SN, SM } from '@/lib/colors'
import React, { useState, useEffect } from 'react'


const C = {
  bg:   '#14110E',
  bg2:  '#1E1916',
  card: '#221E1A',
  rule: '#2E2923',
  ink:  '#F6F1E7',
  ink3: '#D8CDB6',
  ink4: '#8C7B6B',
  verm: '#D9442B',
  gr:   '#3F7D44',
  amb:  '#E8A33B',
}

interface Props {
  session: { id: string; restaurante_id: string; nombre: string; rol: string }
  onFichado: (turnoId: string) => void
  onSaltar:  () => void
}

export default function FicharEntradaModal({ session, onFichado, onSaltar }: Props) {
  const [loading, setLoading] = useState(false)
  const [hora,    setHora]    = useState('')
  const [turnoYaActivo, setTurnoYaActivo] = useState<{ id: string; entrada_at: string } | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const iv = setInterval(tick, 10000)
    return () => clearInterval(iv)
  }, [])

  // Comprobar si ya tiene turno activo (sesión previa sin fichar salida)
  useEffect(() => {
    const ses = JSON.stringify(session)
    fetch('/api/turnos/activo', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => { if (d.turno) setTurnoYaActivo(d.turno) })
      .finally(() => setChecking(false))
  }, [session])

  const fichar = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/turnos/fichar', {
        method: 'POST',
        headers: { 'x-ia-session': JSON.stringify(session) },
      })
      const d = await r.json()
      if (d.ok) onFichado(d.turno_id)
      else onSaltar()
    } catch {
      onSaltar()
    }
  }

  const nombreRol: Record<string, string> = {
    camarero: 'Camarero',
    cocina:   'Cocina',
    jefe_sala:'Jefe de sala',
    running:  'Running',
  }

  if (checking) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <p style={{ fontFamily: SM, fontSize: 11, color: C.ink4, textAlign: 'center' }}>Comprobando turno...</p>
        </div>
      </div>
    )
  }

  // Si ya tiene turno activo, mostrar info y entrar
  if (turnoYaActivo) {
    const desde = new Date(turnoYaActivo.entrada_at)
    const mins  = Math.floor((Date.now() - desde.getTime()) / 60000)
    const durTxt = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}min`
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.amb, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Turno en curso
          </div>
          <div style={{ fontFamily: SE, fontSize: 22, color: C.ink, marginBottom: 4 }}>
            ¡Hola, {session.nombre.split(' ')[0]}!
          </div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 24 }}>
            Ya llevas <strong style={{ color: C.amb }}>{durTxt}</strong> trabajando desde las {desde.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={onSaltar} style={btnPrimaryStyle}>
            Entrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${C.gr}22`, border: `1.5px solid ${C.gr}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {nombreRol[session.rol] ?? session.rol}
            </div>
            <div style={{ fontFamily: SE, fontSize: 20, color: C.ink, fontStyle: 'italic' }}>
              {session.nombre.split(' ')[0]}
            </div>
          </div>
        </div>

        {/* Hora actual */}
        <div style={{ textAlign: 'center', marginBottom: 24, padding: '16px 0', borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: SM, fontSize: 36, color: C.ink, letterSpacing: '.04em' }}>{hora}</div>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, marginTop: 4 }}>
            {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* Pregunta */}
        <div style={{ fontFamily: SN, fontSize: 15, color: C.ink3, textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
          ¿Quieres registrar tu <strong style={{ color: C.ink }}>entrada</strong>?
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={fichar}
            disabled={loading}
            style={btnPrimaryStyle}
          >
            {loading ? 'Fichando...' : 'Sí, fichar entrada'}
          </button>
          <button
            onClick={onSaltar}
            style={btnGhostStyle}
          >
            Entrar sin fichar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: `${C.bg}F0`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.rule}`,
  borderRadius: 16,
  padding: '28px 24px',
  width: '100%',
  maxWidth: 360,
  boxShadow: '0 24px 48px rgba(0,0,0,.5)',
}

const btnPrimaryStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 0',
  background: '#3F7D44',
  border: 'none',
  borderRadius: 10,
  fontFamily: SN,
  fontSize: 14,
  fontWeight: 700,
  color: '#fff',
  cursor: 'pointer',
  letterSpacing: '.02em',
}

const btnGhostStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 0',
  background: 'transparent',
  border: `1px solid ${C.rule}`,
  borderRadius: 10,
  fontFamily: SN,
  fontSize: 13,
  color: C.ink4,
  cursor: 'pointer',
}
