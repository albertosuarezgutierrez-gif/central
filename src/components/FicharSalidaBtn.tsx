'use client'
import React, { useState, useEffect } from 'react'

const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SE = "'Newsreader',Georgia,serif"
const C  = { bg:'#14110E', card:'#221E1A', rule:'#2E2923', ink:'#F6F1E7', ink3:'#D8CDB6', ink4:'#8C7B6B', verm:'#D9442B', gr:'#3F7D44', amb:'#E8A33B' }

interface Props {
  session: { id: string; restaurante_id: string; nombre: string; rol: string }
  onSalida?: (horas: number) => void // callback opcional al fichar salida
}

export default function FicharSalidaBtn({ session, onSalida }: Props) {
  const [turno, setTurno]         = useState<{ id: string; entrada_at: string } | null>(null)
  const [duracion, setDuracion]   = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState<{ horas: number } | null>(null)

  const ses = JSON.stringify(session)

  // Cargar turno activo al montar
  useEffect(() => {
    fetch('/api/turnos/activo', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => setTurno(d.turno ?? null))
  }, [ses])

  // Actualizar contador de horas cada minuto
  useEffect(() => {
    if (!turno) return
    const calc = () => {
      const mins = Math.floor((Date.now() - new Date(turno.entrada_at).getTime()) / 60000)
      if (mins < 60) setDuracion(`${mins} min`)
      else setDuracion(`${Math.floor(mins/60)}h ${mins%60}min`)
    }
    calc()
    const iv = setInterval(calc, 60000)
    return () => clearInterval(iv)
  }, [turno])

  const ficharSalida = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/turnos/fichar', {
        method: 'DELETE',
        headers: { 'x-ia-session': ses },
      })
      const d = await r.json()
      if (d.ok) {
        setDone({ horas: d.horas })
        setTurno(null)
        setConfirmar(false)
        onSalida?.(d.horas)
      }
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={{ background: `${C.gr}15`, border: `1px solid ${C.gr}44`, borderRadius: 10, padding: '12px 14px', marginTop: 8 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.gr, letterSpacing: '.1em', textTransform: 'uppercase' }}>Salida fichada</div>
        <div style={{ fontFamily: SE, fontSize: 18, color: C.ink, marginTop: 2, fontStyle: 'italic' }}>
          {done.horas}h trabajadas hoy
        </div>
      </div>
    )
  }

  if (!turno) {
    // Sin turno activo — ofrecer fichar entrada tardía
    return (
      <FicharEntradaTardia session={session} onFichado={t => setTurno(t)} />
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Info turno activo */}
      <div style={{ background: `${C.gr}15`, border: `1px solid ${C.gr}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.gr, letterSpacing: '.1em', textTransform: 'uppercase' }}>Turno activo</div>
          <div style={{ fontFamily: SM, fontSize: 14, color: C.ink, marginTop: 2 }}>
            {duracion} · desde las {new Date(turno.entrada_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.gr, boxShadow: `0 0 6px ${C.gr}` }} />
      </div>

      {/* Botón fichar salida */}
      {!confirmar ? (
        <button
          onClick={() => setConfirmar(true)}
          style={{ width: '100%', padding: '12px 0', background: 'transparent', border: `1px solid ${C.verm}55`, borderRadius: 10, fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.verm, cursor: 'pointer' }}
        >
          Fichar salida
        </button>
      ) : (
        <div style={{ background: `${C.verm}10`, border: `1px solid ${C.verm}44`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 12 }}>
            ¿Confirmas la salida? Se registrarán <strong style={{ color: C.ink }}>{duracion}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmar(false)} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, fontFamily: SN, fontSize: 12, color: C.ink4, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={ficharSalida} disabled={loading} style={{ flex: 2, padding: '10px 0', background: C.verm, border: 'none', borderRadius: 8, fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              {loading ? 'Fichando...' : 'Confirmar salida'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponente: entrada tardía (si alguien entra sin haber fichado) ─────────

function FicharEntradaTardia({ session, onFichado }: {
  session: { id: string; restaurante_id: string }
  onFichado: (turno: { id: string; entrada_at: string }) => void
}) {
  const [loading, setLoading] = useState(false)
  const ses = JSON.stringify(session)

  const fichar = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/turnos/fichar', { method: 'POST', headers: { 'x-ia-session': ses } })
      const d = await r.json()
      if (d.ok) onFichado({ id: d.turno_id, entrada_at: new Date().toISOString() })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={fichar}
        disabled={loading}
        style={{ width: '100%', padding: '12px 0', background: 'transparent', border: `1px solid ${C.gr}55`, borderRadius: 10, fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.gr, cursor: 'pointer' }}
      >
        {loading ? 'Fichando...' : 'Fichar entrada'}
      </button>
      <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textAlign: 'center', marginTop: 6 }}>
        No tienes turno activo registrado
      </div>
    </div>
  )
}
