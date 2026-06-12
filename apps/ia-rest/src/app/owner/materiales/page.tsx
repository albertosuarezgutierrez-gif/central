'use client'
import { DARK_C as C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

interface Material {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string
  cantidad_total: number
  cantidad_disponible: number
  coste_reposicion: number
  proveedor_nombre: string | null
  activo: boolean
}
interface MaterialRef { nombre: string; categoria: string; coste_reposicion?: number }
interface Asignacion {
  id: string
  material_id: string
  destino_tipo: string
  destino_nombre: string | null
  cantidad: number
  cantidad_devuelta: number
  estado: string
  fecha_salida: string | null
  notas: string | null
  material: MaterialRef | null
}
interface Dano {
  id: string
  material_id: string
  cantidad: number
  motivo: string | null
  foto_url: string | null
  coste: number
  created_at: string
  material: MaterialRef | null
}

const CATEGORIAS = ['mesa', 'silla', 'vajilla', 'cristaleria', 'manteleria', 'otro']
const DESTINOS = ['evento', 'hacienda', 'cliente', 'obra', 'otro']
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}
const H = () => ({ 'Content-Type': 'application/json', 'x-ia-session': sesHeader() })

export default function OwnerMaterialesPage() {
  const [tab, setTab] = useState<'catalogo' | 'asignaciones' | 'roturas'>('catalogo')
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 4px' }}>Materiales</h1>
        <p style={{ color: C.ink3, fontSize: 13, margin: '0 0 14px' }}>
          Inventario de menaje y activos. Asigna a eventos, haciendas o clientes; controla roturas.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {([['catalogo', 'Catálogo'], ['asignaciones', 'Asignaciones'], ['roturas', 'Roturas']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${tab === t ? C.red : C.rule}`, cursor: 'pointer',
              background: tab === t ? C.red : 'transparent', color: tab === t ? C.paper : C.ink2,
            }}>{label}</button>
          ))}
        </div>
        {tab === 'catalogo' && <Catalogo />}
        {tab === 'asignaciones' && <Asignaciones />}
        {tab === 'roturas' && <Roturas />}
      </div>
    </div>
  )
}

function card(): React.CSSProperties {
  return { background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14 }
}
function input(): React.CSSProperties {
  return { fontFamily: SN, fontSize: 14, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, outline: 'none', width: '100%', boxSizing: 'border-box' }
}
function btn(color: string): React.CSSProperties {
  return { fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: color, color: C.paper }
}

// ─── Catálogo ───────────────────────────────────────────────
function Catalogo() {
  const [items, setItems] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', categoria: 'vajilla', cantidad_total: '', coste_reposicion: '', proveedor_nombre: '' })

  const cargar = useCallback(async () => {
    const r = await fetch('/api/materiales', { headers: H() })
    if (r.ok) setItems((await r.json()).materiales ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const reset = () => { setEditId(null); setForm({ nombre: '', categoria: 'vajilla', cantidad_total: '', coste_reposicion: '', proveedor_nombre: '' }) }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    const payload = {
      nombre: form.nombre.trim(), categoria: form.categoria,
      cantidad_total: Number(form.cantidad_total) || 0,
      coste_reposicion: Number(form.coste_reposicion) || 0,
      proveedor_nombre: form.proveedor_nombre.trim() || null,
    }
    if (editId) {
      await fetch('/api/materiales', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: editId, ...payload }) })
    } else {
      await fetch('/api/materiales', { method: 'POST', headers: H(), body: JSON.stringify(payload) })
    }
    reset(); cargar()
  }

  const editar = (m: Material) => {
    setEditId(m.id)
    setForm({ nombre: m.nombre, categoria: m.categoria, cantidad_total: String(m.cantidad_total), coste_reposicion: String(m.coste_reposicion ?? ''), proveedor_nombre: m.proveedor_nombre ?? '' })
  }
  const borrar = async (id: string) => {
    if (!confirm('¿Dar de baja este material?')) return
    await fetch('/api/materiales', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar material' : 'Nuevo material'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={input()} placeholder="Nombre (ej. Silla Chiavari)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={input()} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input style={input()} type="number" placeholder="Unidades totales" value={form.cantidad_total} onChange={e => setForm({ ...form, cantidad_total: e.target.value })} />
          <input style={input()} type="number" step="0.01" placeholder="Coste reposición (€/ud)" value={form.coste_reposicion} onChange={e => setForm({ ...form, coste_reposicion: e.target.value })} />
          <input style={{ ...input(), gridColumn: '1 / 3' }} placeholder="Proveedor (opcional)" value={form.proveedor_nombre} onChange={e => setForm({ ...form, proveedor_nombre: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={reset}>Cancelar</button>}
        </div>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin materiales. Añade el primero arriba.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(m => {
            const fuera = m.cantidad_total - m.cantidad_disponible
            return (
              <div key={m.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.nombre}</div>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                    {m.categoria} · {eur(m.coste_reposicion)}/ud{m.proveedor_nombre ? ` · ${m.proveedor_nombre}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: m.cantidad_disponible > 0 ? C.green : C.red }}>{m.cantidad_disponible}<span style={{ color: C.ink3, fontWeight: 400, fontSize: 12 }}> / {m.cantidad_total}</span></div>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{fuera > 0 ? `${fuera} fuera` : 'todo disponible'}</div>
                </div>
                <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={() => editar(m)}>Editar</button>
                <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44` }} onClick={() => borrar(m.id)}>Baja</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Asignaciones ───────────────────────────────────────────
function Asignaciones() {
  const [items, setItems] = useState<Asignacion[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ material_id: '', cantidad: '', destino_tipo: 'evento', destino_nombre: '' })

  const cargar = useCallback(async () => {
    const [ra, rm] = await Promise.all([
      fetch('/api/materiales/asignacion', { headers: H() }),
      fetch('/api/materiales', { headers: H() }),
    ])
    if (ra.ok) setItems((await ra.json()).asignaciones ?? [])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const asignar = async () => {
    if (!form.material_id || !(Number(form.cantidad) > 0)) return
    const r = await fetch('/api/materiales/asignacion', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ material_id: form.material_id, cantidad: Number(form.cantidad), destino_tipo: form.destino_tipo, destino_nombre: form.destino_nombre.trim() || null, fecha_salida: new Date().toISOString().slice(0, 10) }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', cantidad: '', destino_tipo: 'evento', destino_nombre: '' })
    cargar()
  }
  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/materiales/asignacion', { method: 'PATCH', headers: H(), body: JSON.stringify({ id, estado }) })
    cargar()
  }

  const ESTADO_COLOR: Record<string, string> = { reservado: C.amber, entregado: '#2B6A9E', devuelto: C.green }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nueva salida de material</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={input()} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.cantidad_disponible} disp.)</option>)}
          </select>
          <input style={input()} type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          <select style={input()} value={form.destino_tipo} onChange={e => setForm({ ...form, destino_tipo: e.target.value })}>
            {DESTINOS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input style={input()} placeholder="Destino (ej. Boda Pérez)" value={form.destino_nombre} onChange={e => setForm({ ...form, destino_nombre: e.target.value })} />
        </div>
        <button style={{ ...btn(C.red), marginTop: 10 }} onClick={asignar}>Asignar y descontar stock</button>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin asignaciones todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(a => (
            <div key={a.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.material?.nombre ?? '—'} <span style={{ color: C.ink3, fontWeight: 400 }}>×{a.cantidad}</span></div>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                  {a.destino_tipo}{a.destino_nombre ? ` · ${a.destino_nombre}` : ''}{a.fecha_salida ? ` · ${a.fecha_salida}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR[a.estado] ?? C.ink3 }}>{a.estado}</span>
              {a.estado === 'reservado' && <button style={btn('#2B6A9E')} onClick={() => cambiarEstado(a.id, 'entregado')}>Entregar</button>}
              {a.estado !== 'devuelto' && <button style={btn(C.green)} onClick={() => cambiarEstado(a.id, 'devuelto')}>Devolver</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Roturas ────────────────────────────────────────────────
function Roturas() {
  const [items, setItems] = useState<Dano[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/materiales/dano', { headers: H() }).then(async r => {
      if (r.ok) setItems((await r.json()).danos ?? [])
      setLoading(false)
    })
  }, [])
  const totalCoste = items.reduce((s, d) => s + (Number(d.coste) || 0), 0)

  if (loading) return <p style={{ color: C.ink3 }}>Cargando…</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...card(), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: C.ink2 }}>Coste total de roturas registradas</span>
        <span style={{ fontFamily: SE, fontSize: 22, color: C.red }}>{eur(totalCoste)}</span>
      </div>
      {items.length === 0 ? <p style={{ color: C.ink3 }}>Sin roturas registradas. 🎉</p> : items.map(d => (
        <div key={d.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
          {d.foto_url && <img src={d.foto_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{d.material?.nombre ?? '—'} <span style={{ color: C.ink3, fontWeight: 400 }}>×{d.cantidad}</span></div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>{d.motivo ?? 'rotura'} · {new Date(d.created_at).toLocaleDateString('es-ES')}</div>
          </div>
          <span style={{ fontFamily: SM, fontSize: 13, fontWeight: 700, color: C.red }}>{eur(d.coste)}</span>
        </div>
      ))}
    </div>
  )
}
