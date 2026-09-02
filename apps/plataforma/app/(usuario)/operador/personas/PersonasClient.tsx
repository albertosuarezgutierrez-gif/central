'use client'
import { useMemo, useState } from 'react'

type Rol = { vertical: 'ialimp' | 'rrhh'; rol: string; ref: string; nombre: string; email: string | null; dni: string | null; empresa: string | null; persona_id: string | null }
type Persona = { persona_id: string | null; nombre: string; roles: Rol[]; multivertical: boolean }
type Sugerencia = { confianza: 'probable' | 'posible'; motivo: string; a: Rol; b: Rol }

const VICON: Record<string, string> = { ialimp: '🧹', rrhh: '👥' }
const VLABEL: Record<string, string> = { ialimp: 'ialimp', rrhh: 'iarrhh' }

export default function PersonasClient({ personas, sugerencias, rrhhDisponible }: { personas: Persona[]; sugerencias: Sugerencia[]; rrhhDisponible: boolean }) {
  const [q, setQ] = useState('')
  const [soloMulti, setSoloMulti] = useState(false)

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return personas.filter(p => {
      if (soloMulti && !p.multivertical) return false
      if (!t) return true
      return p.nombre.toLowerCase().includes(t) || p.roles.some(r => (r.email ?? '').toLowerCase().includes(t) || (r.dni ?? '').toLowerCase().includes(t))
    })
  }, [personas, q, soloMulti])

  const multi = personas.filter(p => p.multivertical).length

  return (
    <div style={{ padding: '24px clamp(16px,4vw,40px)', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>👤 Personas a través de verticales</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
        Consolidación por <code>persona_id</code> (solo lectura). {personas.length} personas · <b>{multi}</b> en más de una vertical.
        {!rrhhDisponible && <span style={{ color: 'var(--warning)' }}> · ⚠️ iarrhh no disponible (sin RRHH_URL/secret): solo se ven las de ialimp.</span>}
      </p>

      {/* Sugerencias de enlace */}
      {sugerencias.length > 0 && (
        <section style={{ background: 'var(--warning-bg)', border: '1px solid #fde68a', borderRadius: 12, padding: 16, margin: '16px 0' }}>
          <div style={{ fontWeight: 800, color: 'var(--warning)', marginBottom: 8 }}>🔗 Posibles enlaces ({sugerencias.length})</div>
          <p style={{ fontSize: 13, color: 'var(--warning)', marginTop: 0 }}>Parejas que parecen la misma persona pero aún no comparten <code>persona_id</code>. El enlace manual se hará desde aquí (pendiente); de momento es informativo.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sugerencias.map((s, i) => (
              <div key={i} className="personas-sugerencia" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, background: 'white', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                <span style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: s.confianza === 'probable' ? 'var(--positive-bg)' : 'var(--warning-bg)', color: s.confianza === 'probable' ? 'var(--positive)' : 'var(--warning)' }}>
                  {s.confianza === 'probable' ? '● Probable' : '○ Posible'} · {s.motivo}
                </span>
                <span>{VICON[s.a.vertical]} {s.a.nombre} <span style={{ color: 'var(--muted)' }}>({VLABEL[s.a.vertical]})</span></span>
                <span style={{ color: 'var(--muted)' }}>↔</span>
                <span>{VICON[s.b.vertical]} {s.b.nombre} <span style={{ color: 'var(--muted)' }}>({VLABEL[s.b.vertical]})</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', margin: '12px 0' }}>
        <input placeholder="Buscar por nombre, email o DNI…" value={q} onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14 }} />
        <label style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={soloMulti} onChange={e => setSoloMulti(e.target.checked)} /> Solo multivertical
        </label>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibles.map((p, i) => (
          <div key={p.persona_id ?? `s${i}`} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', borderLeft: p.multivertical ? '4px solid #6366f1' : '4px solid var(--border)' }}>
            <div className="personas-list-item" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{p.nombre}</span>
              {p.multivertical && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#eef2ff', color: '#4f46e5' }}>misma persona · {p.roles.length} roles</span>}
              {!p.persona_id && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(sin persona_id)</span>}
            </div>
            <div className="personas-roles" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {p.roles.map((r, j) => (
                <span key={j} style={{ fontSize: 12, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
                  {VICON[r.vertical]} <b>{r.rol}</b> · {VLABEL[r.vertical]}{r.empresa ? ` · ${r.empresa}` : ''}{r.email ? ` · ${r.email}` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
        {visibles.length === 0 && <div style={{ color: 'var(--muted)', padding: '24px 0', textAlign: 'center' }}>Ninguna persona coincide.</div>}
      </div>
    </div>
  )
}
