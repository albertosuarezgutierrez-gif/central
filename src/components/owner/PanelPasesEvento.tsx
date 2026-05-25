'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type PaseItem = { id: string; nombre: string; cantidad: number; estado: string }
type Pase = {
  id: string; numero_pase: number; nombre: string; hora_prevista: string | null
  comensales: number | null; estado: string; hora_inicio_at: string | null
  hora_lista_at: string | null; hora_real: string | null; notas: string | null
  items: PaseItem[]
}

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:       { label: 'En espera',   color: '#6B5F52' },
  en_preparacion:  { label: 'Preparando',  color: '#E8A33B' },
  listo:           { label: '¡Listo!',     color: '#3F7D44' },
  servido:         { label: 'Servido',     color: '#9CA3AF' },
}

export default function PanelPasesEvento({ eventoId, sh }: { eventoId: string; sh: () => Record<string, string> }) {
  const [pases, setPases] = useState<Pase[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ numero_pase: '', nombre: '', hora_prevista: '', comensales: '', notas: '' })
  const [saving, setSaving] = useState(false)
  const [act, setAct] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/owner/eventos/pases?evento_id=${eventoId}`, { headers: sh() })
    const d = await r.json()
    setPases(d.pases ?? [])
    setLoading(false)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  const crearPase = async () => {
    if (!form.nombre) return
    setSaving(true)
    await fetch('/api/owner/eventos/pases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ evento_id: eventoId, numero_pase: +form.numero_pase || pases.length + 1, nombre: form.nombre, hora_prevista: form.hora_prevista || null, comensales: form.comensales ? +form.comensales : null, notas: form.notas || null }),
    })
    setMostrarForm(false)
    setForm({ numero_pase: '', nombre: '', hora_prevista: '', comensales: '', notas: '' })
    setSaving(false)
    cargar()
  }

  const cambiarEstado = async (paseId: string, estado: string) => {
    setAct(paseId)
    const accion = estado === 'en_preparacion' ? 'iniciar' : estado === 'listo' ? 'listo' : 'servido'
    await fetch('/api/owner/eventos/pases', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id: paseId, estado, ...(estado === 'listo' ? { hora_real: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) } : {}) }),
    })
    setAct(null)
    cargar()
  }

  const abrirKDS = () => window.open(`/kds-evento/${eventoId}`, '_blank')

  if (loading) return <div style={{ padding: 12, color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando…</div>

  return (
    <div style={{ marginTop: 10, background: '#fff', borderRadius: 8, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700 }}>🎯 Pases ({pases.length})</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={abrirKDS} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid #2B6A6E`, background: '#2B6A6E15', color: '#2B6A6E', fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
            🖥 KDS
          </button>
          <button onClick={() => setMostrarForm(v => !v)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.green + '15', color: C.green, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
            + Pase
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px', gap: 8, marginBottom: 8 }}>
            {(['numero_pase:Nº', 'nombre:Nombre', 'hora_prevista:Hora', 'comensales:Comensales'] as const).map(s => {
              const [field, label] = s.split(':') as [keyof typeof form, string]
              return (
                <div key={field}>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>{label}</div>
                  <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 6px', fontFamily: SN, fontSize: 12, color: C.ink, boxSizing: 'border-box' as const }} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={crearPase} disabled={saving} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? '...' : 'Crear'}
            </button>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 14px' }}>
        {pases.length === 0 && <div style={{ color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center', padding: '16px' }}>Sin pases. Añade el primero.</div>}
        {pases.map(p => {
          const ec = ESTADO_CONFIG[p.estado] ?? { label: p.estado, color: C.ink3 }
          return (
            <div key={p.id} style={{ padding: '10px 0', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600 }}>Pase {p.numero_pase} — {p.nombre}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                  {p.hora_prevista && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>⏱ {p.hora_prevista}</span>}
                  {p.comensales && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>👥 {p.comensales}</span>}
                  {p.hora_real && <span style={{ fontFamily: SN, fontSize: 11, color: C.green }}>✓ {p.hora_real}</span>}
                  {p.items.length > 0 && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{p.items.length} platos</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: ec.color + '22', color: ec.color }}>
                  {ec.label}
                </span>
                {p.estado === 'pendiente' && (
                  <button onClick={() => cambiarEstado(p.id, 'en_preparacion')} disabled={act === p.id}
                    style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#E8A33B22', color: '#E8A33B', fontFamily: SN, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    ▶ Iniciar
                  </button>
                )}
                {p.estado === 'en_preparacion' && (
                  <button onClick={() => cambiarEstado(p.id, 'listo')} disabled={act === p.id}
                    style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: C.green + '22', color: C.green, fontFamily: SN, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    ✓ Listo
                  </button>
                )}
                {p.estado === 'listo' && (
                  <button onClick={() => cambiarEstado(p.id, 'servido')} disabled={act === p.id}
                    style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#6B728022', color: '#6B7280', fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                    Servido
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
