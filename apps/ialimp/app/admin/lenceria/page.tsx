'use client'
import { useState, useEffect } from 'react'

const C = { primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb', red: '#dc2626' }

const ESTADOS = {
  limpio:        { label: 'Limpio',        color: '#16a34a', bg: '#f0fdf4' },
  en_uso:        { label: 'En uso',        color: '#6366f1', bg: '#eef2ff' },
  sucio:         { label: 'Sucio',         color: '#d97706', bg: '#fffbeb' },
  en_lavanderia: { label: 'En lavandería', color: '#7c3aed', bg: '#faf5ff' },
  baja:          { label: 'Baja',          color: '#64748b', bg: '#f1f5f9' },
}

export default function LenceriaPage() {
  const [items, setItems]           = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [tiposLen, setTiposLen]     = useState<any[]>([])
  const [form, setForm]             = useState({ tipo: '', cantidad: '', propiedad_id: '' })
  const [propiedades, setProps]     = useState<any[]>([])
  const [editItem, setEditItem]     = useState<any | null>(null)
  const [saving, setSaving]         = useState(false)

  useEffect(() => { cargar(); cargarProps() }, [])

  async function cargar() {
    const [rI, rC] = await Promise.all([fetch('/api/admin/lenceria'), fetch('/api/admin/catalogos')])
    const dI = await rI.json(); const dC = await rC.json()
    const tipos = dC.catalogos?.tipos_lenceria?.filter((t: any) => t.activo !== false) || []
    setTiposLen(tipos)
    setItems(dI.items || [])
    setForm(f => ({ ...f, tipo: tipos[0]?.id || '' }))
    setLoading(false)
  }
  async function cargarProps() {
    const r = await fetch('/api/admin/propiedades'); const d = await r.json()
    setProps(d.propiedades || [])
  }
  async function cambiarEstado(id: string, estado: string) {
    await fetch('/api/admin/lenceria/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    setItems(is => is.map(i => i.id === id ? { ...i, estado } : i))
  }

  function abrirEditar(item: any) {
    setEditItem(item)
    setForm({
      tipo:         item.tipo          || '',
      cantidad:     item.cantidad != null ? String(item.cantidad) : '',
      propiedad_id: item.propiedad_id  || '',
    })
    setShowForm(true)
  }

  function cerrarForm() {
    setShowForm(false)
    setEditItem(null)
    setForm(f => ({ ...f, cantidad: '', propiedad_id: '' }))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    if (editItem) {
      await fetch('/api/admin/lenceria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editItem.id, estado: editItem.estado, ...form })
      })
    } else {
      await fetch('/api/admin/lenceria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
    }
    await cargar(); cerrarForm(); setSaving(false)
  }

  const getTipo = (id: string) => tiposLen.find(t => t.id === id) || { label: id, emoji: '📦' }
  const enLavanderia = items.filter(i => i.estado === 'en_lavanderia').length
  const sucios       = items.filter(i => i.estado === 'sucio').length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>Lencería</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
            {items.length} juegos {enLavanderia > 0 ? `· ${enLavanderia} en lavandería` : ''} {sucios > 0 ? `· ${sucios} sucios` : ''}
          </p>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true) }} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>+ Añadir</button>
      </header>

      <div style={{ padding: '20px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🛏️</div>
            <div style={{ fontWeight: 700 }}>Sin lencería registrada</div>
            <button onClick={() => { setEditItem(null); setShowForm(true) }} style={{ marginTop: 12, background: C.primary, color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Añadir primera partida</button>
          </div>
        )}
        {Object.entries(ESTADOS).map(([estado, cfg]) => {
          const grupo = items.filter(i => i.estado === estado)
          if (!grupo.length) return null
          return (
            <div key={estado} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color }} />
                <h3 style={{ fontWeight: 700, fontSize: 13, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cfg.label} ({grupo.length})</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {grupo.map((item: any) => {
                  const t = getTipo(item.tipo)
                  return (
                    <div key={item.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px', borderLeft: `4px solid ${cfg.color}` }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 24 }}>{t.emoji || '📦'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{t.label}</div>
                          {item.propiedad_nombre && <div style={{ fontSize: 11, color: C.muted }}>{item.propiedad_nombre}</div>}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 20, color: cfg.color }}>{item.cantidad}</div>
                        <button onClick={() => abrirEditar(item)} title="Editar"
                          style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 7px', fontSize: 12, cursor: 'pointer', color: C.muted, flexShrink: 0 }}>
                          ✏️
                        </button>
                      </div>
                      {item.lavanderia_envio_at && <div style={{ fontSize: 11, color: '#7c3aed', marginBottom: 8 }}>📅 Enviada: {new Date(item.lavanderia_envio_at).toLocaleDateString('es-ES')}</div>}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {estado !== 'limpio'        && <button onClick={() => cambiarEstado(item.id, 'limpio')}        style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.ok}`,  background: C.okBg,  color: C.ok,  fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓ Limpio</button>}
                        {estado !== 'sucio'         && <button onClick={() => cambiarEstado(item.id, 'sucio')}         style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.warn}`, background: C.warnBg, color: C.warn, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Sucio</button>}
                        {estado !== 'en_lavanderia' && <button onClick={() => cambiarEstado(item.id, 'en_lavanderia')} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #7c3aed', background: '#faf5ff', color: '#7c3aed', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Lavandería</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, color: C.text }}>{editItem ? 'Editar lencería' : 'Añadir lencería'}</h3>
              <button onClick={cerrarForm} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                  {tiposLen.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>Cantidad</label>
                <input type="number" value={form.cantidad} onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))} placeholder="10"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>Propiedad (opcional)</label>
                <select value={form.propiedad_id} onChange={e => setForm(p => ({ ...p, propiedad_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                  <option value="">— General / sin asignar —</option>
                  {propiedades.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={cerrarForm} style={{ flex: 1, padding: 11, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: 11, background: C.primary, color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? 'Guardando...' : editItem ? 'Guardar cambios' : 'Añadir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}