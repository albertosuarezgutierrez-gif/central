'use client'
import { useState, useEffect } from 'react'

const C = { primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb', red: '#dc2626', redBg: '#fef2f2' }

export default function StockPage() {
  const [productos, setProductos] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [categorias, setCategorias] = useState<any[]>([])
  const [unidades,   setUnidades]   = useState<any[]>([])
  const [form, setForm] = useState({ nombre: '', categoria: '', unidad: '', stock_actual: '', stock_minimo: '', precio_unitario: '' })
  const [saving, setSaving] = useState(false)
  const [editProducto, setEditProducto] = useState<any | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [rP, rC] = await Promise.all([
      fetch('/api/admin/stock'),
      fetch('/api/admin/catalogos')
    ])
    const dP = await rP.json()
    const dC = await rC.json()
    const cats = dC.catalogos?.categorias_stock?.filter((c: any) => c.activo !== false) || []
    const unis = dC.catalogos?.unidades_stock || []
    setCategorias(cats)
    setUnidades(unis)
    setProductos(dP.productos || [])
    setForm(f => ({ ...f, categoria: cats[0]?.id || 'limpieza', unidad: unis[0]?.id || 'unidad' }))
    setLoading(false)
  }

  function abrirEditar(p: any) {
    setEditProducto(p)
    setForm({
      nombre:          p.nombre          || '',
      categoria:       p.categoria       || '',
      unidad:          p.unidad          || '',
      stock_actual:    p.stock_actual    != null ? String(p.stock_actual)    : '',
      stock_minimo:    p.stock_minimo    != null ? String(p.stock_minimo)    : '',
      precio_unitario: p.precio_unitario != null ? String(p.precio_unitario) : '',
    })
    setShowForm(true)
  }

  function cerrarForm() {
    setShowForm(false)
    setEditProducto(null)
    setForm(f => ({ ...f, nombre: '', stock_actual: '', stock_minimo: '', precio_unitario: '' }))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    if (editProducto) {
      await fetch('/api/admin/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editProducto.id, ...form })
      })
    } else {
      await fetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
    }
    await cargar()
    cerrarForm()
    setSaving(false)
  }

  const getEmoji = (catId: string) => categorias.find(c => c.id === catId)?.emoji || '📦'
  const alertas  = productos.filter(p => p.alerta_stock).length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>Stock y materiales</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{productos.length} productos · {alertas > 0 ? alertas + ' ⚠️ stock bajo' : 'todo OK'}</p>
        </div>
        <button onClick={() => { setEditProducto(null); setShowForm(true) }} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          + Producto
        </button>
      </header>

      <div style={{ padding: '20px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>}

        {alertas > 0 && (
          <div style={{ background: C.warnBg, border: `1px solid #fcd34d`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: C.warn, fontWeight: 600 }}>
            ⚠️ {alertas} producto{alertas > 1 ? 's' : ''} con stock bajo — revisar pedido
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {productos.map((p: any) => (
            <div key={p.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${p.alerta_stock ? '#fcd34d' : C.border}`, padding: '16px', borderLeft: `4px solid ${p.alerta_stock ? C.warn : C.ok}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{getEmoji(p.categoria)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{p.categoria} · {p.unidad}</div>
                </div>
                <button onClick={() => abrirEditar(p)} title="Editar producto"
                  style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer', color: C.muted, flexShrink: 0 }}>
                  ✏️
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: p.alerta_stock ? C.warnBg : C.okBg, borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: C.muted }}>Stock actual</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: p.alerta_stock ? C.warn : C.ok }}>{p.stock_actual}</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: C.muted }}>Mínimo</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.muted }}>{p.stock_minimo}</div>
                </div>
              </div>
              {p.alerta_stock && <div style={{ marginTop: 8, fontSize: 11, color: C.warn, fontWeight: 600 }}>⚠️ Pedir más urgente</div>}
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, color: C.text }}>{editProducto ? 'Editar producto' : 'Nuevo producto'}</h3>
              <button onClick={cerrarForm} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { k: 'nombre',          label: 'Nombre *',              ph: 'Gel de baño 1L' },
                { k: 'stock_actual',    label: 'Stock actual',          ph: '50',   type: 'number' },
                { k: 'stock_minimo',    label: 'Stock mínimo (alerta)', ph: '10',   type: 'number' },
                { k: 'precio_unitario', label: 'Precio unitario €',     ph: '2.50', type: 'number' },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type || 'text'} step="0.01" value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.ph} required={f.k === 'nombre'}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Unidad</label>
                  <select value={form.unidad} onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={cerrarForm} style={{ flex: 1, padding: 11, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: 11, background: C.primary, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? 'Guardando...' : editProducto ? 'Guardar cambios' : '+ Añadir producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}