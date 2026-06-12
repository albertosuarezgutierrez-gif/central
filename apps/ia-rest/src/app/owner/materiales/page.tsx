'use client'
import { C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Material {
  id: string; nombre: string; descripcion: string | null; categoria: string
  tipo: string; estado: string; cantidad_total: number; cantidad_disponible: number
  stock_minimo: number | null; coste_reposicion: number; precio_compra: number | null
  codigo: string | null; proveedor_nombre: string | null; proveedor_referencia: string | null
  garantia_hasta: string | null; activo: boolean
}
interface Categoria { id: string; nombre: string }
interface Espacio {
  id: string; nombre: string; descripcion: string | null; tipo: string
  ref_tipo: string | null; ref_id: string | null; codigo_qr: string | null; activo: boolean
}
interface Movimiento {
  id: string; material_id: string; unidad_id: string | null; tipo: string; cantidad: number
  espacio_origen_id: string | null; espacio_destino_id: string | null
  notas: string | null; realizado_por: string | null; fecha: string; created_at: string
  material: { nombre: string; categoria: string } | null
  espacio_origen: { nombre: string } | null
  espacio_destino: { nombre: string } | null
}
interface Unidad {
  id: string; material_id: string; codigo_serie: string | null; codigo_qr: string
  estado: string; espacio_actual_id: string | null; fecha_compra: string | null
  garantia_hasta: string | null; precio_compra: number | null; vida_util_anios: number | null
  notas: string | null; activo: boolean; created_at: string
  material: { nombre: string; categoria: string } | null
}
interface Alerta { tipo: string; materialId: string; mensaje: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}
const H = () => ({ 'Content-Type': 'application/json', 'x-ia-session': sesHeader() })

function card(): React.CSSProperties {
  return { background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14 }
}
function inp(): React.CSSProperties {
  return { fontFamily: SN, fontSize: 14, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, outline: 'none', width: '100%', boxSizing: 'border-box' }
}
function btn(color: string): React.CSSProperties {
  return { fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: color, color: C.paper }
}
function badge(color: string): React.CSSProperties {
  return { display: 'inline-block', fontSize: 10, fontWeight: 700, fontFamily: SM, padding: '2px 7px', borderRadius: 99, background: color + '22', color: color, border: `1px solid ${color}44` }
}

const TIPOS_MAT = ['activo', 'consumible']
const ESTADOS_MAT = ['operativo', 'deteriorado', 'en_reparacion', 'baja']
const TIPOS_ESPACIO = ['almacen', 'cocina', 'sala', 'terraza', 'camara', 'otro']

const ESTADO_COLOR: Record<string, string> = {
  operativo: '#2E7D5E', deteriorado: '#B45309', en_reparacion: '#2B6A9E', baja: '#6B7280',
}
const MOV_COLOR: Record<string, string> = {
  entrada: '#2E7D5E', salida: '#DC2626', devolucion: '#2B6A9E',
  rotura: '#7C3AED', ajuste: '#B45309', transferencia: '#6B7280',
}

const TABS = [
  { id: 'resumen',        label: 'Resumen',       faseA: true },
  { id: 'catalogo',       label: 'Catálogo',      faseA: true },
  { id: 'espacios',       label: 'Espacios',      faseA: true },
  { id: 'transferencias', label: 'Transferencias',faseA: true },
  { id: 'serializados',   label: 'Serializados',  faseA: true },
  { id: 'historial',      label: 'Historial',     faseA: true },
  { id: 'kits',           label: 'Kits',          faseA: false },
  { id: 'inventario',     label: 'Inventario',    faseA: false },
  { id: 'mantenimiento',  label: 'Mantenimiento', faseA: false },
  { id: 'reservas',       label: 'Reservas',      faseA: false },
  { id: 'clientes',       label: 'Clientes',      faseA: false },
  { id: 'proveedores',    label: 'Proveedores',   faseA: false },
  { id: 'importar',       label: 'Importar',      faseA: false },
  { id: 'informes',       label: 'Informes',      faseA: false },
] as const

type TabId = typeof TABS[number]['id']

const FASE_B_INFO: Record<string, string> = {
  kits:          'Plantillas de kit para asignar N unidades de un conjunto de materiales con un solo clic.',
  inventario:    'Wizard de conteo físico: selecciona espacio, cuenta unidades, compara con el sistema y genera ajustes automáticos.',
  mantenimiento: 'Registro de intervenciones preventivas y correctivas por material o unidad serializada.',
  reservas:      'Calendario de disponibilidad y reservas anticipadas ligadas a encargos o clientes.',
  clientes:      'Ficha simple de clientes con historial de salidas asociadas.',
  proveedores:   'Ficha de proveedores con historial de compras.',
  importar:      'Importación masiva desde CSV con plantilla descargable.',
  informes:      'Exportación PDF de valoración del inventario, historial y activos por estado.',
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function OwnerMaterialesPage() {
  const [tab, setTab] = useState<TabId>('resumen')
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 4px' }}>Materiales</h1>
        <p style={{ color: C.ink3, fontSize: 13, margin: '0 0 14px' }}>
          Inventario de activos y consumibles. Ledger de movimientos, QR imprimible, alertas de stock.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: SN, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
              border: `1px solid ${tab === t.id ? C.red : C.rule}`, cursor: 'pointer',
              background: tab === t.id ? C.red : 'transparent',
              color: tab === t.id ? C.paper : t.faseA ? C.ink2 : C.ink4,
              opacity: t.faseA ? 1 : 0.65,
            }}>{t.label}{!t.faseA ? ' ✦' : ''}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.ink4, marginBottom: 14 }}>✦ Fase B — próximamente</div>

        {tab === 'resumen'        && <Resumen />}
        {tab === 'catalogo'       && <Catalogo />}
        {tab === 'espacios'       && <Espacios />}
        {tab === 'transferencias' && <Transferencias />}
        {tab === 'serializados'   && <Serializados />}
        {tab === 'historial'      && <Historial />}
        {(['kits','inventario','mantenimiento','reservas','clientes','proveedores','importar','informes'] as TabId[]).includes(tab)
          && <Proximamente id={tab} />}
      </div>
    </div>
  )
}

// ─── Próximamente ─────────────────────────────────────────────────────────────
function Proximamente({ id }: { id: TabId }) {
  return (
    <div style={{ ...card(), textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, fontFamily: SE }}>
        {TABS.find(t => t.id === id)?.label} — Fase B
      </div>
      <div style={{ fontSize: 13, color: C.ink3, maxWidth: 420, margin: '0 auto' }}>
        {FASE_B_INFO[id] ?? 'En desarrollo.'}
      </div>
    </div>
  )
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
function Resumen() {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/movimientos?limit=8', { headers: H() }),
      fetch('/api/materiales/alertas?dias=30', { headers: H() }),
    ]).then(async ([rm, rmov, ral]) => {
      if (rm.ok)   setMateriales((await rm.json()).materiales ?? [])
      if (rmov.ok) setMovimientos((await rmov.json()).movimientos ?? [])
      if (ral.ok)  setAlertas((await ral.json()).alertas ?? [])
      setLoading(false)
    })
  }, [])

  if (loading) return <p style={{ color: C.ink3 }}>Cargando…</p>

  const totalMats = materiales.length
  const totalUnidades = materiales.reduce((s, m) => s + (m.cantidad_total ?? 0), 0)
  const valorCompra = materiales.reduce((s, m) => s + ((m.precio_compra ?? 0) * (m.cantidad_total ?? 0)), 0)
  const gastRot = movimientos.filter(mv => mv.tipo === 'rotura').reduce((s, mv) => s + mv.cantidad, 0)

  const kpis = [
    { label: 'Referencias', value: String(totalMats), color: C.green },
    { label: 'Unidades totales', value: String(totalUnidades), color: '#2B6A9E' },
    { label: 'Valor inventario', value: eur(valorCompra), color: C.amber },
    { label: 'Alertas activas', value: String(alertas.length), color: alertas.length > 0 ? C.red : C.green },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card(), textAlign: 'center' }}>
            <div style={{ fontFamily: SE, fontSize: 26, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {alertas.length > 0 && (
        <div style={{ background: '#7C2D1233', border: '1px solid #7C2D1266', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠ Alertas activas</div>
          {alertas.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: C.ink2, fontFamily: SM, marginBottom: 2 }}>
              <span style={badge(a.tipo === 'stock_minimo' ? C.red : C.amber)}>{a.tipo}</span>{' '}
              {a.mensaje}
            </div>
          ))}
        </div>
      )}

      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Últimos movimientos</div>
        {movimientos.length === 0
          ? <p style={{ fontSize: 12, color: C.ink3 }}>Sin movimientos todavía.</p>
          : movimientos.slice(0, 8).map(mv => (
            <div key={mv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.rule}` }}>
              <span style={badge(MOV_COLOR[mv.tipo] ?? C.ink3)}>{mv.tipo}</span>
              <span style={{ fontSize: 13, flex: 1 }}>{mv.material?.nombre ?? '—'}</span>
              <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>×{mv.cantidad}</span>
              <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{mv.fecha}</span>
            </div>
          ))
        }
      </div>

      {gastRot > 0 && (
        <div style={{ ...card(), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: C.ink2 }}>Unidades dadas de baja por rotura (historial cargado)</span>
          <span style={{ fontFamily: SE, fontSize: 18, color: '#7C3AED' }}>{gastRot}</span>
        </div>
      )}
    </div>
  )
}

// ─── Gestión de categorías ────────────────────────────────────────────────────
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
    if (!confirm(`¿Eliminar categoría "${nombre}"?`)) return
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
            <input style={{ ...inp(), flex: 1 }} placeholder="Nueva categoría…" value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && crear()} />
            <button style={btn(C.green)} onClick={crear}>Añadir</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────
const emptyForm = () => ({
  nombre: '', categoria: '', tipo: 'activo', estado: 'operativo',
  cantidad_total: '', stock_minimo: '', coste_reposicion: '', precio_compra: '',
  codigo: '', proveedor_nombre: '', proveedor_referencia: '', garantia_hasta: '',
})

function Catalogo() {
  const [items, setItems] = useState<Material[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [expanded, setExpanded] = useState<string | null>(null)
  // Formulario reponer stock (entrada ledger)
  const [reponerId, setReponerId] = useState<string | null>(null)
  const [reponerCant, setReponerCant] = useState('')
  const [reponerNotas, setReponerNotas] = useState('')

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

  const reponer = async (material_id: string) => {
    const cant = Number(reponerCant)
    if (!(cant > 0)) return
    const r = await fetch('/api/materiales/movimientos', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ material_id, tipo: 'entrada', cantidad: cant, notas: reponerNotas.trim() || null }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setReponerId(null); setReponerCant(''); setReponerNotas('')
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
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Nombre (ej. Silla Chiavari)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={inp()} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            <option value="">Categoría…</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <select style={inp()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_MAT.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={inp()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {ESTADOS_MAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={inp()} placeholder="Código (ej. SLA-001)" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} />
          <input style={inp()} type="number" placeholder="Unidades totales" value={form.cantidad_total} onChange={e => setForm({ ...form, cantidad_total: e.target.value })} />
          <input style={inp()} type="number" placeholder="Stock mínimo (alerta)" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Precio compra (€/ud)" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Coste reposición (€/ud)" value={form.coste_reposicion} onChange={e => setForm({ ...form, coste_reposicion: e.target.value })} />
          <input style={inp()} placeholder="Proveedor (nombre)" value={form.proveedor_nombre} onChange={e => setForm({ ...form, proveedor_nombre: e.target.value })} />
          <input style={inp()} placeholder="Ref. proveedor" value={form.proveedor_referencia} onChange={e => setForm({ ...form, proveedor_referencia: e.target.value })} />
          <input style={inp()} type="date" placeholder="Garantía hasta" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
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
            const estadoBadge = ESTADO_COLOR[m.estado] ?? C.ink3
            const isOpen = expanded === m.id
            return (
              <div key={m.id} style={{ ...card(), cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : m.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nombre}</span>
                      <span style={badge(estadoBadge)}>{m.estado}</span>
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
                    <button style={{ ...btn('transparent'), color: C.green, border: `1px solid ${C.green}44`, padding: '6px 10px', fontSize: 12 }}
                      onClick={() => { setReponerId(m.id); setReponerCant(''); setReponerNotas('') }}>+ Reponer</button>
                    <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '6px 10px', fontSize: 12 }} onClick={() => borrar(m.id)}>Baja</button>
                  </div>
                </div>
                {reponerId === m.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 8, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <input style={{ ...inp(), width: 90 }} type="number" placeholder="Unidades" value={reponerCant} onChange={e => setReponerCant(e.target.value)} />
                    <input style={{ ...inp(), flex: 1 }} placeholder="Notas (opcional)" value={reponerNotas} onChange={e => setReponerNotas(e.target.value)} />
                    <button style={btn(C.green)} onClick={() => reponer(m.id)}>Confirmar</button>
                    <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}` }} onClick={() => setReponerId(null)}>×</button>
                  </div>
                )}
                {isOpen && !reponerId && (
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

// ─── Espacios ─────────────────────────────────────────────────────────────────
function Espacios() {
  const [items, setItems] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', descripcion: '', tipo: 'almacen' })
  const [editId, setEditId] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/materiales/espacios', { headers: H() })
    if (r.ok) setItems((await r.json()).espacios ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!form.nombre.trim()) return
    if (editId) {
      await fetch('/api/materiales/espacios', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: editId, ...form }) })
    } else {
      await fetch('/api/materiales/espacios', { method: 'POST', headers: H(), body: JSON.stringify(form) })
    }
    setEditId(null); setForm({ nombre: '', descripcion: '', tipo: 'almacen' }); cargar()
  }

  const borrar = async (id: string) => {
    if (!confirm('¿Eliminar espacio?')) return
    await fetch('/api/materiales/espacios', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar espacio' : 'Nuevo espacio'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Nombre (ej. Almacén principal)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={inp()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_ESPACIO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={inp()} placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={() => { setEditId(null); setForm({ nombre: '', descripcion: '', tipo: 'almacen' }) }}>Cancelar</button>}
        </div>
      </div>

      {qrUrl && (
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <img src={qrUrl} alt="QR espacio" style={{ width: 200, height: 200 }} />
          <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}`, fontSize: 12 }} onClick={() => setQrUrl(null)}>Cerrar QR</button>
        </div>
      )}

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin espacios todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(e => (
            <div key={e.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{e.nombre}</div>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{e.tipo}{e.descripcion ? ` · ${e.descripcion}` : ''}</div>
              </div>
              <button style={{ ...btn('transparent'), fontSize: 12, color: C.ink3, border: `1px solid ${C.rule}`, padding: '5px 9px' }}
                onClick={() => setQrUrl(`/api/materiales/qr/${encodeURIComponent(e.id)}`)}>QR</button>
              <button style={btn(C.bg3)} onClick={() => { setEditId(e.id); setForm({ nombre: e.nombre, descripcion: e.descripcion ?? '', tipo: e.tipo }) }}>Editar</button>
              <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '6px 10px' }} onClick={() => borrar(e.id)}>Eliminar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Transferencias ──────────────────────────────────────────────────────────
function Transferencias() {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [historial, setHistorial] = useState<Movimiento[]>([])
  const [form, setForm] = useState({ material_id: '', cantidad: '', espacio_origen_id: '', espacio_destino_id: '', notas: '' })
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [rm, re, rh] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/espacios', { headers: H() }),
      fetch('/api/materiales/movimientos?tipo=transferencia&limit=30', { headers: H() }),
    ])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (re.ok) setEspacios((await re.json()).espacios ?? [])
    if (rh.ok) setHistorial((await rh.json()).movimientos ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const transferir = async () => {
    const cant = Number(form.cantidad)
    if (!form.material_id || !(cant > 0) || !form.espacio_destino_id) return
    const r = await fetch('/api/materiales/movimientos', {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        material_id: form.material_id, tipo: 'transferencia', cantidad: cant,
        espacio_origen_id: form.espacio_origen_id || null,
        espacio_destino_id: form.espacio_destino_id,
        notas: form.notas.trim() || null,
      }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', cantidad: '', espacio_origen_id: '', espacio_destino_id: '', notas: '' })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nueva transferencia</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={{ ...inp(), gridColumn: '1 / 3' }} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.cantidad_disponible} disp.)</option>)}
          </select>
          <input style={inp()} type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          <select style={inp()} value={form.espacio_origen_id} onChange={e => setForm({ ...form, espacio_origen_id: e.target.value })}>
            <option value="">Origen (opcional)</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <select style={inp()} value={form.espacio_destino_id} onChange={e => setForm({ ...form, espacio_destino_id: e.target.value })}>
            <option value="">Destino *</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas (opcional)" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={transferir}>Registrar transferencia</button>
      </div>

      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Historial de transferencias</div>
        {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : historial.length === 0 ? (
          <p style={{ fontSize: 12, color: C.ink3 }}>Sin transferencias todavía.</p>
        ) : historial.map(mv => (
          <div key={mv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.rule}` }}>
            <span style={{ fontSize: 13, flex: 1 }}>{mv.material?.nombre ?? '—'} <span style={{ color: C.ink3, fontWeight: 400 }}>×{mv.cantidad}</span></span>
            <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>
              {mv.espacio_origen?.nombre ?? '—'} → {mv.espacio_destino?.nombre ?? '—'}
            </span>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{mv.fecha}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Serializados ─────────────────────────────────────────────────────────────
function Serializados() {
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ material_id: '', codigo_serie: '', estado: 'operativo', fecha_compra: '', garantia_hasta: '', precio_compra: '', vida_util_anios: '', notas: '' })
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [ru, rm] = await Promise.all([
      fetch('/api/materiales/unidades', { headers: H() }),
      fetch('/api/materiales', { headers: H() }),
    ])
    if (ru.ok) setUnidades((await ru.json()).unidades ?? [])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const crear = async () => {
    if (!form.material_id) return
    const r = await fetch('/api/materiales/unidades', {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        material_id: form.material_id,
        codigo_serie: form.codigo_serie.trim() || null,
        estado: form.estado,
        fecha_compra: form.fecha_compra || null,
        garantia_hasta: form.garantia_hasta || null,
        precio_compra: form.precio_compra !== '' ? Number(form.precio_compra) : null,
        vida_util_anios: form.vida_util_anios !== '' ? Number(form.vida_util_anios) : null,
        notas: form.notas.trim() || null,
      }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', codigo_serie: '', estado: 'operativo', fecha_compra: '', garantia_hasta: '', precio_compra: '', vida_util_anios: '', notas: '' })
    cargar()
  }

  const darBaja = async (id: string) => {
    if (!confirm('¿Dar de baja esta unidad?')) return
    await fetch('/api/materiales/unidades', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Registrar unidad serializada</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={{ ...inp(), gridColumn: '1 / 3' }} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.filter(m => m.tipo === 'activo').map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <input style={inp()} placeholder="Nº serie (opcional)" value={form.codigo_serie} onChange={e => setForm({ ...form, codigo_serie: e.target.value })} />
          <select style={inp()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {ESTADOS_MAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Fecha compra" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} />
          <input style={inp()} type="date" placeholder="Garantía hasta" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Precio compra €" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={inp()} type="number" placeholder="Vida útil (años)" value={form.vida_util_anios} onChange={e => setForm({ ...form, vida_util_anios: e.target.value })} />
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas (opcional)" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={crear}>Añadir unidad (QR auto)</button>
      </div>

      {qrUrl && (
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <img src={qrUrl} alt="QR unidad" style={{ width: 200, height: 200 }} />
          <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}`, fontSize: 12 }} onClick={() => setQrUrl(null)}>Cerrar QR</button>
        </div>
      )}

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : unidades.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin unidades serializadas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unidades.map(u => (
            <div key={u.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{u.material?.nombre ?? '—'}</span>
                  <span style={badge(ESTADO_COLOR[u.estado] ?? C.ink3)}>{u.estado}</span>
                </div>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                  QR: {u.codigo_qr}{u.codigo_serie ? ` · Serie: ${u.codigo_serie}` : ''}
                  {u.garantia_hasta ? ` · Garantía: ${new Date(u.garantia_hasta).toLocaleDateString('es-ES')}` : ''}
                </div>
              </div>
              <button style={{ ...btn('transparent'), fontSize: 12, color: C.ink3, border: `1px solid ${C.rule}`, padding: '5px 9px' }}
                onClick={() => setQrUrl(`/api/materiales/qr/${encodeURIComponent(u.codigo_qr)}`)}>QR</button>
              <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '6px 10px', fontSize: 12 }} onClick={() => darBaja(u.id)}>Baja</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Historial (ledger) ───────────────────────────────────────────────────────
function Historial() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ material_id: '', tipo: '', fecha_desde: '', fecha_hasta: '' })
  const [formMov, setFormMov] = useState({ material_id: '', tipo: 'entrada', cantidad: '', notas: '' })

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' })
    if (filtros.material_id) params.set('material_id', filtros.material_id)
    if (filtros.tipo) params.set('tipo', filtros.tipo)
    if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde)
    if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta)
    const [rm, rh] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch(`/api/materiales/movimientos?${params}`, { headers: H() }),
    ])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (rh.ok) setMovimientos((await rh.json()).movimientos ?? [])
    setLoading(false)
  }, [filtros])
  useEffect(() => { cargar() }, [cargar])

  const registrar = async () => {
    const cant = Number(formMov.cantidad)
    if (!formMov.material_id || !(cant > 0)) return
    const r = await fetch('/api/materiales/movimientos', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ material_id: formMov.material_id, tipo: formMov.tipo, cantidad: cant, notas: formMov.notas.trim() || null }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setFormMov({ material_id: '', tipo: 'entrada', cantidad: '', notas: '' })
    cargar()
  }

  const TIPOS_MOV = ['entrada', 'salida', 'devolucion', 'rotura', 'ajuste', 'transferencia']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Registrar movimiento</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={inp()} value={formMov.material_id} onChange={e => setFormMov({ ...formMov, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <select style={inp()} value={formMov.tipo} onChange={e => setFormMov({ ...formMov, tipo: e.target.value })}>
            {TIPOS_MOV.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={inp()} type="number" placeholder="Cantidad" value={formMov.cantidad} onChange={e => setFormMov({ ...formMov, cantidad: e.target.value })} />
          <input style={inp()} placeholder="Notas (opcional)" value={formMov.notas} onChange={e => setFormMov({ ...formMov, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={registrar}>Registrar</button>
      </div>

      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Filtros</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={inp()} value={filtros.material_id} onChange={e => setFiltros({ ...filtros, material_id: e.target.value })}>
            <option value="">Todos los materiales</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <select style={inp()} value={filtros.tipo} onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}>
            <option value="">Todos los tipos</option>
            {TIPOS_MOV.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Desde" value={filtros.fecha_desde} onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })} />
          <input style={inp()} type="date" placeholder="Hasta" value={filtros.fecha_hasta} onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })} />
        </div>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : movimientos.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin movimientos con los filtros actuales.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {movimientos.map(mv => (
            <div key={mv.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <span style={badge(MOV_COLOR[mv.tipo] ?? C.ink3)}>{mv.tipo}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13 }}>{mv.material?.nombre ?? '—'}</span>
                {(mv.espacio_origen || mv.espacio_destino) && (
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginLeft: 6 }}>
                    {mv.espacio_origen?.nombre ?? '—'}{mv.espacio_destino ? ` → ${mv.espacio_destino.nombre}` : ''}
                  </span>
                )}
                {mv.notas && <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{mv.notas}</div>}
              </div>
              <span style={{ fontFamily: SM, fontSize: 13, fontWeight: 700 }}>×{mv.cantidad}</span>
              <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, flexShrink: 0 }}>{mv.fecha}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
