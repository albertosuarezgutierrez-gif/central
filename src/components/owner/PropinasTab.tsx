'use client'
// ia.rest · PropinasTab — Gestión propinas digitales

import { C, SE, SN, SM } from '@/lib/colors'
import React, { useState, useEffect, useCallback } from 'react'

interface Propina {
  id: string; importe: number | null; estado: string
  created_at: string; pagada_at: string | null
  reparto: { camarero_id: string; nombre: string; porcentaje: number; importe: number }[] | null
  token: string
}

interface Props {
  session: { id: string; nombre: string; rol: string; restaurante_id: string }
  sh: () => Record<string, string>
}

export default function PropinasTab({ session, sh }: Props) {
  const [propinas, setPropinas]   = useState<Propina[]>([])
  const [config, setConfig]       = useState({ propinas_activas: false, propinas_reparto_modo: 'equitativo', propinas_opciones_eur: [1,2,3,5] })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [opcionesInput, setOpcionesInput] = useState('1,2,3,5')
  const [msg, setMsg]             = useState('')
  const session_str = JSON.stringify(session)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/owner/propinas', { headers: { 'x-ia-session': session_str } })
      const d = await r.json()
      setPropinas(d.propinas ?? [])
      if (d.config) {
        setConfig(d.config)
        setOpcionesInput((d.config.propinas_opciones_eur ?? [1,2,3,5]).join(','))
      }
    } catch { /* noop */ }
    setLoading(false)
  }, [session_str])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setSaving(true)
    const opciones = opcionesInput.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0)
    await fetch('/api/owner/propinas/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
      body: JSON.stringify({ ...config, propinas_opciones_eur: opciones }),
    })
    setMsg('Guardado ✓'); setTimeout(() => setMsg(''), 2000)
    setSaving(false)
  }

  const totalHoy = propinas
    .filter(p => p.estado === 'pagada' && p.pagada_at && new Date(p.pagada_at).toDateString() === new Date().toDateString())
    .reduce((a, p) => a + (p.importe ?? 0), 0)

  const totalMes = propinas
    .filter(p => p.estado === 'pagada' && p.pagada_at)
    .reduce((a, p) => a + (p.importe ?? 0), 0)

  return (
    <div style={{ padding: '0 0 40px', fontFamily: SN, color: C.ink }}>

      {/* Config */}
      <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 17, color: C.ink }}>Propinas digitales</div>
            <div style={{ fontSize: 12, color: C.ink4, marginTop: 2 }}>El cliente paga propina con tarjeta desde el QR</div>
          </div>
          <button onClick={() => setConfig(c => ({ ...c, propinas_activas: !c.propinas_activas }))}
            style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: config.propinas_activas ? C.green : C.rule, position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: config.propinas_activas ? 24 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </button>
        </div>

        {/* Modo reparto */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.ink4, marginBottom: 6, fontFamily: SM, letterSpacing: '.05em', textTransform: 'uppercase' as const }}>Modo de reparto</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: 'equitativo', l: 'Entre todo el turno' }, { v: 'mesa', l: 'Solo camarero de mesa' }].map(opt => (
              <button key={opt.v} onClick={() => setConfig(c => ({ ...c, propinas_reparto_modo: opt.v }))}
                style={{ padding: '8px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                  background: config.propinas_reparto_modo === opt.v ? `${C.amb}22` : C.dark,
                  color: config.propinas_reparto_modo === opt.v ? C.amb : C.ink3,
                  outline: config.propinas_reparto_modo === opt.v ? `1.5px solid ${C.amb}` : `1px solid ${C.rule}`,
                }}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Opciones importe */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.ink4, marginBottom: 6, fontFamily: SM, letterSpacing: '.05em', textTransform: 'uppercase' as const }}>Importes sugeridos (€, separados por comas)</div>
          <input value={opcionesInput} onChange={e => setOpcionesInput(e.target.value)}
            placeholder="1, 2, 3, 5"
            style={{ width: '100%', background: C.dark, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 14px', color: C.ink, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={guardar} disabled={saving}
            style={{ padding: '8px 18px', background: C.red, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? .7 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {msg && <span style={{ fontSize: 12, color: C.green }}>{msg}</span>}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: C.amb }}>{totalHoy.toFixed(2)}€</div>
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Hoy</div>
        </div>
        <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: C.paper }}>{totalMes.toFixed(2)}€</div>
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Total acumulado</div>
        </div>
        <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: C.green }}>{propinas.filter(p=>p.estado==='pagada').length}</div>
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Propinas pagadas</div>
        </div>
      </div>

      {/* Lista */}
      {loading && <div style={{ color: C.ink4, fontSize: 13, padding: 24, textAlign: 'center' }}>Cargando…</div>}
      {!loading && propinas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💰</div>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink3 }}>Sin propinas todavía</div>
          <div style={{ fontSize: 13, color: C.ink4, marginTop: 6 }}>Activa las propinas y aparecerá el botón en el QR de mesa</div>
        </div>
      )}
      {propinas.slice(0,50).map(p => (
        <div key={p.id} style={{ background: C.bg2, border: `1px solid ${p.estado==='pagada'?C.green:C.rule}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: p.reparto?.length ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{p.estado === 'pagada' ? '💝' : '⏳'}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: p.estado==='pagada'?C.green:C.ink3 }}>
                  {p.importe ? `${p.importe.toFixed(2)}€` : '—'}
                </div>
                <div style={{ fontSize: 11, color: C.ink4, marginTop: 1 }}>
                  {p.pagada_at ? new Date(p.pagada_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Pendiente'}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 10, fontFamily: SM, padding: '3px 10px', borderRadius: 20, background: p.estado==='pagada'?`${C.green}22`:C.dark, color: p.estado==='pagada'?C.green:C.ink4 }}>
              {p.estado === 'pagada' ? 'PAGADA' : 'PENDIENTE'}
            </span>
          </div>
          {p.reparto && p.reparto.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {p.reparto.map(r => (
                <div key={r.camarero_id} style={{ background: C.dark, borderRadius: 8, padding: '4px 10px', fontSize: 11, color: C.ink3 }}>
                  {r.nombre} · <strong style={{ color: C.amb }}>{r.importe.toFixed(2)}€</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
