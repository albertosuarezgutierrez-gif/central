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
interface Kit { id: string; nombre: string; descripcion: string | null; activo: boolean }
interface KitItem { id: string; kit_id: string; material_id: string; cantidad: number; material: { nombre: string; categoria: string } | null }
interface Cliente { id: string; nombre: string; empresa: string | null; nif: string | null; telefono: string | null; email: string | null; notas: string | null }
interface Proveedor { id: string; nombre: string; contacto: string | null; telefono: string | null; email: string | null; nif: string | null; plazo_entrega_dias: number | null; notas: string | null }
interface Mantenimiento { id: string; material_id: string; unidad_id: string | null; tipo: string; estado: string; fecha_prevista: string | null; fecha_realizada: string | null; coste: number | null; notas: string | null; material: { nombre: string } | null }
interface Reserva { id: string; material_id: string; cantidad: number; fecha_desde: string; fecha_hasta: string; estado: string; notas: string | null; cliente: { nombre: string } | null; material: { nombre: string } | null }
interface InventarioFisico { id: string; espacio_id: string | null; estado: string; fecha: string; espacio: { nombre: string } | null }
interface LineasInventario { id: string; material_id: string; cantidad_sistema: number; cantidad_contada: number; ajuste_generado: boolean; material: { nombre: string; categoria: string } | null }

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
const MANT_ESTADO_COLOR: Record<string, string> = {
  pendiente: '#B45309', en_curso: '#2B6A9E', completado: '#2E7D5E',
}

const TABS = [
  { id: 'resumen',        label: 'Resumen' },
  { id: 'catalogo',       label: 'Catálogo' },
  { id: 'espacios',       label: 'Espacios' },
  { id: 'transferencias', label: 'Transferencias' },
  { id: 'serializados',   label: 'Serializados' },
  { id: 'kits',           label: 'Kits' },
  { id: 'inventario',     label: 'Inventario' },
  { id: 'mantenimiento',  label: 'Mantenimiento' },
  { id: 'reservas',       label: 'Reservas' },
  { id: 'clientes',       label: 'Clientes' },
  { id: 'proveedores',    label: 'Proveedores' },
  { id: 'historial',      label: 'Historial' },
  { id: 'importar',       label: 'Importar' },
  { id: 'informes',       label: 'Informes' },
] as const

type TabId = typeof TABS[number]['id']

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function OwnerMaterialesPage() {
  const [tab, setTab] = useState<TabId>('resumen')
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 4px' }}>Materiales</h1>
        <p style={{ color: C.ink3, fontSize: 13, margin: '0 0 14px' }}>
          Inventario de activos y consumibles. Ledger, kits, inventario físico, mantenimiento, reservas.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: SN, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
              border: `1px solid ${tab === t.id ? C.red : C.rule}`, cursor: 'pointer',
              background: tab === t.id ? C.red : 'transparent',
              color: tab === t.id ? C.paper : C.ink2,
            }}>{t.label}</button>
          ))}
        </div>

        {tab === 'resumen'        && <Resumen />}
        {tab === 'catalogo'       && <Catalogo />}
        {tab === 'espacios'       && <Espacios />}
        {tab === 'transferencias' && <Transferencias />}
        {tab === 'serializados'   && <Serializados />}
        {tab === 'kits'           && <Kits />}
        {tab === 'inventario'     && <InventarioFisicoTab />}
        {tab === 'mantenimiento'  && <MantenimientoTab />}
        {tab === 'reservas'       && <ReservasTab />}
        {tab === 'clientes'       && <ClientesTab />}
        {tab === 'proveedores'    && <ProveedoresTab />}
        {tab === 'historial'      && <Historial />}
        {tab === 'importar'       && <ImportarTab />}
        {tab === 'informes'       && <InformesTab />}
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

  const totalUnidades = materiales.reduce((s, m) => s + (m.cantidad_total ?? 0), 0)
  const valorCompra = materiales.reduce((s, m) => s + ((m.precio_compra ?? 0) * (m.cantidad_total ?? 0)), 0)

  const kpis = [
    { label: 'Referencias', value: String(materiales.length), color: C.green },
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
              <span style={badge(a.tipo === 'stock_minimo' ? C.red : C.amber)}>{a.tipo}</span>{' '}{a.mensaje}
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
          ))}
      </div>
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
    setNueva(''); onUpdate()
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
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
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
          <input style={inp()} placeholder="Código" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} />
          <input style={inp()} type="number" placeholder="Unidades totales" value={form.cantidad_total} onChange={e => setForm({ ...form, cantidad_total: e.target.value })} />
          <input style={inp()} type="number" placeholder="Stock mínimo" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Precio compra €" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Coste reposición €" value={form.coste_reposicion} onChange={e => setForm({ ...form, coste_reposicion: e.target.value })} />
          <input style={inp()} placeholder="Proveedor" value={form.proveedor_nombre} onChange={e => setForm({ ...form, proveedor_nombre: e.target.value })} />
          <input style={inp()} placeholder="Ref. proveedor" value={form.proveedor_referencia} onChange={e => setForm({ ...form, proveedor_referencia: e.target.value })} />
          <input style={inp()} type="date" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={reset}>Cancelar</button>}
        </div>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin materiales.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(m => {
            const bajominimo = m.stock_minimo != null && m.cantidad_disponible <= m.stock_minimo
            const isOpen = expanded === m.id
            return (
              <div key={m.id} style={{ ...card(), cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : m.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nombre}</span>
                      <span style={badge(ESTADO_COLOR[m.estado] ?? C.ink3)}>{m.estado}</span>
                      {bajominimo && <span style={badge(C.red)}>⚠ stock bajo</span>}
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>{m.categoria}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: bajominimo ? C.red : C.green }}>
                      {m.cantidad_disponible}<span style={{ color: C.ink3, fontWeight: 400, fontSize: 12 }}> / {m.cantidad_total}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button style={btn(C.bg3)} onClick={() => editar(m)}>Editar</button>
                    <button style={{ ...btn('transparent'), color: C.green, border: `1px solid ${C.green}44`, padding: '5px 9px', fontSize: 12 }}
                      onClick={() => { setReponerId(m.id); setReponerCant(''); setReponerNotas('') }}>+ Reponer</button>
                    <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }} onClick={() => borrar(m.id)}>Baja</button>
                  </div>
                </div>
                {reponerId === m.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                    <input style={{ ...inp(), width: 90 }} type="number" placeholder="Uds." value={reponerCant} onChange={e => setReponerCant(e.target.value)} />
                    <input style={{ ...inp(), flex: 1 }} placeholder="Notas" value={reponerNotas} onChange={e => setReponerNotas(e.target.value)} />
                    <button style={btn(C.green)} onClick={() => reponer(m.id)}>OK</button>
                    <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}` }} onClick={() => setReponerId(null)}>×</button>
                  </div>
                )}
                {isOpen && !reponerId && m.precio_compra != null && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.rule}`, fontFamily: SM, fontSize: 12, color: C.ink2 }}>
                    Precio compra: <b>{eur(m.precio_compra)}</b>
                    {m.garantia_hasta && <> · Garantía: <b>{new Date(m.garantia_hasta).toLocaleDateString('es-ES')}</b></>}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar espacio' : 'Nuevo espacio'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={inp()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_ESPACIO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={inp()} placeholder="Descripción" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={() => { setEditId(null); setForm({ nombre: '', descripcion: '', tipo: 'almacen' }) }}>Cancelar</button>}
        </div>
      </div>
      {qrUrl && (
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <img src={qrUrl} alt="QR" style={{ width: 200, height: 200 }} />
          <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}`, fontSize: 12 }} onClick={() => setQrUrl(null)}>Cerrar</button>
        </div>
      )}
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin espacios.</p>
      ) : items.map(e => (
        <div key={e.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{e.nombre}</div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{e.tipo}{e.descripcion ? ` · ${e.descripcion}` : ''}</div>
          </div>
          <button style={{ ...btn('transparent'), fontSize: 12, color: C.ink3, border: `1px solid ${C.rule}`, padding: '5px 9px' }}
            onClick={() => setQrUrl(`/api/materiales/qr/${encodeURIComponent(e.id)}`)}>QR</button>
          <button style={btn(C.bg3)} onClick={() => { setEditId(e.id); setForm({ nombre: e.nombre, descripcion: e.descripcion ?? '', tipo: e.tipo }) }}>Editar</button>
          <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }}
            onClick={async () => { if (!confirm('¿Eliminar?')) return; await fetch('/api/materiales/espacios', { method: 'DELETE', headers: H(), body: JSON.stringify({ id: e.id }) }); cargar() }}>×</button>
        </div>
      ))}
    </div>
  )
}

// ─── Transferencias ───────────────────────────────────────────────────────────
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
      body: JSON.stringify({ material_id: form.material_id, tipo: 'transferencia', cantidad: cant, espacio_origen_id: form.espacio_origen_id || null, espacio_destino_id: form.espacio_destino_id, notas: form.notas.trim() || null }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', cantidad: '', espacio_origen_id: '', espacio_destino_id: '', notas: '' }); cargar()
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
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={transferir}>Registrar transferencia</button>
      </div>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Historial</div>
        {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : historial.length === 0 ? <p style={{ fontSize: 12, color: C.ink3 }}>Sin transferencias.</p>
          : historial.map(mv => (
            <div key={mv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 13, flex: 1 }}>{mv.material?.nombre ?? '—'} ×{mv.cantidad}</span>
              <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>{mv.espacio_origen?.nombre ?? '—'} → {mv.espacio_destino?.nombre ?? '—'}</span>
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
      body: JSON.stringify({ material_id: form.material_id, codigo_serie: form.codigo_serie.trim() || null, estado: form.estado, fecha_compra: form.fecha_compra || null, garantia_hasta: form.garantia_hasta || null, precio_compra: form.precio_compra !== '' ? Number(form.precio_compra) : null, vida_util_anios: form.vida_util_anios !== '' ? Number(form.vida_util_anios) : null, notas: form.notas.trim() || null }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', codigo_serie: '', estado: 'operativo', fecha_compra: '', garantia_hasta: '', precio_compra: '', vida_util_anios: '', notas: '' }); cargar()
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
          <input style={inp()} placeholder="Nº serie" value={form.codigo_serie} onChange={e => setForm({ ...form, codigo_serie: e.target.value })} />
          <select style={inp()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {ESTADOS_MAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Fecha compra" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} />
          <input style={inp()} type="date" placeholder="Garantía hasta" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Precio compra €" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={inp()} type="number" placeholder="Vida útil (años)" value={form.vida_util_anios} onChange={e => setForm({ ...form, vida_util_anios: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={crear}>Añadir (QR auto)</button>
      </div>
      {qrUrl && (
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <img src={qrUrl} alt="QR" style={{ width: 200, height: 200 }} />
          <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}`, fontSize: 12 }} onClick={() => setQrUrl(null)}>Cerrar</button>
        </div>
      )}
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : unidades.length === 0 ? <p style={{ color: C.ink3 }}>Sin unidades serializadas.</p>
        : unidades.map(u => (
          <div key={u.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{u.material?.nombre ?? '—'}</span>
                <span style={badge(ESTADO_COLOR[u.estado] ?? C.ink3)}>{u.estado}</span>
              </div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>QR: {u.codigo_qr}{u.codigo_serie ? ` · Serie: ${u.codigo_serie}` : ''}</div>
            </div>
            <button style={{ ...btn('transparent'), fontSize: 12, color: C.ink3, border: `1px solid ${C.rule}`, padding: '5px 9px' }}
              onClick={() => setQrUrl(`/api/materiales/qr/${encodeURIComponent(u.codigo_qr)}`)}>QR</button>
            <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }}
              onClick={async () => { if (!confirm('¿Dar de baja?')) return; await fetch('/api/materiales/unidades', { method: 'DELETE', headers: H(), body: JSON.stringify({ id: u.id }) }); cargar() }}>Baja</button>
          </div>
        ))}
    </div>
  )
}

// ─── Kits ─────────────────────────────────────────────────────────────────────
function Kits() {
  const [kits, setKits] = useState<Kit[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', descripcion: '' })
  const [expandedKit, setExpandedKit] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, KitItem[]>>({})
  const [itemForm, setItemForm] = useState({ material_id: '', cantidad: '1' })
  const [instForm, setInstForm] = useState({ kit_id: '', cantidad: '1', espacio_destino_id: '' })

  const cargar = useCallback(async () => {
    const [rk, rm, re] = await Promise.all([
      fetch('/api/materiales/kits', { headers: H() }),
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/espacios', { headers: H() }),
    ])
    if (rk.ok) setKits((await rk.json()).kits ?? [])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (re.ok) setEspacios((await re.json()).espacios ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const cargarItems = async (kitId: string) => {
    const r = await fetch(`/api/materiales/kits/${kitId}/items`, { headers: H() })
    if (r.ok) {
      const data = await r.json()
      setItems(prev => ({ ...prev, [kitId]: data.items ?? [] }))
    }
  }

  const toggleKit = (kitId: string) => {
    if (expandedKit === kitId) { setExpandedKit(null); return }
    setExpandedKit(kitId)
    cargarItems(kitId)
  }

  const crearKit = async () => {
    if (!form.nombre.trim()) return
    await fetch('/api/materiales/kits', { method: 'POST', headers: H(), body: JSON.stringify(form) })
    setForm({ nombre: '', descripcion: '' }); cargar()
  }

  const addItem = async (kitId: string) => {
    if (!itemForm.material_id || !(Number(itemForm.cantidad) > 0)) return
    await fetch(`/api/materiales/kits/${kitId}/items`, { method: 'POST', headers: H(), body: JSON.stringify({ material_id: itemForm.material_id, cantidad: Number(itemForm.cantidad) }) })
    setItemForm({ material_id: '', cantidad: '1' }); cargarItems(kitId)
  }

  const deleteItem = async (kitId: string, itemId: string) => {
    await fetch(`/api/materiales/kits/${kitId}/items`, { method: 'DELETE', headers: H(), body: JSON.stringify({ id: itemId }) })
    cargarItems(kitId)
  }

  const instanciar = async () => {
    if (!instForm.kit_id || !(Number(instForm.cantidad) > 0)) return
    const r = await fetch('/api/materiales/kits/instanciar', { method: 'POST', headers: H(), body: JSON.stringify({ kit_id: instForm.kit_id, cantidad: Number(instForm.cantidad), espacio_destino_id: instForm.espacio_destino_id || null }) })
    const d = await r.json()
    if (!r.ok) { alert(d.error ?? 'Error'); return }
    alert(`Kit asignado: ${d.total} movimientos generados`)
    setInstForm({ kit_id: '', cantidad: '1', espacio_destino_id: '' }); cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nuevo kit</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inp(), flex: 2 }} placeholder="Nombre del kit" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <input style={{ ...inp(), flex: 3 }} placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
          <button style={btn(C.green)} onClick={crearKit}>Crear</button>
        </div>
      </div>

      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Asignar kit</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <select style={inp()} value={instForm.kit_id} onChange={e => setInstForm({ ...instForm, kit_id: e.target.value })}>
            <option value="">Kit…</option>
            {kits.map(k => <option key={k.id} value={k.id}>{k.nombre}</option>)}
          </select>
          <input style={inp()} type="number" placeholder="Cantidad (×N)" value={instForm.cantidad} onChange={e => setInstForm({ ...instForm, cantidad: e.target.value })} />
          <select style={inp()} value={instForm.espacio_destino_id} onChange={e => setInstForm({ ...instForm, espacio_destino_id: e.target.value })}>
            <option value="">Destino (opcional)</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <button style={{ ...btn(C.red), marginTop: 10 }} onClick={instanciar}>Asignar kit ×N (genera salidas)</button>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : kits.length === 0 ? <p style={{ color: C.ink3 }}>Sin kits todavía.</p>
        : kits.map(k => (
          <div key={k.id} style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleKit(k.id)}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{k.nombre}</div>
                {k.descripcion && <div style={{ fontSize: 12, color: C.ink3 }}>{k.descripcion}</div>}
              </div>
              <button style={{ ...btn('transparent'), fontSize: 12, color: expandedKit === k.id ? C.red : C.ink3, border: `1px solid ${C.rule}`, padding: '5px 9px' }}
                onClick={() => toggleKit(k.id)}>{expandedKit === k.id ? '▲ Cerrar' : '▼ Items'}</button>
              <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }}
                onClick={async () => { if (!confirm('¿Eliminar kit?')) return; await fetch('/api/materiales/kits', { method: 'DELETE', headers: H(), body: JSON.stringify({ id: k.id }) }); cargar() }}>×</button>
            </div>
            {expandedKit === k.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.rule}` }}>
                {(items[k.id] ?? []).map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${C.rule}` }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{it.material?.nombre ?? it.material_id}</span>
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>×{it.cantidad}</span>
                    <button style={{ ...btn('transparent'), color: C.red, border: 'none', padding: '2px 6px', fontSize: 13 }} onClick={() => deleteItem(k.id, it.id)}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select style={{ ...inp(), flex: 2 }} value={itemForm.material_id} onChange={e => setItemForm({ ...itemForm, material_id: e.target.value })}>
                    <option value="">Añadir material…</option>
                    {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                  <input style={{ ...inp(), width: 70 }} type="number" placeholder="Cant." value={itemForm.cantidad} onChange={e => setItemForm({ ...itemForm, cantidad: e.target.value })} />
                  <button style={btn(C.green)} onClick={() => addItem(k.id)}>+</button>
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  )
}

// ─── Inventario físico ────────────────────────────────────────────────────────
function InventarioFisicoTab() {
  const [inventarios, setInventarios] = useState<InventarioFisico[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)
  const [espacioId, setEspacioId] = useState('')
  const [sesionActiva, setSesionActiva] = useState<string | null>(null)
  const [lineas, setLineas] = useState<LineasInventario[]>([])
  const [conteos, setConteos] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    const [ri, re] = await Promise.all([
      fetch('/api/materiales/inventario-fisico', { headers: H() }),
      fetch('/api/materiales/espacios', { headers: H() }),
    ])
    if (ri.ok) setInventarios((await ri.json()).inventarios ?? [])
    if (re.ok) setEspacios((await re.json()).espacios ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const iniciar = async () => {
    const r = await fetch('/api/materiales/inventario-fisico', { method: 'POST', headers: H(), body: JSON.stringify({ espacio_id: espacioId || null }) })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    const { inventario } = await r.json()
    setSesionActiva(inventario.id)
    cargarLineas(inventario.id)
    cargar()
  }

  const cargarLineas = async (id: string) => {
    const r = await fetch(`/api/materiales/inventario-fisico/${id}/lineas`, { headers: H() })
    if (r.ok) {
      const ls: LineasInventario[] = (await r.json()).lineas ?? []
      setLineas(ls)
      setConteos(Object.fromEntries(ls.map(l => [l.id, String(l.cantidad_contada)])))
    }
  }

  const actualizarLinea = async (lineaId: string) => {
    await fetch(`/api/materiales/inventario-fisico/${sesionActiva}/lineas`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ id: lineaId, cantidad_contada: Number(conteos[lineaId] ?? 0) }),
    })
  }

  const cerrar = async () => {
    if (!sesionActiva) return
    if (!confirm('¿Cerrar inventario y generar ajustes automáticos?')) return
    await Promise.all(lineas.map(l => actualizarLinea(l.id)))
    const r = await fetch(`/api/materiales/inventario-fisico/${sesionActiva}/cerrar`, { method: 'POST', headers: H() })
    const d = await r.json()
    if (!r.ok) { alert(d.error ?? 'Error'); return }
    alert(`Inventario cerrado. ${d.ajustes_generados} ajustes generados.`)
    setSesionActiva(null); setLineas([]); cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!sesionActiva ? (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Iniciar conteo físico</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...inp(), flex: 1 }} value={espacioId} onChange={e => setEspacioId(e.target.value)}>
              <option value="">Todos los espacios</option>
              {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button style={btn(C.green)} onClick={iniciar}>Iniciar sesión</button>
          </div>
        </div>
      ) : (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Conteo en curso — introduce las cantidades contadas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {lineas.map(l => {
              const delta = Number(conteos[l.id] ?? 0) - l.cantidad_sistema
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.rule}` }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{l.material?.nombre ?? l.material_id}</span>
                  <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>Sist: {l.cantidad_sistema}</span>
                  <input style={{ ...inp(), width: 80 }} type="number" value={conteos[l.id] ?? ''} onChange={e => setConteos(prev => ({ ...prev, [l.id]: e.target.value }))} />
                  {delta !== 0 && <span style={{ fontSize: 12, color: delta > 0 ? C.green : C.red, fontWeight: 700 }}>{delta > 0 ? `+${delta}` : delta}</span>}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn(C.green)} onClick={cerrar}>Cerrar y generar ajustes</button>
            <button style={{ ...btn('transparent'), color: C.ink3, border: `1px solid ${C.rule}` }} onClick={() => { setSesionActiva(null); setLineas([]) }}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Sesiones anteriores</div>
          {inventarios.length === 0 ? <p style={{ fontSize: 12, color: C.ink3 }}>Sin sesiones todavía.</p>
            : inventarios.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.rule}` }}>
                <span style={{ fontSize: 13, flex: 1 }}>{inv.espacio?.nombre ?? 'Todos'}</span>
                <span style={badge(inv.estado === 'cerrado' ? C.green : C.amber)}>{inv.estado}</span>
                <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{inv.fecha}</span>
                {inv.estado === 'borrador' && (
                  <button style={{ ...btn('transparent'), fontSize: 12, color: C.ink3, border: `1px solid ${C.rule}`, padding: '4px 8px' }}
                    onClick={() => { setSesionActiva(inv.id); cargarLineas(inv.id) }}>Continuar</button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Mantenimiento ────────────────────────────────────────────────────────────
function MantenimientoTab() {
  const [items, setItems] = useState<Mantenimiento[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ material_id: '', tipo: 'preventivo', estado: 'pendiente', fecha_prevista: '', coste: '', notas: '' })

  const cargar = useCallback(async () => {
    const [rm, rh] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/mantenimiento', { headers: H() }),
    ])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (rh.ok) setItems((await rh.json()).mantenimientos ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const crear = async () => {
    if (!form.material_id) return
    const r = await fetch('/api/materiales/mantenimiento', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ ...form, coste: form.coste !== '' ? Number(form.coste) : null, fecha_prevista: form.fecha_prevista || null }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', tipo: 'preventivo', estado: 'pendiente', fecha_prevista: '', coste: '', notas: '' }); cargar()
  }

  const actualizar = async (id: string, estado: string) => {
    await fetch('/api/materiales/mantenimiento', { method: 'PATCH', headers: H(), body: JSON.stringify({ id, estado, fecha_realizada: estado === 'completado' ? new Date().toISOString().slice(0, 10) : null }) })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Registrar intervención</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={{ ...inp(), gridColumn: '1 / 3' }} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <select style={inp()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {['preventivo', 'correctivo', 'revision'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={inp()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {['pendiente', 'en_curso', 'completado'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Fecha prevista" value={form.fecha_prevista} onChange={e => setForm({ ...form, fecha_prevista: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Coste €" value={form.coste} onChange={e => setForm({ ...form, coste: e.target.value })} />
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={crear}>Registrar</button>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? <p style={{ color: C.ink3 }}>Sin registros.</p>
        : items.map(m => (
          <div key={m.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{m.material?.nombre ?? '—'}</span>
                <span style={badge(MANT_ESTADO_COLOR[m.estado] ?? C.ink3)}>{m.estado}</span>
                <span style={badge(C.ink3)}>{m.tipo}</span>
              </div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                {m.fecha_prevista ? `Previsto: ${m.fecha_prevista}` : ''}
                {m.coste != null ? ` · ${eur(m.coste)}` : ''}
                {m.notas ? ` · ${m.notas}` : ''}
              </div>
            </div>
            {m.estado === 'pendiente' && <button style={btn('#2B6A9E')} onClick={() => actualizar(m.id, 'en_curso')}>Iniciar</button>}
            {m.estado === 'en_curso' && <button style={btn(C.green)} onClick={() => actualizar(m.id, 'completado')}>Completar</button>}
          </div>
        ))}
    </div>
  )
}

// ─── Reservas ─────────────────────────────────────────────────────────────────
function ReservasTab() {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ material_id: '', cantidad: '1', fecha_desde: '', fecha_hasta: '', cliente_id: '', notas: '' })

  const cargar = useCallback(async () => {
    const [rm, rc, rr] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/clientes', { headers: H() }),
      fetch('/api/materiales/reservas', { headers: H() }),
    ])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (rc.ok) setClientes((await rc.json()).clientes ?? [])
    if (rr.ok) setReservas((await rr.json()).reservas ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const crear = async () => {
    if (!form.material_id || !form.fecha_desde || !form.fecha_hasta) return
    const r = await fetch('/api/materiales/reservas', { method: 'POST', headers: H(), body: JSON.stringify({ ...form, cantidad: Number(form.cantidad) || 1, cliente_id: form.cliente_id || null }) })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', cantidad: '1', fecha_desde: '', fecha_hasta: '', cliente_id: '', notas: '' }); cargar()
  }

  const cancelar = async (id: string) => {
    if (!confirm('¿Cancelar reserva?')) return
    await fetch('/api/materiales/reservas', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nueva reserva</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={{ ...inp(), gridColumn: '1 / 3' }} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.cantidad_disponible} disp.)</option>)}
          </select>
          <input style={inp()} type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          <select style={inp()} value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id: e.target.value })}>
            <option value="">Cliente (opcional)</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Desde" value={form.fecha_desde} onChange={e => setForm({ ...form, fecha_desde: e.target.value })} />
          <input style={inp()} type="date" placeholder="Hasta" value={form.fecha_hasta} onChange={e => setForm({ ...form, fecha_hasta: e.target.value })} />
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={crear}>Reservar</button>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : reservas.length === 0 ? <p style={{ color: C.ink3 }}>Sin reservas.</p>
        : reservas.map(r => (
          <div key={r.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{r.material?.nombre ?? '—'}</span>
                <span style={{ fontSize: 12, color: C.ink3 }}>×{r.cantidad}</span>
                <span style={badge(r.estado === 'confirmada' ? C.green : C.ink3)}>{r.estado}</span>
              </div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                {r.fecha_desde} → {r.fecha_hasta}
                {r.cliente ? ` · ${r.cliente.nombre}` : ''}
              </div>
            </div>
            {r.estado === 'confirmada' && (
              <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }} onClick={() => cancelar(r.id)}>Cancelar</button>
            )}
          </div>
        ))}
    </div>
  )
}

// ─── Clientes ─────────────────────────────────────────────────────────────────
function ClientesTab() {
  const [items, setItems] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', empresa: '', nif: '', telefono: '', email: '', notas: '' })
  const [editId, setEditId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/materiales/clientes', { headers: H() })
    if (r.ok) setItems((await r.json()).clientes ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!form.nombre.trim()) return
    if (editId) {
      await fetch('/api/materiales/clientes', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: editId, ...form }) })
    } else {
      await fetch('/api/materiales/clientes', { method: 'POST', headers: H(), body: JSON.stringify(form) })
    }
    setEditId(null); setForm({ nombre: '', empresa: '', nif: '', telefono: '', email: '', notas: '' }); cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar cliente' : 'Nuevo cliente'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Nombre *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <input style={inp()} placeholder="Empresa" value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} />
          <input style={inp()} placeholder="NIF" value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} />
          <input style={inp()} placeholder="Teléfono" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
          <input style={inp()} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={() => { setEditId(null); setForm({ nombre: '', empresa: '', nif: '', telefono: '', email: '', notas: '' }) }}>Cancelar</button>}
        </div>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? <p style={{ color: C.ink3 }}>Sin clientes.</p>
        : items.map(c => (
          <div key={c.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nombre}</div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                {[c.empresa, c.nif, c.telefono, c.email].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button style={btn(C.bg3)} onClick={() => { setEditId(c.id); setForm({ nombre: c.nombre, empresa: c.empresa ?? '', nif: c.nif ?? '', telefono: c.telefono ?? '', email: c.email ?? '', notas: c.notas ?? '' }) }}>Editar</button>
            <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }}
              onClick={async () => { if (!confirm('¿Eliminar?')) return; await fetch('/api/materiales/clientes', { method: 'DELETE', headers: H(), body: JSON.stringify({ id: c.id }) }); cargar() }}>×</button>
          </div>
        ))}
    </div>
  )
}

// ─── Proveedores ──────────────────────────────────────────────────────────────
function ProveedoresTab() {
  const [items, setItems] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', contacto: '', telefono: '', email: '', nif: '', plazo_entrega_dias: '', notas: '' })
  const [editId, setEditId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/materiales/proveedores', { headers: H() })
    if (r.ok) setItems((await r.json()).proveedores ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!form.nombre.trim()) return
    const payload = { ...form, plazo_entrega_dias: form.plazo_entrega_dias !== '' ? Number(form.plazo_entrega_dias) : null }
    if (editId) {
      await fetch('/api/materiales/proveedores', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: editId, ...payload }) })
    } else {
      await fetch('/api/materiales/proveedores', { method: 'POST', headers: H(), body: JSON.stringify(payload) })
    }
    setEditId(null); setForm({ nombre: '', contacto: '', telefono: '', email: '', nif: '', plazo_entrega_dias: '', notas: '' }); cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Nombre *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <input style={inp()} placeholder="Persona de contacto" value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} />
          <input style={inp()} placeholder="NIF" value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} />
          <input style={inp()} placeholder="Teléfono" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
          <input style={inp()} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input style={inp()} type="number" placeholder="Plazo entrega (días)" value={form.plazo_entrega_dias} onChange={e => setForm({ ...form, plazo_entrega_dias: e.target.value })} />
          <input style={{ ...inp(), gridColumn: '1 / 3' }} placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}` }} onClick={() => { setEditId(null); setForm({ nombre: '', contacto: '', telefono: '', email: '', nif: '', plazo_entrega_dias: '', notas: '' }) }}>Cancelar</button>}
        </div>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? <p style={{ color: C.ink3 }}>Sin proveedores.</p>
        : items.map(p => (
          <div key={p.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nombre}</div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                {[p.contacto, p.nif, p.telefono, p.email, p.plazo_entrega_dias != null ? `${p.plazo_entrega_dias}d entrega` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button style={btn(C.bg3)} onClick={() => { setEditId(p.id); setForm({ nombre: p.nombre, contacto: p.contacto ?? '', telefono: p.telefono ?? '', email: p.email ?? '', nif: p.nif ?? '', plazo_entrega_dias: p.plazo_entrega_dias != null ? String(p.plazo_entrega_dias) : '', notas: p.notas ?? '' }) }}>Editar</button>
            <button style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}44`, padding: '5px 9px', fontSize: 12 }}
              onClick={async () => { if (!confirm('¿Eliminar?')) return; await fetch('/api/materiales/proveedores', { method: 'DELETE', headers: H(), body: JSON.stringify({ id: p.id }) }); cargar() }}>×</button>
          </div>
        ))}
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

  const TIPOS_MOV = ['entrada', 'salida', 'devolucion', 'rotura', 'ajuste', 'transferencia']

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
    setFormMov({ material_id: '', tipo: 'entrada', cantidad: '', notas: '' }); cargar()
  }

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
          <input style={inp()} placeholder="Notas" value={formMov.notas} onChange={e => setFormMov({ ...formMov, notas: e.target.value })} />
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
          <input style={inp()} type="date" value={filtros.fecha_desde} onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })} />
          <input style={inp()} type="date" value={filtros.fecha_hasta} onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })} />
        </div>
      </div>

      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : movimientos.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin movimientos.</p>
      ) : movimientos.map(mv => (
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
  )
}

// ─── Importar CSV ─────────────────────────────────────────────────────────────
function ImportarTab() {
  const [file, setFile] = useState<File | null>(null)
  const [resultado, setResultado] = useState<{ creados: number; errores: number; resultados: { nombre: string; accion: string; error?: string }[] } | null>(null)
  const [cargando, setCargando] = useState(false)

  const descargarPlantilla = () => {
    window.open('/api/materiales/import', '_blank')
  }

  const importar = async () => {
    if (!file) return
    setCargando(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/materiales/import', { method: 'POST', headers: { 'x-ia-session': localStorage.getItem('ia_session') ?? '' }, body: fd })
    const data = await r.json()
    setResultado(data)
    setCargando(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Importación masiva CSV</div>
        <p style={{ fontSize: 12, color: C.ink3, margin: '0 0 12px' }}>
          Sube un archivo CSV con los materiales a crear. Descarga la plantilla para ver las columnas esperadas.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btn(C.bg3)} onClick={descargarPlantilla}>⬇ Descargar plantilla</button>
          <input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12, color: C.ink2 }} />
          <button style={btn(C.green)} onClick={importar} disabled={!file || cargando}>
            {cargando ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>

      {resultado && (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Resultado: <span style={{ color: C.green }}>{resultado.creados} creados</span>
            {resultado.errores > 0 && <span style={{ color: C.red, marginLeft: 8 }}>{resultado.errores} errores</span>}
          </div>
          {resultado.resultados.filter(r => r.accion === 'error').map((r, i) => (
            <div key={i} style={{ fontFamily: SM, fontSize: 11, color: C.red }}>✗ {r.nombre}: {r.error}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Informes ─────────────────────────────────────────────────────────────────
function InformesTab() {
  const abrir = (tipo: string) => {
    const session = localStorage.getItem('ia_session') ?? ''
    window.open(`/api/materiales/informe?tipo=${tipo}&_s=${encodeURIComponent(session)}`, '_blank')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Informes imprimibles</div>
        <p style={{ fontSize: 12, color: C.ink3, margin: '0 0 14px' }}>
          Se abre en pestaña nueva como HTML. Usa el botón &quot;Imprimir / PDF&quot; o Ctrl+P para guardarlo como PDF.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...card(), padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Valoración de inventario</div>
              <div style={{ fontSize: 11, color: C.ink3 }}>Listado completo con cantidades y valor de stock disponible</div>
            </div>
            <button style={btn(C.green)} onClick={() => abrir('valoracion')}>Abrir informe</button>
          </div>
          <div style={{ ...card(), padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Activos por estado</div>
              <div style={{ fontSize: 11, color: C.ink3 }}>Solo activos con estado y valor de compra</div>
            </div>
            <button style={btn(C.green)} onClick={() => abrir('activos')}>Abrir informe</button>
          </div>
          <div style={{ ...card(), padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Historial de movimientos</div>
              <div style={{ fontSize: 11, color: C.ink3 }}>Últimos 500 movimientos del ledger ordenados por fecha</div>
            </div>
            <button style={btn(C.green)} onClick={() => abrir('historial')}>Abrir informe</button>
          </div>
        </div>
      </div>
    </div>
  )
}
