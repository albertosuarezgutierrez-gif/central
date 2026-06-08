'use client'
import { useState, useEffect, useCallback } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e1b4b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2', white: '#ffffff',
}

const CAT = {
  piso:     { label: 'Piso',     color: C.brand,  bg: C.light },
  servicio: { label: 'Servicio', color: C.ok,     bg: C.okBg  },
  pc:       { label: 'PC · 2ª pers.', color: C.warn, bg: C.warnBg },
} as Record<string, { label: string; color: string; bg: string }>

export function fmtMin(m: number | null | undefined) {
  if (m == null) return '—'
  const h = Math.floor(m / 60), mm = m % 60
  return h > 0 ? `${h}h${mm ? ' ' + mm + 'min' : ''}` : `${mm}min`
}
const eur = (v: any) => (v == null ? '—' : Number(v).toFixed(2).replace('.', ',') + ' €')

const EMPTY = { id: '', nombre: '', categoria: 'piso', tiempo_min: '', precio: '', precio_cliente: '' }

export default function Tarifas() {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState('')
  const [filtroCat, setCat]   = useState<'todas' | 'piso' | 'pc' | 'servicio'>('todas')
  const [modal, setModal]     = useState<any | null>(null) // {} = nuevo
  const [saving, setSaving]   = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/catalogo-tarifas')
    const d = await r.json()
    setRows(d.tarifas || [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar() {
    if (!modal.nombre?.trim()) return
    setSaving(true)
    if (modal.id) {
      await fetch('/api/admin/catalogo-tarifas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) })
    } else {
      await fetch('/api/admin/catalogo-tarifas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) })
    }
    setSaving(false); setModal(null); cargar()
  }
  async function borrar(id: string) {
    if (!confirm('¿Eliminar este concepto del catálogo?')) return
    await fetch('/api/admin/catalogo-tarifas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRows(rs => rs.filter(r => r.id !== id))
  }

  const filtradas = rows.filter(r =>
    (filtroCat === 'todas' || r.categoria === filtroCat) &&
    (!q.trim() || r.nombre.toLowerCase().includes(q.toLowerCase())))

  const nPc = rows.filter(r => r.categoria === 'pc').length

  return (
    <div>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
        Precios y tiempos presupuestados de cada piso y servicio. El <strong>precio</strong> es lo que se le paga a la limpiadora;
        sirve de base para calcular las <strong>nóminas</strong>.
      </p>

      {nPc > 0 && (
        <div style={{ background: C.light, border: `1px solid #c7d2fe`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
          ℹ️ Los <strong>{nPc} conceptos «PC»</strong> son la parte de una <strong>2ª limpiadora</strong>: cuando un piso (normalmente una reserva
          puntual) hay que sacarlo rápido y se hace <strong>entre dos personas</strong>, esta fila es el tiempo y el pago de esa segunda persona.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="🔍 Buscar concepto…" value={q} onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit' }} />
        <button onClick={() => setModal({ ...EMPTY })}
          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Nuevo concepto
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['todas', 'piso', 'pc', 'servicio'] as const).map(f => (
          <button key={f} onClick={() => setCat(f)}
            style={{ padding: '5px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: filtroCat === f ? 700 : 400,
              background: filtroCat === f ? C.primary : C.bg, color: filtroCat === f ? C.white : C.muted }}>
            {f === 'todas' ? `Todas (${rows.length})` : `${CAT[f].label} (${rows.filter(r => r.categoria === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtradas.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: C.muted }}>Sin resultados</div>}
          {filtradas.map(r => {
            const c = CAT[r.categoria] || CAT.piso
            return (
              <div key={r.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>
                <span style={{ flex: 1, minWidth: 140, fontWeight: 700, fontSize: 13.5, color: C.text }}>{r.nombre}</span>
                <span style={{ fontSize: 12.5, color: C.muted, minWidth: 64, textAlign: 'right' }}>⏱ {fmtMin(r.tiempo_min)}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: C.primary, minWidth: 72, textAlign: 'right' }}>{eur(r.precio)}</span>
                <button onClick={() => setModal({ ...r, tiempo_min: r.tiempo_min ?? '', precio: r.precio ?? '', precio_cliente: r.precio_cliente ?? '' })}
                  style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, color: C.brand, cursor: 'pointer', fontWeight: 600 }}>✏️</button>
                <button onClick={() => borrar(r.id)}
                  style={{ background: 'none', border: 'none', color: C.red, fontSize: 17, cursor: 'pointer', padding: '0 2px' }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal alta/edición */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 420, padding: 22, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: C.text }}>{modal.id ? 'Editar concepto' : 'Nuevo concepto'}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Nombre
                <input value={modal.nombre} onChange={e => setModal((m: any) => ({ ...m, nombre: e.target.value }))}
                  style={inp} />
              </label>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Categoría
                <select value={modal.categoria} onChange={e => setModal((m: any) => ({ ...m, categoria: e.target.value }))} style={inp}>
                  <option value="piso">Piso</option>
                  <option value="servicio">Servicio</option>
                  <option value="pc">PC (2ª persona)</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Tiempo (min)
                  <input type="number" min="0" value={modal.tiempo_min} onChange={e => setModal((m: any) => ({ ...m, tiempo_min: e.target.value }))} style={inp} placeholder="ej. 80" />
                </label>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Precio limpiadora (€)
                  <input type="number" min="0" step="0.5" value={modal.precio} onChange={e => setModal((m: any) => ({ ...m, precio: e.target.value }))} style={inp} placeholder="ej. 13" />
                </label>
              </div>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Precio cliente (€) <span style={{ fontWeight: 400 }}>· opcional</span>
                <input type="number" min="0" step="0.5" value={modal.precio_cliente} onChange={e => setModal((m: any) => ({ ...m, precio_cliente: e.target.value }))} style={inp} placeholder="lo que se cobra al cliente" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 10, borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={saving || !modal.nombre?.trim()}
                style={{ flex: 2, padding: 10, borderRadius: 9, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando…' : modal.id ? 'Guardar cambios' : 'Crear concepto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', marginTop: 4, padding: '9px 11px', border: `1px solid ${C.border}`,
  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
}
