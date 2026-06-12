'use client'
import { C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

interface Material {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string
  tipo: string
  estado: string
  cantidad_total: number
  cantidad_disponible: number
  stock_minimo: number | null
  coste_reposicion: number
  precio_compra: number | null
  codigo: string | null
  proveedor_nombre: string | null
  proveedor_referencia: string | null
  garantia_hasta: string | null
  activo: boolean
}
interface Categoria { id: string; nombre: string }
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

const TIPOS = ['activo', 'consumible']
const ESTADOS = ['operativo', 'deteriorado', 'en_reparacion', 'baja']

const ESTADO_BADGE: Record<string, { label: string; color: string }> = {
  operativo:    { label: 'operativo',    color: '#2E7D5E' },
  deteriorado:  { label: 'deteriorado',  color: '#B45309' },
  en_reparacion:{ label: 'en reparación',color: '#2B6A9E' },
  baja:         { label: 'baja',         color: '#6B7280' },
}

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
function badge(color: string): React.CSSProperties {
  return { display: 'inline-block', fontSize: 10, fontWeight: 700, fontFamily: SM, padding: '2px 7px', borderRadius: 99, background: color + '22', color: color, border: `1px solid ${color}44` }
}

// ─── Gestión de categorías ───────────────────────────────────
function GestionCategorias({ categorias, onUpdate }: { categorias: Categoria[]; onUpdate: () => void }) {
  const [nueva, setNueva] = useState('')
  const [open, setOpen] = useState(false)

  const crear = async () => {
    if (!nueva.trim()) return
    const r = await fetch('/api/materiales/categorias', { method: 'POST', headers: H(), body: JSON.stringify({ nombre: nueva.trim() }) })
    if (!r.ok) { const e = await r.json(); alert(e.error ?? 'Error'); return }
    setNueva('')
    onUpdate()
  }
  const eliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar categoría "${nombre}"? Los materiales que la usen no se borran.`)) return
    await fetch('/api/materiales/categorias', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    onUpdate()
  }

  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}`, fontSize: 12, padding: '5px 10px' }}>
        {open ? '▲ Cerrar' : '⚙ Gestionar categorías'}
      </button>
      {open && (
        <div style={{ ...card(), marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Categorías</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {categorias.map(c => (
              <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                {c.nombre}
                <button onClick={() => eliminar(c.id, c.nombre)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontWeight: 700, fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
              </span>
            ))}
            {categorias.length === 0 && <span style={{ fontSize: 12, color: C.ink3 }}>Sin categorías. Añade la primera.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...input(), flex: 1 }} placeholder="Nueva categoría…" value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && crear()} />
            <button style={btn(C.green)} onClick={crear}>Añadir</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Catálogo ───────────────────────────────────────────────
const emptyForm = () => ({ nombre: '', categoria: '', tipo: 'activo', estado: 'operativo', cantidad_total: '', stock_minimo: '', coste_reposicion: '', precio_compra: '', codigo: '', proveedor_nombre: '', proveedor_referencia: '', garantia_hasta: '' })

function Catalogo() {
  const [items, setItems] = useState<Material[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [expanded, setExpanded] = useState<string | null>(null)

  const cargarCats = useCallback(async () => {
    const r = await fetch('/api/materiales/categorias', { headers: H() })
    if (r.ok) setCategorias((await r.json()).categorias ?? [])
  }, [])

  const cargar = useCallback(async () => {
    const [rm, rc] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/categorias', { headers: H() }),
    ])
    if (rm.ok) setItems((await rm.json()).materiales ?? [])
    if (rc.ok) setCategorias((await rc.json()).categorias ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const reset = () => { setEditId(null); setForm(emptyForm()) }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    const payload = {
      nombre: form.nombre.trim(), categoria: form.categoria || 'otro', tipo: form.tipo, estado: form.estado,
      cantidad_total: Number(form.cantidad_total) || 0,
      stock_minimo: form.stock_minimo !== '' ? Number(form.stock_minimo) : null,
      coste_reposicion: Number(form.coste_reposicion) || 0,
      precio_compra: form.precio_compra !== '' ? Number(form.precio_compra) : null,
      codigo: form.codigo.trim() || null,
      proveedor_nombre: form.proveedor_nombre.trim() || null,
      proveedor_referencia: form.proveedor_referencia.trim() || null,
      garantia_hasta: form.garantia_hasta || null,
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
    setForm({
      nombre: m.nombre, categoria: m.categoria, tipo: m.tipo ?? 'activo', estado: m.estado ?? 'operativo',
      cantidad_total: String(m.cantidad_total), stock_minimo: m.stock_minimo != null ? String(m.stock_minimo) : '',
      coste_reposicion: String(m.coste_reposicion ?? ''), precio_compra: m.precio_compra != null ? String(m.precio_compra) : '',
      codigo: m.codigo ?? '', proveedor_nombre: m.proveedor_nombre ?? '',
      proveedor_referencia: m.proveedor_referencia ?? '', garantia_hasta: m.garantia_hasta ?? '',
    })
    setExpanded(null)
  }
  const borrar = async (id: string) => {
    if (!confirm('¿Dar de baja este material?')) return
    await fetch('/api/materiales', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }

  const alertas = items.filter(m => m.stock_minimo != null && m.cantidad_disponible <= m.stock_minimo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {alertas.length > 0 && (
        <div style={{ background: '#7C2D1233', border: '1px solid #7C2D1266', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠ Stock bajo mínimo</div>
          {alertas.map(m => (
            <div key={m.id} style={{ fontSize: 12, color: C.ink2, fontFamily: SM }}>
              {m.nombre} — {m.cantidad_disponible} disponibles (mín. {m.stock_minimo})
            </div>
          ))}
        </div>
      )}

      <GestionCategorias categorias={categorias} onUpdate={cargarCats} />

      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar material' : 'Nuevo material'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={{ ...input(), gridColumn: '1 / 3' }} placeholder="Nombre (ej. Silla Chiavari)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={input()} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            <option value="">Categoría…</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <select style={input()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={input()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={input()} placeholder="Código (ej. SLA-001)" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} />
          <input style={input()} type="number" placeholder="Unidades totales" value={form.cantidad_total} onChange={e => setForm({ ...form, cantidad_total: e.target.value })} />
          <input style={input()} type="number" placeholder="Stock mínimo (alerta)" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} />
          <input style={input()} type="number" step="0.01" placeholder="Precio compra (€/ud)" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={input()} type="number" step="0.01" placeholder="Coste reposición (€/ud)" value={form.coste_reposicion} onChange={e => setForm({ ...form, coste_reposicion: e.target.value })} />
          <input style={input()} placeholder="Proveedor (nombre)" value={form.proveedor_nombre} onChange={e => setForm({ ...form, proveedor_nombre: e.target.value })} />
          <input style={input()} placeholder="Ref. proveedor" value={form.proveedor_referencia} onChange={e => setForm({ ...form, proveedor_referencia: e.target.value })} />
          <input style={input()} type="date" placeholder="Garantía hasta" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
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
            const bajominimo = m.stock_minimo != null && m.cantidad_disponible <= m.stock_minimo
            const estadoBadge = ESTADO_BADGE[m.estado] ?? { label: m.estado, color: C.ink3 }
            const isOpen = expanded === m.id
            return (
              <div key={m.id} style={{ ...card(), cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : m.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nombre}</span>
                      <span style={badge(estadoBadge.color)}>{estadoBadge.label}</span>
                      {m.tipo === 'consumible' && <span style={badge(C.ink3)}>consumible</span>}
                      {m.codigo && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{m.codigo}</span>}
                      {bajominimo && <span style={badge(C.red)}>⚠ stock bajo</span>}
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                      {m.categoria} · {eur(m.coste_reposicion)}/ud{m.proveedor_nombre ? ` · ${m.proveedor_nombre}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: bajominimo ? C.red : m.cantidad_disponible > 0 ? C.green : C.red }}>
                      {m.cantidad_disponible}<span style={{ color: C.ink3, fontWeight: 400, fontSize: 12 }}> / {m.cantidad_total}</span>
                    </div>
                    {m.stock_minimo != null && <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>mín. {m.stock_minimo}</div>}
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{fuera > 0 ? `${fuera} fuera` : 'todo disp.'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button style={btn(C.bg3)} onClick={() => editar(m)}>Editar</button>
                    <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '6px 10px' }} onClick={() => borrar(m.id)}>Baja</button>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.rule}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px', fontFamily: SM, fontSize: 12, color: C.ink2 }}>
                    {m.precio_compra != null && <span>Precio compra: <b>{eur(m.precio_compra)}</b></span>}
                    {m.proveedor_referencia && <span>Ref. prov.: <b>{m.proveedor_referencia}</b></span>}
                    {m.garantia_hasta && <span>Garantía hasta: <b>{new Date(m.garantia_hasta).toLocaleDateString('es-ES')}</b></span>}
                    {m.descripcion && <span style={{ gridColumn: '1 / 3', color: C.ink3 }}>{m.descripcion}</span>}
                  </div>
                )}
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
  const [form, setForm] = useState({ material_id: '', cantidad: '', destino_tipo: '', destino_nombre: '' })

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
      body: JSON.stringify({ material_id: form.material_id, cantidad: Number(form.cantidad), destino_tipo: form.destino_tipo || 'otro', destino_nombre: form.destino_nombre.trim() || null, fecha_salida: new Date().toISOString().slice(0, 10) }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', cantidad: '', destino_tipo: '', destino_nombre: '' })
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
          <input style={input()} placeholder="Tipo de destino (ej. evento, obra…)" value={form.destino_tipo} onChange={e => setForm({ ...form, destino_tipo: e.target.value })} />
          <input style={input()} placeholder="Nombre destino (ej. Boda Pérez)" value={form.destino_nombre} onChange={e => setForm({ ...form, destino_nombre: e.target.value })} />
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
