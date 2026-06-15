'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { photoSrc } from '@/lib/photo'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb', red: '#dc2626', redBg: '#fef2f2',
}

const TABS = [
  { k: 'abierta',  label: 'Abiertas',  icon: '📋' },
  { k: 'resuelta', label: 'Resueltas', icon: '✅' },
  { k: 'todas',    label: 'Todas',     icon: '🗂️' },
]

function fmtFecha(t?: string | null) {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ── Tarjeta de incidencia ── */
function IncidenciaCard({ inc, onCambiada }: { inc: any; onCambiada: () => void }) {
  const [nota, setNota] = useState(inc.notas_admin || '')
  const [saving, setSaving] = useState(false)
  const [foto, setFoto] = useState(false)
  const esUrgente = inc.urgencia === 'urgente'
  const resuelta = inc.estado === 'resuelta'

  async function actualizar(estado: string) {
    setSaving(true)
    const r = await fetch('/api/admin/incidencias', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inc.id, estado, notas_admin: nota || null }),
    })
    if (r.status === 401) { window.location.href = '/login'; return }
    setSaving(false)
    if (r.ok) onCambiada()
  }

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: `1px solid ${esUrgente ? '#fca5a5' : C.border}`,
      borderLeft: `4px solid ${esUrgente ? C.red : resuelta ? C.ok : C.primary}`,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text, flex: 1, minWidth: 0 }}>{inc.titulo}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {esUrgente && (
            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: C.redBg, color: C.red, border: `1px solid #fca5a5` }}>
              🔴 URGENTE
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
            background: resuelta ? C.okBg : C.light, color: resuelta ? C.ok : C.primary }}>
            {resuelta ? '✅ Resuelta' : '📋 Abierta'}
          </span>
        </div>
      </div>

      {/* Descripción */}
      {inc.descripcion && (
        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{inc.descripcion}</div>
      )}

      {/* Meta */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: C.muted }}>
        <span>🏠 {inc.propiedad_nombre || inc.property_id || '—'}</span>
        <span>🧹 {inc.limpiadora_nombre || '—'}</span>
        {inc.categoria && <span>🏷️ {inc.categoria}</span>}
        <span>🕒 {fmtFecha(inc.created_at)}</span>
      </div>

      {/* Foto */}
      {inc.photo_url && (
        <img
          src={photoSrc(inc.photo_url)}
          alt="Foto de la incidencia"
          onClick={() => setFoto(true)}
          style={{ maxWidth: '100%', maxHeight: 260, width: 'auto', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'zoom-in', objectFit: 'cover' }}
        />
      )}

      {/* Acciones según estado */}
      {!resuelta ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Nota del admin (opcional)…"
            rows={2}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <button onClick={() => actualizar('resuelta')} disabled={saving}
            style={{ alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 9, border: 'none', background: C.ok, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
            {saving ? 'Guardando…' : '✅ Marcar como resuelta'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          {inc.notas_admin && (
            <div style={{ background: C.okBg, border: `1px solid #bbf7d0`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text }}>
              <strong style={{ color: C.ok }}>Nota del admin: </strong>{inc.notas_admin}
            </div>
          )}
          {inc.resolved_at && (
            <div style={{ fontSize: 12, color: C.muted }}>Resuelta el {fmtFecha(inc.resolved_at)}</div>
          )}
          <button onClick={() => actualizar('abierta')} disabled={saving}
            style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'white', color: C.muted, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
            ↩️ Reabrir
          </button>
        </div>
      )}

      {/* Lightbox foto */}
      {foto && inc.photo_url && (
        <div onClick={() => setFoto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={photoSrc(inc.photo_url)} alt="Foto de la incidencia" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>
      )}
    </div>
  )
}

/* ── Página principal ── */
export default function AdminIncidenciasPage() {
  const [incidencias, setIncidencias] = useState<any[]>([])
  const [tab, setTab] = useState('abierta')
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [tab])

  async function cargar() {
    setLoading(true)
    const r = await fetch(`/api/admin/incidencias?estado=${tab}`)
    if (r.status === 401) { window.location.href = '/login'; return }
    const d = await r.json()
    setIncidencias(d.incidencias || [])
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Nunito',sans-serif", background: C.bg }}>

      {/* Header */}
      <header style={{ background: C.primary, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecoration: 'none' }}>← Volver</a>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIalimp size={18} />
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,.25)' }} />
          <h1 style={{ color: 'rgba(255,255,255,.9)', fontWeight: 700, fontSize: 15 }}>⚠️ Incidencias</h1>
        </div>
      </header>

      {/* Filtros */}
      <div style={{ background: 'white', borderBottom: `1px solid ${C.border}`, display: 'flex', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(f => (
          <button key={f.k} onClick={() => setTab(f.k)}
            style={{ flex: 1, minWidth: 90, padding: '12px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === f.k ? 700 : 500, fontFamily: 'inherit',
              color: tab === f.k ? C.primary : C.muted,
              borderBottom: `2px solid ${tab === f.k ? C.primary : 'transparent'}`, whiteSpace: 'nowrap' }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Cargando…</div>
        )}

        {!loading && incidencias.length === 0 && (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ fontWeight: 700, color: C.text }}>No hay incidencias</div>
          </div>
        )}

        {!loading && incidencias.map(inc => (
          <IncidenciaCard key={inc.id} inc={inc} onCambiada={cargar} />
        ))}
      </div>
    </div>
  )
}
