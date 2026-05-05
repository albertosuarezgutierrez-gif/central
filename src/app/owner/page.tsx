'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Analytics from '@/components/Analytics'
import SugerenciaButton from '@/components/SugerenciaButton'

/* ─── Design Tokens ─── */
const C = {
  paper:'#F6F1E7', paper2:'#EFE7D6', paper3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6', ruleS:'#B8A98B',
  red:'#D9442B', redD:'#A8311E', redS:'#F4D8CF',
  amber:'#E8A33B', amberS:'#F7E3B6',
  green:'#3F7D44', greenS:'#D4E4D2',
  dark:'#14110E', dark1:'#1F1A15', dark2:'#2A241D',
  darkFg:'#F6F1E7', darkFg2:'#C9BFAA', darkFg3:'#8D8270',
  darkRule:'#2F2820',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

/* ─── Types ─── */
type Camarero = { id: string; nombre: string; pin: string; rol: string; activo: boolean; seccion_id?: string | null }
type Mesa = { id: string; codigo: string; nombre: string | null; zona: string; capacidad: number; estado: string }
type Turno = { id: string; nombre: string; estado: string; created_at: string; fecha: string }
type TurnoStats = { total_comandas: number; avg_latencia_ms: number | null; mesas_activas: { codigo: string; count: number }[] }
type Impresora = { id: string; nombre: string; seccion_id: string; cloud_device_id: string | null; modelo: string | null; activa: boolean; ultimo_ping: string | null; configurada: boolean; connection_type: string; ip_address: string | null; port: number | null }
type BridgeToken = { id: string; token: string; nombre: string; activo: boolean; ultimo_ping: string | null }
type PrintJob = { id: string; status: string; seccion_id: string; created_at: string; sent_at: string | null; acked_at: string | null; attempts: number; error_msg: string | null; impresoras?: { nombre: string } }

/* ─── Logo ─── */
const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 56 56">
    <rect width="56" height="56" rx="8" fill="#1F1A15"/>
    <g transform="translate(11,14)">
      <rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/>
      <rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/>
      <rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/>
      <rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/>
      <rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/>
      <rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/>
    </g>
  </svg>
)

/* ─── Helpers ─── */
const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
)
const ICONS = {
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  clock: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  plus: 'M12 5v14M5 12h14',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22',
  play: 'M5 3l14 9-14 9V3z',
  stop: 'M6 6h12v12H6z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  sparkle: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17zM19 2l.5 1.5L21 4l-1.5.5L19 6l-.5-1.5L17 4l1.5-.5L19 2z',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1zm3 5h10M7 10h10M7 13h6',
  shield: 'M12 2l8 3v6c0 5-3.5 9.74-8 11-4.5-1.26-8-6-8-11V5l8-3z',
  externalLink: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
}

const ZONA_LABEL: Record<string, string> = { salon: 'Salón', terraza: 'Terraza', barra: 'Barra' }
const ROL_LABEL: Record<string, string> = { camarero: 'Camarero', admin: 'Admin', cocina: 'Cocina' }

/* ─── Components ─── */
const Badge = ({ children, color = C.paper2 }: { children: React.ReactNode; color?: string }) => (
  <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
    background: color, color: C.ink2, padding: '2px 8px', borderRadius: 999,
    border: `1px solid ${C.rule}`, whiteSpace: 'nowrap' }}>
    {children}
  </span>
)

const Btn = ({
  children, onClick, variant = 'default', size = 'md', disabled = false
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'md'; disabled?: boolean
}) => {
  const bg = variant === 'primary' ? C.red : variant === 'danger' ? C.redS : variant === 'ghost' ? 'transparent' : C.bone
  const fg = variant === 'primary' ? C.bone : variant === 'danger' ? C.redD : C.ink2
  const border = variant === 'ghost' ? 'none' : `1px solid ${variant === 'primary' ? C.redD : variant === 'danger' ? '#E8B4AD' : C.rule}`
  const pad = size === 'sm' ? '5px 10px' : '8px 14px'
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 6,
        background: bg, color: fg, border, borderRadius: 4,
        fontFamily: SN, fontSize: size === 'sm' ? 12 : 13, fontWeight: 600,
        padding: pad, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1,
        transition: 'all .15s' }}>
      {children}
    </button>
  )
}

const Field = ({ label, value, onChange, placeholder, type = 'text', error }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>{label}</label>
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ fontFamily: SN, fontSize: 14, background: C.bone, border: `1px solid ${error ? C.red : C.rule}`,
        borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none', width: '100%', boxSizing: 'border-box' }}
    />
    {error && <span style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{error}</span>}
  </div>
)

const Select = ({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ fontFamily: SN, fontSize: 14, background: C.bone, border: `1px solid ${C.rule}`,
        borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none', width: '100%' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
)

/* ─── Modal ─── */
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(26,23,20,.6)', backdropFilter: 'blur(4px)' }}>
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, width: '100%', maxWidth: 440,
      margin: 16, boxShadow: '0 18px 40px -12px rgba(26,23,20,.28)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink }}>{title}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, display: 'flex' }}>
          <Icon d={ICONS.x} size={20}/>
        </button>
      </div>
      <div style={{ padding: '24px' }}>{children}</div>
    </div>
  </div>
)

/* ─── Tab: Camareros ─── */
type Seccion = { id: string; nombre: string }
function CamarerosTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [camareros, setCamareros] = useState<Camarero[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Camarero } | { del: Camarero }>(null)
  const [form, setForm] = useState({ nombre: '', pin: '', rol: 'camarero', activo: true, seccion_id: '' })
  const [showPins, setShowPins] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/camareros', { headers: sh() })
    const d = await r.json()
    setCamareros(d.camareros || [])
    const rs = await fetch('/api/owner/secciones', { headers: sh() })
    if (rs.ok) { const ds = await rs.json(); setSecciones(ds.secciones || []) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ nombre: '', pin: '', rol: 'camarero', activo: true, seccion_id: '' }); setErr(''); setModal('create') }
  const openEdit = (c: Camarero) => { setForm({ nombre: c.nombre, pin: c.pin, rol: c.rol, activo: c.activo, seccion_id: c.seccion_id || '' }); setErr(''); setModal({ edit: c }) }
  const openDel = (c: Camarero) => { setModal({ del: c }) }

  const save = async () => {
    setErr('')
    if (!form.nombre.trim()) return setErr('Nombre requerido')
    if (!/^\d{4}$/.test(form.pin)) return setErr('PIN debe ser 4 dígitos')

    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const url = '/api/owner/camareros'
    const bodyData = { ...form, seccion_id: form.rol === 'cocina' && form.seccion_id ? form.seccion_id : null }
    const body = isEdit
      ? { id: (modal as { edit: Camarero }).edit.id, ...bodyData }
      : bodyData

    const r = await fetch(url, { method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/camareros', { method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: (modal as { del: Camarero }).del.id }) })
    await load(); setModal(null)
  }

  const toggleActivo = async (c: Camarero) => {
    await fetch('/api/owner/camareros', { method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: c.id, activo: !c.activo }) })
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Personal</div>
          <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Camareros</div>
        </div>
        <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={15}/>Añadir</Btn>
      </div>

      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 100px',
          padding: '10px 20px', borderBottom: `1px solid ${C.rule}`,
          fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
          <span>Nombre</span><span>Rol</span><span>Sección</span><span>PIN</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>

        {camareros.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: C.ink4, fontFamily: SN, fontSize: 14 }}>
            No hay camareros aún.
          </div>
        )}

        {camareros.map((c, i) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px 80px 100px',
            padding: '14px 20px', alignItems: 'center',
            borderBottom: i < camareros.length - 1 ? `1px solid ${C.rule}` : 'none',
            background: !c.activo ? C.paper : 'transparent' }}>
            <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: c.activo ? C.ink : C.ink4 }}>{c.nombre}</span>
            <span><Badge color={c.rol === 'admin' ? C.redS : c.rol === 'cocina' ? C.paper2 : C.paper2}>{ROL_LABEL[c.rol] || c.rol}</Badge></span>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{c.seccion_id ? secciones.find(s => s.id === c.seccion_id)?.nombre || c.seccion_id : '—'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: SM, fontSize: 13, color: C.ink2 }}>
                {showPins[c.id] ? c.pin : '••••'}
              </span>
              <button onClick={() => setShowPins(p => ({ ...p, [c.id]: !p[c.id] }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink4, display: 'flex', padding: 2 }}>
                <Icon d={showPins[c.id] ? ICONS.eyeOff : ICONS.eye} size={13}/>
              </button>
            </span>
            <span>
              <button onClick={() => toggleActivo(c)}
                style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                  background: c.activo ? C.greenS : C.paper2, color: c.activo ? C.green : C.ink3,
                  border: `1px solid ${c.activo ? '#A8C9AB' : C.rule}`, borderRadius: 999,
                  padding: '3px 8px', cursor: 'pointer' }}>
                {c.activo ? 'ACTIVO' : 'BAJA'}
              </button>
            </span>
            <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <Btn size="sm" variant="ghost" onClick={() => openEdit(c)}><Icon d={ICONS.edit} size={13}/></Btn>
              <Btn size="sm" variant="danger" onClick={() => openDel(c)}><Icon d={ICONS.trash} size={13}/></Btn>
            </span>
          </div>
        ))}
      </div>

      {/* Create / Edit modal */}
      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal === 'create' ? 'Nuevo camarero' : 'Editar camarero'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Marta"/>
            <Field label="PIN (4 dígitos)" value={form.pin} onChange={v => setForm(f => ({ ...f, pin: v }))} placeholder="1234" type="text" error={err.includes('PIN') ? err : undefined}/>
            <Select label="Rol" value={form.rol} onChange={v => setForm(f => ({ ...f, rol: v, seccion_id: '' }))}
              options={[{ value: 'camarero', label: 'Camarero' }, { value: 'admin', label: 'Admin' }, { value: 'cocina', label: 'Cocina' }]}/>
            {form.rol === 'cocina' && (
              <Select label="Sección" value={form.seccion_id} onChange={v => setForm(f => ({ ...f, seccion_id: v }))}
                options={[{ value: '', label: 'Todas las secciones' }, ...secciones.map(s => ({ value: s.id, label: s.nombre }))]}/>
            )}
            {err && !err.includes('PIN') && <div style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={save}>
                <Icon d={ICONS.check} size={14}/>{modal === 'create' ? 'Crear' : 'Guardar'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete modal */}
      {modal && typeof modal === 'object' && 'del' in modal && (
        <Modal title="Borrar camarero" onClose={() => setModal(null)}>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.ink2, marginTop: 0, lineHeight: 1.5 }}>
            ¿Borrar a <strong>{(modal as { del: Camarero }).del.nombre}</strong>? Esta acción no se puede deshacer.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={del}><Icon d={ICONS.trash} size={14}/>Borrar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── Tab: Mesas ─── */
type Zona = { id: string; nombre: string; tipo: string; prefijo: string; descripcion?: string; orden: number; activa: boolean }

function MesasTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [zonas, setZonas] = useState<Zona[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | 'zona-create' | { edit: Mesa } | { del: Mesa } | { editZona: Zona }>(null)
  const [form, setForm] = useState({ codigo: '', nombre: '', zona: '', capacidad: '4' })
  const [zonaForm, setZonaForm] = useState({ nombre: '', prefijo: '', descripcion: '' })
  const [err, setErr] = useState('')

  const loadZonas = useCallback(async () => {
    const r = await fetch('/api/owner/zonas', { headers: sh() })
    const d = await r.json()
    const zs: Zona[] = Array.isArray(d) ? d : []
    setZonas(zs)
    return zs
  }, [])

  const load = useCallback(async () => {
    const [r, zs] = await Promise.all([
      fetch('/api/owner/mesas', { headers: sh() }),
      loadZonas(),
    ])
    const d = await r.json()
    setMesas(d.mesas || [])
    // Set default zona for form
    if (zs.length > 0) setForm(f => ({ ...f, zona: zs[0].tipo }))
    setLoading(false)
  }, [loadZonas])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ codigo: '', nombre: '', zona: zonas[0]?.tipo || 'salon', capacidad: '4' })
    setErr(''); setModal('create')
  }
  const openEdit = (m: Mesa) => { setForm({ codigo: m.codigo, nombre: m.nombre ?? '', zona: m.zona, capacidad: String(m.capacidad) }); setErr(''); setModal({ edit: m }) }
  const openDel = (m: Mesa) => setModal({ del: m })

  const save = async () => {
    setErr('')
    if (!form.codigo.trim()) return setErr('Código requerido')
    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const body = isEdit
      ? { id: (modal as { edit: Mesa }).edit.id, ...form, nombre: form.nombre.trim() || null, capacidad: parseInt(form.capacidad) || 4 }
      : { ...form, nombre: form.nombre.trim() || null, capacidad: parseInt(form.capacidad) || 4 }

    const r = await fetch('/api/owner/mesas', { method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/mesas', { method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: (modal as { del: Mesa }).del.id }) })
    await load(); setModal(null)
  }

  const saveZona = async () => {
    setErr('')
    if (!zonaForm.nombre.trim() || !zonaForm.prefijo.trim()) return setErr('Nombre y prefijo requeridos')
    const isEdit = modal && typeof modal === 'object' && 'editZona' in modal
    const body = isEdit
      ? { id: (modal as { editZona: Zona }).editZona.id, ...zonaForm }
      : zonaForm
    const r = await fetch('/api/owner/zonas', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null); setZonaForm({ nombre: '', prefijo: '', descripcion: '' })
  }

  const delZona = async (z: Zona) => {
    if (!confirm(`Eliminar zona "${z.nombre}"?`)) return
    await fetch('/api/owner/zonas', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id: z.id }),
    })
    await load()
  }

  const byZona = (tipo: string) => mesas.filter(m => m.zona === tipo)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Espacio</div>
          <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Mesas</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => { setZonaForm({ nombre: '', prefijo: '', descripcion: '' }); setErr(''); setModal('zona-create') }}>
            <Icon d={ICONS.grid} size={14}/>Zonas
          </Btn>
          <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={15}/>Añadir mesa</Btn>
        </div>
      </div>

      {zonas.filter(z => z.activa).map(zona => {
        const ms = byZona(zona.tipo)
        if (ms.length === 0 && zonas.indexOf(zona) > 0) return null
        return (
          <div key={zona.id} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.red,
              textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: C.paper2, color: C.ink, fontFamily: SM, fontSize: 10, padding: '2px 6px', borderRadius: 3, border: `1px solid ${C.rule}` }}>{zona.prefijo}</span>
              {zona.nombre}
              <span style={{ color: C.ink4 }}>· {ms.length} mesas</span>
              <button onClick={() => { setZonaForm({ nombre: zona.nombre, prefijo: zona.prefijo, descripcion: zona.descripcion || '' }); setErr(''); setModal({ editZona: zona }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 4, opacity: 0.5 }}>
                <Icon d={ICONS.edit} size={11}/>
              </button>
              <button onClick={() => delZona(zona)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.4 }}>
                <Icon d={ICONS.trash} size={11}/>
              </button>
            </div>
            {ms.length === 0 ? (
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, padding: '12px 0' }}>Sin mesas en esta zona.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {ms.map(m => (
                  <div key={m.id} style={{ background: C.bone, border: `1px solid ${C.rule}`,
                    borderRadius: 8, padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: SM, fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-.01em' }}>{m.codigo}</div>
                      {m.nombre && <div style={{ fontFamily: "'Newsreader',serif", fontSize: 13, color: C.ink2, marginTop: 2, fontStyle: 'italic' }}>{m.nombre}</div>}
                      <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 4 }}>{m.capacidad} personas</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Btn size="sm" variant="ghost" onClick={() => openEdit(m)}><Icon d={ICONS.edit} size={13}/></Btn>
                      <Btn size="sm" variant="danger" onClick={() => openDel(m)}><Icon d={ICONS.trash} size={13}/></Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Modal nueva/editar zona */}
      {modal && (modal === 'zona-create' || (typeof modal === 'object' && 'editZona' in modal)) && (
        <Modal title={modal === 'zona-create' ? 'Nueva zona' : 'Editar zona'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nombre (ej. Terraza VIP)" value={zonaForm.nombre} onChange={v => setZonaForm(f => ({ ...f, nombre: v }))} placeholder="Terraza VIP"/>
            <Field label="Prefijo de mesa (1-2 letras, ej. V)" value={zonaForm.prefijo} onChange={v => setZonaForm(f => ({ ...f, prefijo: v.toUpperCase().slice(0,2) }))} placeholder="V"/>
            <Field label="Descripción (opcional)" value={zonaForm.descripcion} onChange={v => setZonaForm(f => ({ ...f, descripcion: v }))} placeholder="Zona exterior cubierta"/>
            <div style={{ background: C.paper2, borderRadius: 4, padding: '8px 12px', fontFamily: SM, fontSize: 11, color: C.ink3 }}>
              El prefijo define el código de mesa: prefijo <strong>{zonaForm.prefijo || 'V'}</strong> → mesas <strong>{zonaForm.prefijo || 'V'}01, {zonaForm.prefijo || 'V'}02…</strong>
            </div>
            {err && <div style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveZona}><Icon d={ICONS.check} size={14}/>{modal === 'zona-create' ? 'Crear' : 'Guardar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal === 'create' ? 'Nueva mesa' : 'Editar mesa'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Código (ej. T05, B02)" value={form.codigo} onChange={v => setForm(f => ({ ...f, codigo: v.toUpperCase() }))} placeholder="T05"/>
            <Field label="Nombre personalizado (opcional)" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder='ej. "La ventana", "Reserva VIP"'/>
            <Select label="Zona" value={form.zona} onChange={v => setForm(f => ({ ...f, zona: v }))}
              options={zonas.filter(z => z.activa).map(z => ({ value: z.tipo, label: `${z.nombre} (${z.prefijo})` }))}/>
            <Field label="Capacidad" value={form.capacidad} onChange={v => setForm(f => ({ ...f, capacidad: v }))} placeholder="4" type="number"/>
            {err && <div style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={save}><Icon d={ICONS.check} size={14}/>{modal === 'create' ? 'Crear' : 'Guardar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && typeof modal === 'object' && 'del' in modal && (
        <Modal title="Borrar mesa" onClose={() => setModal(null)}>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.ink2, marginTop: 0 }}>
            ¿Borrar la mesa <strong>{(modal as { del: Mesa }).del.codigo}</strong>?
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={del}><Icon d={ICONS.trash} size={14}/>Borrar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── Tab: Restaurante / Configuración ─── */
type RestauranteConfig = {
  id: string; nombre: string; slug: string
  nif: string | null; razon_social: string | null
  direccion: string | null; ciudad: string | null; telefono: string | null
  plan: string; activo: boolean
}
type HealthCheck = {
  ok: boolean
  checks: Record<string, boolean | string>
  missing: string[]
  hint: string
}

function RestauranteTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [rest, setRest] = useState<RestauranteConfig | null>(null)
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ nombre: '', nif: '', razon_social: '', direccion: '', ciudad: '', telefono: '' })

  useEffect(() => {
    Promise.all([
      fetch('/api/owner/restaurante', { headers: sh() }).then(r => r.json()),
      fetch('/api/health').then(r => r.json()),
    ]).then(([rd, hd]) => {
      if (rd.restaurante) {
        setRest(rd.restaurante)
        setForm({
          nombre:       rd.restaurante.nombre       ?? '',
          nif:          rd.restaurante.nif           ?? '',
          razon_social: rd.restaurante.razon_social  ?? '',
          direccion:    rd.restaurante.direccion     ?? '',
          ciudad:       rd.restaurante.ciudad        ?? '',
          telefono:     rd.restaurante.telefono      ?? '',
        })
      }
      setHealth(hd)
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true); setMsg('')
    const r = await fetch('/api/owner/restaurante', {
      method: 'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    if (r.ok) { setRest(d.restaurante); setMsg('Guardado correctamente.') }
    else { setMsg(d.error ?? 'Error al guardar') }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const inp = (label: string, key: keyof typeof form, placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: C.ink3, textTransform: 'uppercase' }}>{label}</label>
      <input
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{ fontFamily: SN, fontSize: 14, border: `1px solid ${C.rule}`, borderRadius: 4,
          padding: '8px 10px', background: C.bone, color: C.ink, outline: 'none' }}
      />
    </div>
  )

  if (loading) return <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, padding: 24 }}>Cargando...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Datos del restaurante */}
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, background: C.bone }}>
        <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase', marginBottom: 18 }}>
          DATOS DEL RESTAURANTE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {inp('Nombre comercial', 'nombre', 'Restaurante El Ejemplo')}
          {inp('Teléfono', 'telefono', '+34 91 000 00 00')}
          {inp('Dirección', 'direccion', 'Calle Mayor 1, Madrid')}
          {inp('Ciudad', 'ciudad', 'Madrid')}
        </div>
      </div>

      {/* Datos fiscales Verifactu */}
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, background: C.bone }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
            DATOS FISCALES · VERIFACTU
          </div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.red, letterSpacing: '.06em' }}>RD 1007/2023</div>
        </div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 16, lineHeight: 1.5 }}>
          Estos datos aparecen en el encabezado de las facturas simplificadas y en el hash SHA-256 Verifactu.
          Sin NIF configurado, las facturas usan el NIF demo (B00000000).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {inp('NIF / CIF', 'nif', 'B12345678')}
          {inp('Razón social', 'razon_social', 'Mi Restaurante SL')}
        </div>
        {rest?.nif && (
          <div style={{ marginTop: 12, background: C.greenS, border: `1px solid #B8D4BA`, borderRadius: 4, padding: '8px 12px', fontFamily: SM, fontSize: 11, color: C.green }}>
            NIF configurado: {rest.nif} · {rest.razon_social}
          </div>
        )}
        {!rest?.nif && (
          <div style={{ marginTop: 12, background: C.amberS, border: `1px solid #E8A33B44`, borderRadius: 4, padding: '8px 12px', fontFamily: SM, fontSize: 11, color: '#7A5A1A' }}>
            Sin NIF — las facturas Verifactu usaran B00000000 hasta que configures uno.
          </div>
        )}
      </div>

      {/* Botón guardar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Btn variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Btn>
        {msg && (
          <span style={{ fontFamily: SM, fontSize: 12, color: msg.includes('Error') ? C.red : C.green }}>
            {msg}
          </span>
        )}
      </div>

      {/* Panel diagnóstico env vars */}
      {health && (
        <div style={{ border: `1px solid ${health.ok ? C.rule : '#E8A33B'}`, borderRadius: 8, padding: 20, background: health.ok ? C.bone : C.amberS }}>
          <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase', marginBottom: 14 }}>
            DIAGNOSTICO · ENV VARS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {Object.entries(health.checks).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: val === true ? C.green : val === false ? C.red : C.amber, flexShrink: 0 }}/>
                <span style={{ fontFamily: SM, fontSize: 11, color: C.ink2 }}>{key}</span>
                {typeof val === 'string' && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>{val}</span>}
              </div>
            ))}
          </div>
          {health.missing.length > 0 && (
            <div style={{ marginTop: 14, fontFamily: SM, fontSize: 11, color: '#7A5A1A', lineHeight: 1.6 }}>
              {health.hint}
            </div>
          )}
          {health.ok && (
            <div style={{ marginTop: 8, fontFamily: SM, fontSize: 11, color: C.green }}>Todas las variables de entorno configuradas.</div>
          )}
        </div>
      )}

      {/* Info del plan */}
      {rest && (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 16, background: C.paper2, display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase' }}>PLAN</div>
            <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{rest.plan}</div>
          </div>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase' }}>SLUG</div>
            <div style={{ fontFamily: SM, fontSize: 12, color: C.ink2 }}>{rest.slug}</div>
          </div>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase' }}>ESTADO</div>
            <Badge color={rest.activo ? C.greenS : C.redS}>{rest.activo ? 'ACTIVO' : 'PAUSADO'}</Badge>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Turno ─── */
function TurnoTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [activo, setActivo] = useState<Turno | null>(null)
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [acting, setActing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/turno', { headers: sh() })
    const d = await r.json()
    setActivo(d.activo)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrir = async () => {
    setActing(true)
    const r = await fetch('/api/owner/turno', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ nombre }) })
    if (r.ok) { setNombre(''); await load() }
    setActing(false)
  }

  const cerrar = async () => {
    setActing(true)
    await fetch('/api/owner/turno', { method: 'DELETE', headers: sh() })
    setConfirmClose(false)
    await load()
    setActing(false)
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  const duracion = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 60) return `${m} min`
    return `${Math.floor(m / 60)}h ${m % 60}min`
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Operaciones</div>
        <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Gestión de turno</div>
      </div>

      {/* Estado actual */}
      <div style={{ background: activo ? C.greenS : C.paper2, border: `1px solid ${activo ? '#A8C9AB' : C.rule}`,
        borderRadius: 8, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: activo ? C.green : C.ink4 }}/>
          <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.12em',
            color: activo ? C.green : C.ink4, textTransform: 'uppercase' }}>
            {activo ? 'Turno activo' : 'Sin turno activo'}
          </div>
        </div>

        {activo && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: SE, fontSize: 26, fontWeight: 500, color: C.ink }}>{activo.nombre}</div>
            <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, marginTop: 4 }}>
              Abierto a las {fmt(activo.created_at)} · {duracion(activo.created_at)} en curso
            </div>
          </div>
        )}
      </div>

      {/* Abrir turno */}
      {!activo && (
        <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Abrir nuevo turno</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder={`Turno ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`}
              onKeyDown={e => e.key === 'Enter' && abrir()}
              style={{ flex: 1, fontFamily: SN, fontSize: 14, background: C.paper, border: `1px solid ${C.rule}`,
                borderRadius: 4, padding: '8px 12px', color: C.ink, outline: 'none' }}
            />
            <Btn variant="primary" onClick={abrir} disabled={acting}>
              <Icon d={ICONS.play} size={14}/>Abrir
            </Btn>
          </div>
        </div>
      )}

      {/* Cerrar turno */}
      {activo && !confirmClose && (
        <Btn variant="danger" onClick={() => setConfirmClose(true)}>
          <Icon d={ICONS.stop} size={14}/>Cerrar turno
        </Btn>
      )}

      {confirmClose && (
        <div style={{ background: C.redS, border: `1px solid #E8B4AD`, borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.redD, marginBottom: 12 }}>
            Cerrar &ldquo;{activo?.nombre}&rdquo;
          </div>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.redD, margin: '0 0 16px', lineHeight: 1.5 }}>
            El turno quedará cerrado. Los camareros no podrán enviar comandas hasta que abras uno nuevo.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmClose(false)}>Cancelar</Btn>
            <Btn variant="danger" onClick={cerrar} disabled={acting}>
              <Icon d={ICONS.stop} size={14}/>Confirmar cierre
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Resumen ─── */
function ResumenTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [data, setData] = useState<{ ultimo: Turno | null; stats: TurnoStats | null }>({ ultimo: null, stats: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/owner/turno', { headers: sh() }).then(r => r.json()).then(d => {
      setData({ ultimo: d.ultimo || null, stats: d.stats || null })
      setLoading(false)
    })
  }, [])

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>

  if (!data.ultimo) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: C.ink4, fontFamily: SN, fontSize: 14 }}>
      No hay turnos cerrados todavía.
    </div>
  )

  const { ultimo, stats } = data

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Histórico</div>
        <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Último turno</div>
      </div>

      {/* Turno card */}
      <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink }}>{ultimo.nombre}</div>
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, marginTop: 6, letterSpacing: '.04em' }}>
          {fmt(ultimo.created_at)} · {fmtHour(ultimo.created_at)}
        </div>
        <div style={{ marginTop: 10 }}>
          <Badge color={C.paper2}>CERRADO</Badge>
        </div>
      </div>

      {stats ? (
        <>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { val: stats.total_comandas, label: 'Comandas totales', sub: 'en este turno' },
              { val: stats.avg_latencia_ms ? `${stats.avg_latencia_ms}ms` : '—', label: 'Latencia media', sub: 'voz → ticket' },
              { val: stats.mesas_activas.length, label: 'Mesas servidas', sub: 'con actividad' },
            ].map(s => (
              <div key={s.label} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ fontFamily: SE, fontSize: 36, fontWeight: 500, color: C.ink, letterSpacing: '-.02em', lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink2, marginTop: 6 }}>{s.label}</div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Mesas activas */}
          {stats.mesas_activas.length > 0 && (
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.rule}`,
                fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
                Mesas más activas
              </div>
              {stats.mesas_activas.map((m, i) => (
                <div key={m.codigo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 20px', borderBottom: i < stats.mesas_activas.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, width: 18 }}>#{i + 1}</div>
                    <div style={{ fontFamily: SM, fontSize: 16, fontWeight: 700, color: C.ink }}>{m.codigo}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: Math.max(4, (m.count / (stats.mesas_activas[0]?.count || 1)) * 120),
                      height: 4, background: C.red, borderRadius: 999, transition: 'width .3s' }}/>
                    <div style={{ fontFamily: SM, fontSize: 13, color: C.ink2, minWidth: 32, textAlign: 'right' }}>
                      {m.count}
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>comandas</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ color: C.ink4, fontFamily: SN, fontSize: 13, padding: '16px 0' }}>
          Sin datos de actividad en este turno.
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Carta ─── */
type Producto = { id: string; nombre: string; descripcion: string | null; precio: number | null; categoria: string; seccion: string; nombre_alternativo: string[]; activo: boolean; orden: number }
type ProductoDraft = Omit<Producto, 'id' | 'orden' | 'activo'> & { _key: string }
type ProdFormato = { id: string; nombre: string; precio: number; activo: boolean; orden: number }

type CartaView = 'lista' | 'escanear'

const NOMBRES_FORMATO = ['tapa', 'media', 'ración', 'entera', 'pequeña', 'grande', 'unidad']

function FormatsEditor({ productoId, sh }: { productoId: string; sh: () => Record<string, string> }) {
  const [formatos, setFormatos] = useState<ProdFormato[]>([])
  const [nuevo, setNuevo] = useState({ nombre: 'tapa', precio: '' })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await fetch(`/api/owner/formatos?producto_id=${productoId}`, { headers: sh() })
    const d = await r.json()
    setFormatos(d.formatos || [])
    setLoading(false)
  }, [productoId, sh])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!nuevo.nombre || !nuevo.precio) return
    await fetch('/api/owner/formatos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ producto_id: productoId, nombre: nuevo.nombre, precio: parseFloat(nuevo.precio), orden: formatos.length }),
    })
    setNuevo({ nombre: 'tapa', precio: '' })
    await load()
  }

  const del = async (id: string) => {
    await fetch('/api/owner/formatos', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id }) })
    await load()
  }

  const toggle = async (f: ProdFormato) => {
    await fetch('/api/owner/formatos', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: f.id, activo: !f.activo }) })
    await load()
  }

  return (
    <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 16, marginTop: 4 }}>
      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.ink3, textTransform: 'uppercase', marginBottom: 12 }}>
        Formatos
      </div>
      {loading ? (
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>Cargando...</div>
      ) : (
        <>
          {formatos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {formatos.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: f.activo ? C.bone : C.paper, border: `1px solid ${C.rule}`, borderRadius: 4, opacity: f.activo ? 1 : 0.55 }}>
                  <span style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.ink, flex: 1 }}>{f.nombre}</span>
                  <span style={{ fontFamily: SM, fontSize: 13, color: C.red, fontWeight: 700 }}>{f.precio.toFixed(2)} €</span>
                  <button onClick={() => toggle(f)} style={{ background: 'none', border: `1px solid ${C.rule}`, borderRadius: 3, padding: '2px 6px', fontFamily: SM, fontSize: 9, letterSpacing: '.08em', color: C.ink3, cursor: 'pointer' }}>
                    {f.activo ? 'OCULTAR' : 'ACTIVAR'}
                  </button>
                  <button onClick={() => del(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, padding: '2px 4px', lineHeight: 1 }}>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add new format row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4, letterSpacing: '.06em' }}>NOMBRE</div>
              <select
                value={nuevo.nombre}
                onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))}
                style={{ width: '100%', padding: '7px 8px', fontFamily: SN, fontSize: 13, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4, color: C.ink, outline: 'none' }}
              >
                {NOMBRES_FORMATO.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ width: 90 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4, letterSpacing: '.06em' }}>PRECIO €</div>
              <input
                value={nuevo.precio}
                onChange={e => setNuevo(n => ({ ...n, precio: e.target.value }))}
                placeholder="5.50"
                type="number"
                step="0.5"
                style={{ width: '100%', padding: '7px 8px', fontFamily: SN, fontSize: 13, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <Btn variant="primary" onClick={add}><Icon d={ICONS.plus} size={13}/>Añadir</Btn>
          </div>
          {formatos.length === 0 && (
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 10, lineHeight: 1.4 }}>
              Sin formatos. El producto tiene precio único. Añade formatos si se vende en varios tamaños (tapa / media / ración).
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CartaTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [view, setView] = useState<CartaView>('lista')
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Producto } | { del: Producto }>(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', precio: '', seccion: 'entrantes', nombre_alternativo: '' })
  const [err, setErr] = useState('')

  // Scanner state
  const [images, setImages] = useState<{ data: string; mediaType: string; preview: string }[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ProductoDraft[] | null>(null)
  const [extractErr, setExtractErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const SECCIONES = ['entrantes', 'principales', 'postres', 'bebidas', 'cafes', 'copas', 'otras']

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/carta', { headers: sh() })
    const d = await r.json()
    setProductos(d.productos || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── CRUD ──
  const openCreate = () => { setForm({ nombre: '', descripcion: '', precio: '', seccion: 'entrantes', nombre_alternativo: '' }); setErr(''); setModal('create') }
  const openEdit = (p: Producto) => {
    setForm({
      nombre: p.nombre, descripcion: p.descripcion || '',
      precio: p.precio != null ? String(p.precio) : '',
      seccion: p.seccion || 'otras',
      nombre_alternativo: (p.nombre_alternativo || []).join(', '),
    })
    setErr(''); setModal({ edit: p })
  }
  const openDel = (p: Producto) => setModal({ del: p })

  const save = async () => {
    setErr('')
    if (!form.nombre.trim()) return setErr('Nombre requerido')
    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const aliases = form.nombre_alternativo.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const body = {
      ...(isEdit ? { id: (modal as { edit: Producto }).edit.id } : {}),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      precio: form.precio !== '' ? parseFloat(form.precio) : null,
      seccion: form.seccion,
      categoria: form.seccion, // keep categoria in sync for compat
      nombre_alternativo: aliases,
    }
    const r = await fetch('/api/owner/carta', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/carta', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: (modal as { del: Producto }).del.id }) })
    await load(); setModal(null)
  }

  const toggleActivo = async (p: Producto) => {
    await fetch('/api/owner/carta', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: p.id, activo: !p.activo }) })
    await load()
  }

  // ── Scanner ──
  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    const newImgs: typeof images = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const base64 = await new Promise<string>((res) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.readAsDataURL(file)
      })
      const preview = URL.createObjectURL(file)
      newImgs.push({ data: base64, mediaType: file.type as string, preview })
    }
    setImages(prev => [...prev, ...newImgs].slice(0, 10))
  }

  const extract = async () => {
    setExtractErr(''); setExtracting(true); setExtracted(null)
    try {
      const r = await fetch('/api/owner/carta?action=extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ images: images.map(i => ({ data: i.data, mediaType: i.mediaType })) }),
      })
      let d: Record<string, unknown> = {}
      try { d = await r.json() } catch { d = { error: `Error del servidor (${r.status})` } }
      if (!r.ok) { setExtractErr((d.error as string) || `Error ${r.status}`); return }
      setExtracted((d.productos as Omit<ProductoDraft, '_key'>[] || []).map((p, i) => ({ ...p, _key: String(i) })))
    } catch (e: unknown) {
      setExtractErr((e as Error).message || 'Error de red')
    } finally {
      setExtracting(false)
    }
  }

  const confirmExtracted = async () => {
    if (!extracted) return
    const r = await fetch('/api/owner/carta?action=bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ productos: extracted }),
    })
    if (r.ok) {
      setExtracted(null); setImages([]); setView('lista'); await load()
    }
  }

  const updateDraft = (key: string, field: keyof ProductoDraft, value: string | number | null) => {
    setExtracted(prev => prev ? prev.map(p => p._key === key ? { ...p, [field]: value } : p) : null)
  }
  const removeDraft = (key: string) => {
    setExtracted(prev => prev ? prev.filter(p => p._key !== key) : null)
  }

  // ── Group by category ──
  const byCategoria = productos.reduce<Record<string, Producto[]>>((acc, p) => {
    if (!acc[p.seccion || p.categoria]) acc[p.seccion || p.categoria] = []
    acc[p.seccion || p.categoria].push(p)
    return acc
  }, {})

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Carta</div>
          <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>
            {productos.length} producto{productos.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => { setView(view === 'escanear' ? 'lista' : 'escanear'); setExtracted(null); setImages([]) }}
            variant={view === 'escanear' ? 'primary' : 'default'}>
            <Icon d={ICONS.sparkle} size={14}/>Escanear carta
          </Btn>
          <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={15}/>Añadir</Btn>
        </div>
      </div>

      {/* ── SCANNER VIEW ── */}
      {view === 'escanear' && (
        <div style={{ marginBottom: 32 }}>
          {/* Step 1: Upload */}
          {!extracted && (
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, marginBottom: 16 }}>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.red, textTransform: 'uppercase', marginBottom: 12 }}>
                01 · Sube las fotos de la carta
              </div>
              <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: '0 0 16px', lineHeight: 1.5 }}>
                Puedes subir varias páginas a la vez. La IA extrae nombre, precio y categoría de cada plato.
              </p>

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
                style={{ border: `2px dashed ${C.rule}`, borderRadius: 8, padding: '32px 24px',
                  textAlign: 'center', cursor: 'pointer', background: C.paper,
                  transition: 'border-color .15s' }}>
                <Icon d={ICONS.upload} size={28}/>
                <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink, marginTop: 10 }}>
                  Arrastra las fotos aquí o haz clic
                </div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 4 }}>
                  JPG, PNG, WEBP · máx. 10 páginas
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
              </div>

              {/* Thumbnails */}
              {images.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={img.preview} alt={`Página ${i + 1}`}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.rule}` }} />
                      <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          background: C.red, color: C.paper, border: 'none', borderRadius: 999,
                          cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {images.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Btn variant="primary" onClick={extract} disabled={extracting}>
                    <Icon d={ICONS.sparkle} size={14}/>
                    {extracting ? 'Analizando carta...' : `Extraer con IA (${images.length} página${images.length > 1 ? 's' : ''})`}
                  </Btn>
                  {extracting && (
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 8 }}>
                      BRAIN · procesando imágenes · puede tardar 10-20s...
                    </div>
                  )}
                  {extractErr && <div style={{ fontFamily: SM, fontSize: 11, color: C.red, marginTop: 8 }}>{extractErr}</div>}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review & confirm */}
          {extracted && (
            <div>
              <div style={{ background: C.amberS, border: `1px solid ${C.amber}`, borderRadius: 8, padding: '14px 20px', marginBottom: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.amber, textTransform: 'uppercase' }}>
                    02 · Revisa y confirma
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, marginTop: 2 }}>
                    {extracted.length} productos extraídos. Edita lo que necesites antes de guardar.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" onClick={() => { setExtracted(null); setImages([]) }}>Volver a subir</Btn>
                  <Btn variant="primary" onClick={confirmExtracted}>
                    <Icon d={ICONS.check} size={14}/>Guardar {extracted.length} productos
                  </Btn>
                </div>
              </div>

              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 120px 40px',
                  padding: '10px 16px', borderBottom: `1px solid ${C.rule}`,
                  fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
                  <span>Nombre</span><span>Categoría</span><span>Precio</span><span>Descripción</span><span/>
                </div>
                {extracted.map((p) => (
                  <div key={p._key} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 120px 40px',
                    padding: '8px 16px', gap: 8, alignItems: 'center',
                    borderBottom: `1px solid ${C.rule}` }}>
                    <input value={p.nombre} onChange={e => updateDraft(p._key, 'nombre', e.target.value)}
                      style={{ fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`,
                        borderRadius: 4, padding: '5px 8px', color: C.ink, outline: 'none', width: '100%' }} />
                    <select value={p.seccion || p.categoria} onChange={e => updateDraft(p._key, 'seccion', e.target.value)}
                      style={{ fontFamily: SN, fontSize: 12, background: C.paper, border: `1px solid ${C.rule}`,
                        borderRadius: 4, padding: '5px 8px', color: C.ink, outline: 'none', width: '100%' }}>
                      {SECCIONES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <input value={p.precio != null ? String(p.precio) : ''} onChange={e => updateDraft(p._key, 'precio', e.target.value === '' ? null : parseFloat(e.target.value))}
                      placeholder="—" type="number" step="0.01"
                      style={{ fontFamily: SM, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`,
                        borderRadius: 4, padding: '5px 8px', color: C.ink, outline: 'none', width: '100%' }} />
                    <input value={p.descripcion || ''} onChange={e => updateDraft(p._key, 'descripcion', e.target.value || null)}
                      placeholder="—"
                      style={{ fontFamily: SN, fontSize: 12, background: C.paper, border: `1px solid ${C.rule}`,
                        borderRadius: 4, padding: '5px 8px', color: C.ink3, outline: 'none', width: '100%' }} />
                    <button onClick={() => removeDraft(p._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink4, display: 'flex', padding: 4 }}>
                      <Icon d={ICONS.x} size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LISTA VIEW ── */}
      {view === 'lista' && (
        <>
          {productos.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: SE, fontSize: 22, color: C.ink3, marginBottom: 8 }}>Carta vacía</div>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, marginBottom: 20 }}>
                Añade productos manualmente o escanea la carta con IA.
              </div>
              <Btn onClick={() => setView('escanear')}><Icon d={ICONS.sparkle} size={14}/>Escanear carta</Btn>
            </div>
          ) : (
            Object.entries(byCategoria).map(([cat, ps]) => (
              <div key={cat} style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em',
                  color: C.red, textTransform: 'uppercase', marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 8 }}>
                  {cat}
                  <span style={{ color: C.ink4 }}>· {ps.length}</span>
                </div>
                <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone }}>
                  {ps.map((p, i) => (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 110px',
                      padding: '12px 16px', alignItems: 'center', gap: 8,
                      borderBottom: i < ps.length - 1 ? `1px solid ${C.rule}` : 'none',
                      background: !p.activo ? C.paper : 'transparent' }}>
                      <div>
                        <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: p.activo ? C.ink : C.ink4 }}>{p.nombre}</div>
                        {p.descripcion && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 2 }}>{p.descripcion}</div>}
                      </div>
                      <div style={{ fontFamily: SM, fontSize: 14, fontWeight: 700, color: C.ink2, textAlign: 'right' }}>
                        {p.precio != null ? `${p.precio.toFixed(2)} €` : '—'}
                      </div>
                      <div>
                        <button onClick={() => toggleActivo(p)}
                          style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                            background: p.activo ? C.greenS : C.paper2, color: p.activo ? C.green : C.ink3,
                            border: `1px solid ${p.activo ? '#A8C9AB' : C.rule}`, borderRadius: 999,
                            padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {p.activo ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Btn size="sm" variant="ghost" onClick={() => openEdit(p)}><Icon d={ICONS.edit} size={13}/></Btn>
                        <Btn size="sm" variant="danger" onClick={() => openDel(p)}><Icon d={ICONS.trash} size={13}/></Btn>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Create / Edit modal */}
      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal === 'create' ? 'Nuevo producto' : 'Editar producto'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Croquetas de jamón"/>
            <Field label="Precio (€)" value={form.precio} onChange={v => setForm(f => ({ ...f, precio: v }))} placeholder="8.50" type="number"/>
            <Select label="Sección" value={form.seccion} onChange={v => setForm(f => ({ ...f, seccion: v }))}
              options={SECCIONES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}/>
            <Field label="Aliases (separados por coma)" value={form.nombre_alternativo} onChange={v => setForm(f => ({ ...f, nombre_alternativo: v }))} placeholder="bravas, una de bravas, patatas"/>
            <Field label="Descripción (opcional)" value={form.descripcion} onChange={v => setForm(f => ({ ...f, descripcion: v }))} placeholder="Caseras, con bechamel de la abuela"/>
            {modal !== 'create' && typeof modal === 'object' && 'edit' in modal && (
              <FormatsEditor productoId={(modal as { edit: Producto }).edit.id} sh={sh} />
            )}
            {err && <div style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={save}><Icon d={ICONS.check} size={14}/>{modal === 'create' ? 'Crear' : 'Guardar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && typeof modal === 'object' && 'del' in modal && (
        <Modal title="Borrar producto" onClose={() => setModal(null)}>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.ink2, marginTop: 0 }}>
            ¿Borrar <strong>{(modal as { del: Producto }).del.nombre}</strong>?
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={del}><Icon d={ICONS.trash} size={14}/>Borrar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── Main Page ─── */
const SECCIONES_IMP = [
  { value: 'calientes', label: 'Cocina caliente', color: '#F4D8CF', text: '#A8311E' },
  { value: 'frios',     label: 'Cocina fría',     color: '#C9DDDD', text: '#0F6E56' },
  { value: 'barra',     label: 'Barra',           color: '#F7E3B6', text: '#854F0B' },
  { value: 'postres',   label: 'Postres',         color: '#E5DAC2', text: '#4B4036' },
]
const seccionStyle = (id: string) => SECCIONES_IMP.find(s => s.value === id) ?? SECCIONES_IMP[0]
const fmtPing = (ts: string | null) => {
  if (!ts) return 'Sin contacto'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 10) return 'Ahora'
  if (diff < 60) return `hace ${diff}s`
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
  return `hace ${Math.floor(diff / 3600)}h`
}


/* ─── helpers para ImpresorasTab ─── */
const CONN_TYPES = [
  { value: 'ip_local',      label: 'IP local (WiFi/LAN)' },
  { value: 'star_cloudprnt', label: 'Star CloudPRNT' },
  { value: 'epson_epos',    label: 'Epson ePOS' },
  { value: 'usb_bridge',    label: 'USB bridge' },
]

const JOB_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pendiente: { bg: '#F7E3B6', text: '#8A6200' },
  encolado:  { bg: '#F7E3B6', text: '#8A6200' },
  enviado:   { bg: '#D4E4D2', text: '#2D5930' },
  impreso:   { bg: '#D4E4D2', text: '#2D5930' },
  error:     { bg: '#F4D8CF', text: '#A8311E' },
}

function fmtAgo(ts: string | null): string {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

/* ─── Tab: Impresoras ─── */
function ImpresorasTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [impresoras, setImpresoras]     = useState<Impresora[]>([])
  const [jobs, setJobs]                 = useState<PrintJob[]>([])
  const [bridgeTokens, setBridgeTokens] = useState<BridgeToken[]>([])
  const [loading, setLoading]           = useState(true)
  const [editando, setEditando]         = useState<Impresora | null>(null)
  const [modal, setModal]               = useState<null | 'create' | 'bridge' | { del: Impresora }>(null)
  const [testing, setTesting]           = useState<string | null>(null)  // impresora_id en prueba
  const [form, setForm]                 = useState({
    nombre: '', seccion_id: 'calientes', connection_type: 'ip_local',
    ip_address: '', port: '9100', cloud_device_id: '', modelo: ''
  })
  const [err, setErr]   = useState('')
  const [saving, setSaving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAll = useCallback(async () => {
    const [rImp, rJobs, rBridge] = await Promise.all([
      fetch('/api/owner/impresoras', { headers: sh() }).then(r => r.json()),
      fetch('/api/owner/print-jobs', { headers: sh() }).then(r => r.json()).catch(() => ({ jobs: [] })),
      fetch('/api/owner/bridge-tokens', { headers: sh() }).then(r => r.json()).catch(() => ({ tokens: [] })),
    ])
    setImpresoras(rImp.impresoras || [])
    setJobs(rJobs.jobs || [])
    setBridgeTokens(rBridge.tokens || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    pollRef.current = setInterval(loadAll, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadAll])

  const toggleActiva = async (imp: Impresora) => {
    await fetch('/api/owner/impresoras', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id: imp.id, activa: !imp.activa })
    })
    await loadAll()
  }

  const saveEdit = async () => {
    if (!editando) return
    setSaving(true)
    await fetch('/api/owner/impresoras', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({
        id:             editando.id,
        nombre:         editando.nombre,
        seccion_id:     editando.seccion_id,
        connection_type: editando.connection_type,
        ip_address:     editando.ip_address,
        port:           editando.port,
        cloud_device_id: editando.cloud_device_id,
        modelo:         editando.modelo,
      })
    })
    setSaving(false)
    setEditando(null)
    await loadAll()
  }

  const saveNew = async () => {
    setErr('')
    if (!form.nombre.trim()) return setErr('Nombre requerido')
    if (form.connection_type === 'ip_local' && !form.ip_address.trim()) return setErr('IP requerida para ip_local')
    if (form.connection_type === 'star_cloudprnt' && !form.cloud_device_id.trim()) return setErr('Device ID requerido')
    setSaving(true)
    const r = await fetch('/api/owner/impresoras', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({
        nombre:          form.nombre,
        seccion_id:      form.seccion_id,
        cloud_device_id: form.cloud_device_id || null,
        modelo:          form.modelo || null,
        connection_type: form.connection_type,
        ip_address:      form.ip_address || null,
        port:            parseInt(form.port) || 9100,
      })
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) return setErr(d.error || 'Error')
    setModal(null)
    setForm({ nombre: '', seccion_id: 'calientes', connection_type: 'ip_local', ip_address: '', port: '9100', cloud_device_id: '', modelo: '' })
    await loadAll()
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/impresoras', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id: (modal as { del: Impresora }).del.id })
    })
    await loadAll()
    setModal(null)
  }

  const testPrint = async (id: string) => {
    setTesting(id)
    await fetch('/api/print', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ trigger: 'test', impresora_id: id })
    })
    setTimeout(() => setTesting(null), 2000)
    await loadAll()
  }

  const createBridgeToken = async () => {
    await fetch('/api/owner/bridge-tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ nombre: 'Bridge local' })
    })
    await loadAll()
  }

  const deleteBridgeToken = async (id: string) => {
    await fetch('/api/owner/bridge-tokens', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id })
    })
    await loadAll()
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>
  )

  const pendingJobs  = jobs.filter(j => ['pendiente','encolado'].includes(j.status)).length
  const errorJobs    = jobs.filter(j => j.status === 'error').length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>COURIER · Impresión</div>
          <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Impresoras</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
            {pendingJobs > 0 && (
              <div style={{ fontFamily: SM, fontSize: 11, color: C.amber, fontWeight: 700 }}>{pendingJobs} en cola</div>
            )}
            {errorJobs > 0 && (
              <div style={{ fontFamily: SM, fontSize: 11, color: C.red, fontWeight: 700 }}>{errorJobs} error{errorJobs !== 1 ? 'es' : ''}</div>
            )}
            {pendingJobs === 0 && errorJobs === 0 && jobs.length > 0 && (
              <div style={{ fontFamily: SM, fontSize: 11, color: C.green }}>Todo impreso</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => setModal('bridge')}><Icon d={ICONS.wifi} size={14}/>Bridge local</Btn>
          <Btn variant="primary" onClick={() => { setErr(''); setModal('create') }}>
            <Icon d={ICONS.plus} size={15}/>Añadir impresora
          </Btn>
        </div>
      </div>

      {/* Lista impresoras */}
      {impresoras.length === 0 ? (
        <div style={{ border: `1px dashed ${C.rule}`, borderRadius: 8, padding: '48px 24px', textAlign: 'center', color: C.ink4, fontFamily: SN, fontSize: 14, marginBottom: 32 }}>
          <div style={{ color: C.ink3, fontWeight: 600, marginBottom: 4 }}>Sin impresoras configuradas</div>
          <div style={{ fontSize: 13 }}>Añade la primera para empezar a imprimir tickets automáticamente</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone, marginBottom: 32 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 80px 120px', padding: '10px 20px', borderBottom: `1px solid ${C.rule}`, fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
            <span>Impresora</span><span>Sección</span><span>Conexión</span><span>Ping</span><span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {impresoras.map((imp, i) => {
            const sec     = seccionStyle(imp.seccion_id)
            const isOnline = imp.ultimo_ping && Date.now() - new Date(imp.ultimo_ping).getTime() < 35000
            const isTest   = testing === imp.id
            const connInfo = imp.connection_type === 'ip_local'
              ? (imp.ip_address ? `${imp.ip_address}:${imp.port ?? 9100}` : 'Sin IP')
              : imp.connection_type === 'star_cloudprnt'
              ? (imp.cloud_device_id ?? 'Sin Device ID')
              : imp.connection_type

            return (
              <div key={imp.id} style={{ borderBottom: i < impresoras.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                {editando?.id === imp.id ? (
                  /* ─ Fila en edición inline ─ */
                  <div style={{ padding: '16px 20px', background: C.paper2 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <Field label="Nombre" value={editando.nombre} onChange={v => setEditando(e => e ? {...e, nombre: v} : null)}/>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Tipo conexión</label>
                        <select value={editando.connection_type}
                          onChange={e => setEditando(ed => ed ? {...ed, connection_type: e.target.value} : null)}
                          style={{ fontFamily: SN, fontSize: 13, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none' }}>
                          {CONN_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Sección</label>
                        <select value={editando.seccion_id}
                          onChange={e => setEditando(ed => ed ? {...ed, seccion_id: e.target.value} : null)}
                          style={{ fontFamily: SN, fontSize: 13, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none' }}>
                          {SECCIONES_IMP.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {(editando.connection_type === 'ip_local' || editando.connection_type === 'usb_bridge') && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
                        <Field label="IP address" value={editando.ip_address ?? ''} onChange={v => setEditando(e => e ? {...e, ip_address: v} : null)} placeholder="192.168.1.50"/>
                        <Field label="Puerto" value={String(editando.port ?? 9100)} onChange={v => setEditando(e => e ? {...e, port: parseInt(v)||9100} : null)} placeholder="9100"/>
                      </div>
                    )}
                    {editando.connection_type === 'star_cloudprnt' && (
                      <div style={{ marginBottom: 12 }}>
                        <Field label="Device ID" value={editando.cloud_device_id ?? ''} onChange={v => setEditando(e => e ? {...e, cloud_device_id: v} : null)} placeholder="SL-T300-XXXXXXXX"/>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Btn variant="ghost" onClick={() => setEditando(null)}>Cancelar</Btn>
                      <Btn variant="primary" onClick={saveEdit} disabled={saving}><Icon d={ICONS.check} size={14}/>{saving ? 'Guardando...' : 'Guardar'}</Btn>
                    </div>
                  </div>
                ) : (
                  /* ─ Fila normal ─ */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 80px 120px', padding: '14px 20px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: imp.activa ? C.ink : C.ink4 }}>{imp.nombre}</div>
                      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, marginTop: 2, letterSpacing: '.04em' }}>{connInfo}</div>
                    </div>
                    <span>
                      <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', background: sec.color, color: sec.text, padding: '3px 8px', borderRadius: 3 }}>
                        {sec.label.toUpperCase()}
                      </span>
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                      {CONN_TYPES.find(ct => ct.value === imp.connection_type)?.label ?? imp.connection_type}
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 11, color: isOnline ? C.green : C.ink4, fontWeight: isOnline ? 700 : 400 }}>
                      {isOnline ? 'ONLINE' : fmtPing(imp.ultimo_ping)}
                    </span>
                    <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => testPrint(imp.id)}
                        disabled={!!isTest}
                        title="Test de impresión"
                        style={{ background: isTest ? C.greenS : C.paper2, color: isTest ? C.green : C.ink3, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '5px 8px', cursor: 'pointer', fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.06em' }}>
                        {isTest ? 'ENVIADO' : 'TEST'}
                      </button>
                      <Btn size="sm" onClick={() => setEditando({...imp})}><Icon d={ICONS.edit} size={13}/></Btn>
                      <Btn size="sm" variant="danger" onClick={() => setModal({ del: imp })}><Icon d={ICONS.trash} size={13}/></Btn>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Print Jobs recientes */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase', marginBottom: 12 }}>Últimos jobs · polling 5s</div>
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 60px 60px', padding: '10px 20px', borderBottom: `1px solid ${C.rule}`, fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
              <span>Impresora · Sección</span><span>Estado</span><span>Creado</span><span>Enviado</span><span>Intentos</span>
            </div>
            {jobs.slice(0, 12).map((job, i) => {
              const sc = JOB_STATUS_COLORS[job.status] ?? { bg: C.paper2, text: C.ink3 }
              return (
                <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 60px 60px', padding: '11px 20px', alignItems: 'center', borderBottom: i < Math.min(jobs.length, 12) - 1 ? `1px solid ${C.rule}` : 'none' }}>
                  <div>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 500 }}>
                      {job.impresoras?.nombre ?? '—'}
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, letterSpacing: '.04em' }}>{job.seccion_id}</div>
                    {job.error_msg && <div style={{ fontFamily: SM, fontSize: 10, color: C.red, marginTop: 2 }}>{job.error_msg}</div>}
                  </div>
                  <span>
                    <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', background: sc.bg, color: sc.text, padding: '3px 8px', borderRadius: 3 }}>
                      {job.status.toUpperCase()}
                    </span>
                  </span>
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{fmtAgo(job.created_at)}</span>
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{job.sent_at ? fmtAgo(job.sent_at) : '—'}</span>
                  <span style={{ fontFamily: SM, fontSize: 11, color: job.attempts > 1 ? C.amber : C.ink4 }}>{job.attempts}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal: nueva impresora */}
      {modal === 'create' && (
        <Modal title="Nueva impresora" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nombre" value={form.nombre} onChange={v => setForm(f => ({...f, nombre: v}))} placeholder="Cocina caliente 01"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Tipo conexión</label>
              <select value={form.connection_type} onChange={e => setForm(f => ({...f, connection_type: e.target.value}))}
                style={{ fontFamily: SN, fontSize: 13, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none' }}>
                {CONN_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
              </select>
            </div>
            <Select label="Sección" value={form.seccion_id} onChange={v => setForm(f => ({...f, seccion_id: v}))} options={SECCIONES_IMP.map(s => ({ value: s.value, label: s.label }))}/>
            {(form.connection_type === 'ip_local' || form.connection_type === 'usb_bridge') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                <Field label="IP address" value={form.ip_address} onChange={v => setForm(f => ({...f, ip_address: v}))} placeholder="192.168.1.50"/>
                <Field label="Puerto" value={form.port} onChange={v => setForm(f => ({...f, port: v}))} placeholder="9100"/>
              </div>
            )}
            {form.connection_type === 'star_cloudprnt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Device ID</label>
                <input value={form.cloud_device_id} onChange={e => setForm(f => ({...f, cloud_device_id: e.target.value}))} placeholder="SL-T300-XXXXXXXX"
                  style={{ fontFamily: SM, fontSize: 13, letterSpacing: '.06em', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}/>
              </div>
            )}
            <Field label="Modelo (opcional)" value={form.modelo} onChange={v => setForm(f => ({...f, modelo: v}))} placeholder="ESC/POS genérica · Star TSP143 · Epson TM-T20"/>
            {form.connection_type === 'ip_local' && (
              <div style={{ background: C.paper2, borderRadius: 6, padding: '10px 12px', fontFamily: SM, fontSize: 11, color: C.ink3, lineHeight: 1.5 }}>
                Necesitas el bridge local corriendo en la red del restaurante.<br/>
                Genera el token en <strong>Bridge local</strong> y arranca el script.
              </div>
            )}
            {err && <div style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveNew} disabled={saving}><Icon d={ICONS.check} size={14}/>{saving ? 'Guardando...' : 'Añadir'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: bridge local */}
      {modal === 'bridge' && (
        <Modal title="Bridge local · ip_local" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: SN, fontSize: 14, color: C.ink2, lineHeight: 1.6 }}>
              El bridge es un proceso Node.js que corre en la red del restaurante, hace polling cada 3s y manda ESC/POS directamente a la impresora por TCP (puerto 9100).
            </div>
            <div style={{ background: C.dark, borderRadius: 6, padding: '14px 16px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.darkFg3, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Instalación</div>
              {[
                'git clone https://github.com/albertosuarezgutierrez-gif/ia.rest.git',
                'cd ia.rest/scripts',
                'export IAREST_API=https://ia-rest.vercel.app',
                'export BRIDGE_TOKEN=<token de abajo>',
                'node bridge-local.js',
              ].map((cmd, idx) => (
                <div key={idx} style={{ fontFamily: SM, fontSize: 12, color: idx === 3 ? C.amber : '#C9BFAA', marginBottom: 4, letterSpacing: '.02em' }}>{cmd}</div>
              ))}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.ink3, textTransform: 'uppercase' }}>Tokens activos</div>
                <Btn size="sm" variant="primary" onClick={createBridgeToken}><Icon d={ICONS.plus} size={13}/>Nuevo token</Btn>
              </div>
              {bridgeTokens.length === 0 ? (
                <div style={{ border: `1px dashed ${C.rule}`, borderRadius: 6, padding: '20px 16px', textAlign: 'center', fontFamily: SN, fontSize: 13, color: C.ink4 }}>
                  Sin tokens. Crea uno para activar el bridge.
                </div>
              ) : (
                <div style={{ border: `1px solid ${C.rule}`, borderRadius: 6, overflow: 'hidden' }}>
                  {bridgeTokens.map((bt, idx) => {
                    const bridgeOnline = bt.ultimo_ping && Date.now() - new Date(bt.ultimo_ping).getTime() < 15000
                    return (
                      <div key={bt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: idx < bridgeTokens.length - 1 ? `1px solid ${C.rule}` : 'none', background: C.bone }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{bt.nombre}</div>
                          <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, letterSpacing: '.04em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bt.token}</div>
                        </div>
                        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: bridgeOnline ? C.green : C.ink4, whiteSpace: 'nowrap' }}>
                          {bridgeOnline ? 'ONLINE' : bt.ultimo_ping ? fmtAgo(bt.ultimo_ping) : 'NUNCA'}
                        </div>
                        <button
                          title="Copiar token"
                          onClick={() => navigator.clipboard.writeText(bt.token)}
                          style={{ background: C.paper2, color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontFamily: SM, fontSize: 10, fontWeight: 700 }}>
                          COPIAR
                        </button>
                        <Btn size="sm" variant="danger" onClick={() => deleteBridgeToken(bt.id)}><Icon d={ICONS.trash} size={13}/></Btn>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: eliminar */}
      {modal && typeof modal === 'object' && 'del' in modal && (
        <Modal title="Eliminar impresora" onClose={() => setModal(null)}>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.ink2, marginTop: 0, lineHeight: 1.5 }}>
            Eliminar <strong>{(modal as { del: Impresora }).del.nombre}</strong>. Los jobs en cola se perderán.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={del}><Icon d={ICONS.trash} size={14}/>Eliminar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
/* ─── Tab: Flujos de trabajo ─── */

type ReglaEnvio = {
  id: string
  zona_tipo: string | null
  seccion_id: string | null
  destino_tipo: 'impresora' | 'kds'
  destino_ref: string
  destino_nombre: string | null
  prioridad: number
  activa: boolean
}
type CatImp  = { id: string; nombre: string; seccion_id: string; connection_type: string }
type CatSec  = { id: string; nombre: string; color_kds: string; icono: string }
type CatZona = { id: string; tipo: string; nombre: string }

const DESTINO_ICON: Record<string, string> = { impresora: '🖨️', kds: '📺' }

function FlujoTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [reglas,     setReglas]     = useState<ReglaEnvio[]>([])
  const [impresoras, setImpresoras] = useState<CatImp[]>([])
  const [secciones,  setSecciones]  = useState<CatSec[]>([])
  const [zonas,      setZonas]      = useState<CatZona[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')
  const [form, setForm] = useState({
    zona_tipo:    '',
    seccion_id:   '',
    destino_tipo: 'impresora' as 'impresora' | 'kds',
    destino_ref:  '',
    prioridad:    '5',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/owner/reglas-envio', { headers: sh() })
    if (r.ok) {
      const d = await r.json()
      setReglas(d.reglas)
      setImpresoras(d.impresoras)
      setSecciones(d.secciones)
      setZonas(d.zonas)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = () => {
    setForm({ zona_tipo: '', seccion_id: '', destino_tipo: 'impresora', destino_ref: '', prioridad: '5' })
    setErr('')
    setModal(true)
  }

  const guardar = async () => {
    if (!form.destino_ref) return setErr('Selecciona un destino')
    setSaving(true)
    setErr('')
    // Calcular nombre caché del destino
    let destino_nombre = ''
    if (form.destino_tipo === 'impresora') {
      destino_nombre = impresoras.find(i => i.id === form.destino_ref)?.nombre ?? ''
    } else {
      destino_nombre = secciones.find(s => s.id === form.destino_ref)?.nombre ?? ''
    }
    const r = await fetch('/api/owner/reglas-envio', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zona_tipo:    form.zona_tipo    || null,
        seccion_id:   form.seccion_id   || null,
        destino_tipo: form.destino_tipo,
        destino_ref:  form.destino_ref,
        destino_nombre,
        prioridad:    parseInt(form.prioridad) || 5,
      }),
    })
    if (!r.ok) setErr('Error al guardar')
    else { setModal(false); load() }
    setSaving(false)
  }

  const toggleActiva = async (regla: ReglaEnvio) => {
    await fetch('/api/owner/reglas-envio', {
      method: 'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: regla.id, activa: !regla.activa }),
    })
    load()
  }

  const borrar = async (id: string) => {
    if (!confirm('¿Eliminar esta regla?')) return
    await fetch('/api/owner/reglas-envio', {
      method: 'DELETE',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  const zonaNombre = (tipo: string | null) =>
    tipo ? (zonas.find(z => z.tipo === tipo)?.nombre ?? tipo) : <span style={{ color: C.ink4, fontStyle: 'italic' }}>Todas las zonas</span>
  const seccionNombre = (id: string | null) =>
    id ? (secciones.find(s => s.id === id)?.nombre ?? id) : <span style={{ color: C.ink4, fontStyle: 'italic' }}>Todas las secciones</span>

  // Opciones de destino según tipo seleccionado
  const opcionesDestino = form.destino_tipo === 'impresora'
    ? impresoras.map(i => ({ value: i.id, label: `🖨️ ${i.nombre}` }))
    : secciones.map(s => ({ value: s.id, label: `📺 KDS · ${s.nombre}` }))

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: `1px solid ${C.rule}`, background: C.bone,
    fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none',
    boxSizing: 'border-box',
  }
  const labelSt: React.CSSProperties = { fontFamily: SN, fontSize: 12, color: C.ink3, fontWeight: 600, marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: '20px 0' }}>

      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: C.ink }}>Flujos de trabajo</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginTop: 4 }}>
            Define a dónde va cada comanda según la zona y el tipo de producto.
            Sin reglas, el sistema usa la configuración de impresoras estándar.
          </div>
        </div>
        <button onClick={openModal} style={{
          background: C.red, color: '#fff', border: 'none', borderRadius: 8,
          padding: '9px 16px', fontFamily: SN, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}>
          <Icon d={ICONS.plus} size={15}/> Nueva regla
        </button>
      </div>

      {/* Sin terminales configurados — aviso */}
      {!loading && impresoras.length === 0 && secciones.length === 0 && (
        <div style={{
          background: C.amberS, border: `1px solid ${C.amber}`, borderRadius: 8,
          padding: '12px 16px', fontFamily: SN, fontSize: 13, color: C.ink2, marginBottom: 16,
        }}>
          ⚠️ No hay impresoras activas ni secciones de cocina configuradas.
          Configúralos primero en las pestañas <strong>Impresoras</strong> y <strong>Secciones</strong>.
        </div>
      )}

      {/* Explicación del sistema de cascada */}
      <div style={{
        background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8,
        padding: '12px 16px', marginBottom: 20, fontFamily: SN, fontSize: 12, color: C.ink3,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px',
      }}>
        <div style={{ gridColumn: '1/-1', fontWeight: 700, color: C.ink2, marginBottom: 4 }}>
          Orden de prioridad (de mayor a menor)
        </div>
        <div>1. Zona específica + Sección específica</div>
        <div>3. Sin zona + Sección específica</div>
        <div>2. Zona específica + Todas las secciones</div>
        <div>4. Sin zona + Todas las secciones (default global)</div>
      </div>

      {/* Lista de reglas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.ink4, fontFamily: SN }}>Cargando…</div>
      ) : reglas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, color: C.ink4, fontFamily: SN,
          border: `2px dashed ${C.rule}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔀</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Sin flujos configurados</div>
          <div style={{ fontSize: 12 }}>Todas las comandas se enrutan según la configuración de impresoras estándar</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reglas.map(r => (
            <div key={r.id} style={{
              background: r.activa ? C.bone : C.paper2,
              border: `1px solid ${r.activa ? C.rule : C.paper3}`,
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: r.activa ? 1 : 0.55, transition: 'opacity .2s',
            }}>
              {/* Prioridad badge */}
              <div style={{
                background: C.paper2, border: `1px solid ${C.rule}`,
                borderRadius: 6, padding: '2px 7px', fontFamily: SM,
                fontSize: 11, color: C.ink3, minWidth: 28, textAlign: 'center', flexShrink: 0,
              }}>
                P{r.prioridad}
              </div>

              {/* SI: Zona + Sección */}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginBottom: 2 }}>SI</div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 500 }}>
                  <span style={{
                    background: C.paper3, borderRadius: 4, padding: '2px 6px', marginRight: 6, fontSize: 12,
                  }}>
                    {zonaNombre(r.zona_tipo)}
                  </span>
                  <span style={{ color: C.ink4 }}>·</span>
                  <span style={{
                    background: C.paper3, borderRadius: 4, padding: '2px 6px', marginLeft: 6, fontSize: 12,
                  }}>
                    {seccionNombre(r.seccion_id)}
                  </span>
                </div>
              </div>

              {/* Flecha */}
              <div style={{ color: C.red, fontWeight: 700, fontSize: 18, flexShrink: 0 }}>→</div>

              {/* ENTONCES: Destino */}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginBottom: 2 }}>ENTONCES</div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 600 }}>
                  {DESTINO_ICON[r.destino_tipo]}{' '}
                  {r.destino_nombre ?? r.destino_ref}
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 400,
                    background: r.destino_tipo === 'kds' ? C.greenS : C.paper3,
                    color: r.destino_tipo === 'kds' ? C.green : C.ink3,
                    borderRadius: 4, padding: '1px 5px',
                  }}>
                    {r.destino_tipo === 'kds' ? 'pantalla' : 'impresora'}
                  </span>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => toggleActiva(r)}
                  title={r.activa ? 'Desactivar' : 'Activar'}
                  style={{
                    background: r.activa ? C.greenS : C.paper3,
                    color: r.activa ? C.green : C.ink4,
                    border: 'none', borderRadius: 6, padding: '5px 10px',
                    fontFamily: SN, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {r.activa ? '● ON' : '○ OFF'}
                </button>
                <button
                  onClick={() => borrar(r.id)}
                  title="Eliminar"
                  style={{
                    background: 'transparent', color: C.ink4,
                    border: `1px solid ${C.rule}`, borderRadius: 6, padding: '5px 8px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                >
                  <Icon d={ICONS.trash} size={13}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva regla */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(26,23,20,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
        }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false) }}
        >
          <div style={{
            background: C.paper, borderRadius: 14, padding: 24, width: '100%', maxWidth: 440,
            boxShadow: '0 8px 32px rgba(26,23,20,.2)',
          }}>
            <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 20 }}>
              Nueva regla de flujo
            </div>

            {/* SI — Condiciones */}
            <div style={{
              background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8,
              padding: '12px 14px', marginBottom: 14,
            }}>
              <div style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 10, letterSpacing: '0.06em' }}>
                SI (condiciones)
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelSt}>Zona</label>
                <select value={form.zona_tipo} onChange={e => setForm(f => ({ ...f, zona_tipo: e.target.value }))} style={inputSt}>
                  <option value="">Todas las zonas</option>
                  {zonas.map(z => <option key={z.tipo} value={z.tipo}>{z.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Sección de carta</label>
                <select value={form.seccion_id} onChange={e => setForm(f => ({ ...f, seccion_id: e.target.value }))} style={inputSt}>
                  <option value="">Todas las secciones</option>
                  {secciones.map(s => <option key={s.id} value={s.id}>{s.icono} {s.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* ENTONCES — Destino */}
            <div style={{
              background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8,
              padding: '12px 14px', marginBottom: 14,
            }}>
              <div style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 10, letterSpacing: '0.06em' }}>
                ENTONCES (destino)
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelSt}>Tipo de destino</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['impresora', 'kds'] as const).map(tipo => (
                    <button key={tipo} onClick={() => setForm(f => ({ ...f, destino_tipo: tipo, destino_ref: '' }))}
                      style={{
                        flex: 1, padding: '8px 0', border: `2px solid ${form.destino_tipo === tipo ? C.red : C.rule}`,
                        borderRadius: 8, background: form.destino_tipo === tipo ? C.redS : 'transparent',
                        fontFamily: SN, fontSize: 13, fontWeight: 600,
                        color: form.destino_tipo === tipo ? C.red : C.ink3, cursor: 'pointer',
                      }}
                    >
                      {DESTINO_ICON[tipo]} {tipo === 'impresora' ? 'Impresora' : 'Pantalla KDS'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelSt}>{form.destino_tipo === 'impresora' ? 'Impresora' : 'Sección KDS'}</label>
                <select value={form.destino_ref} onChange={e => setForm(f => ({ ...f, destino_ref: e.target.value }))} style={inputSt}>
                  <option value="">— Selecciona —</option>
                  {opcionesDestino.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {opcionesDestino.length === 0 && (
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.amber, marginTop: 4 }}>
                    ⚠️ No hay {form.destino_tipo === 'impresora' ? 'impresoras activas' : 'secciones de cocina'} configuradas
                  </div>
                )}
              </div>
            </div>

            {/* Prioridad */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Prioridad (1–10, mayor = más peso)</label>
              <input
                type="number" min={1} max={10}
                value={form.prioridad}
                onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}
                style={{ ...inputSt, width: 80 }}
              />
              <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginLeft: 8 }}>
                Usa 10 para reglas específicas, 1 para fallbacks globales
              </span>
            </div>

            {err && <div style={{ color: C.red, fontFamily: SN, fontSize: 12, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{
                background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8,
                padding: '9px 18px', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer',
              }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={saving} style={{
                background: saving ? C.ink4 : C.red, color: '#fff',
                border: 'none', borderRadius: 8, padding: '9px 18px',
                fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              }}>
                {saving ? 'Guardando…' : 'Guardar regla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Facturas Verifactu ─── */
type Factura = {
  id: string; numero_serie: string; numero_factura: number; fecha_expedicion: string
  mesa_label: string; razon_social: string; nif_emisor: string
  importe_total: number; base_imponible: number; cuota_iva: number; tipo_iva: number
  huella: string; huella_anterior: string | null; primer_registro: boolean
  qr_data: string; enviada_aeat: boolean; anulada: boolean; comanda_id: string | null
}

function FacturasTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [desde, setDesde] = useState(() => new Date(Date.now() - 86400 * 7 * 1000).toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const [selected, setSelected] = useState<Factura | null>(null)
  const [anulando, setAnulando] = useState(false)

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/factura/lista?desde=${desde}&hasta=${hasta}&page=${p}`, { headers: sh() })
      const d = await r.json()
      setFacturas(d.facturas ?? [])
      setTotal(d.total ?? 0)
      setPages(d.pages ?? 1)
      setPage(p)
    } catch { setError('Error al cargar facturas') }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta])

  useEffect(() => { load(0) }, [load])

  const anular = async (f: Factura) => {
    if (!confirm(`Anular factura T-${String(f.numero_factura).padStart(8,'0')} por ${f.importe_total.toFixed(2)} €?`)) return
    setAnulando(true)
    const r = await fetch('/api/factura/anular', {
      method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ factura_id: f.id })
    })
    if (r.ok) { setSelected(null); load(page) }
    else { const d = await r.json(); alert(d.error ?? 'Error al anular') }
    setAnulando(false)
  }

  const formatEuro = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
  const formatFecha = (s: string) => new Date(s).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header info Verifactu */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d={ICONS.shield}/>
        </svg>
        <div>
          <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink2, marginBottom: 3 }}>
            VERIFACTU · RD 1007/2023 · FASE 1 (hash local)
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
            Registros con hash SHA-256 encadenado almacenados localmente. QR verificable en sede AEAT impreso en ticket.
            Envio automatico a AEAT (Fase 2) obligatorio desde 01/01/2027.
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>DESDE</div>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
          style={{ fontFamily: SM, fontSize: 12, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '5px 8px', background: C.bone, color: C.ink }} />
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>HASTA</div>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
          style={{ fontFamily: SM, fontSize: 12, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '5px 8px', background: C.bone, color: C.ink }} />
        <Btn onClick={() => load(0)}>Filtrar</Btn>
        <div style={{ marginLeft: 'auto', fontFamily: SM, fontSize: 11, color: C.ink3 }}>
          {total} factura{total !== 1 ? 's' : ''}
        </div>
      </div>

      {error && <div style={{ color: C.red, fontFamily: SN, fontSize: 13 }}>{error}</div>}

      {/* Tabla */}
      {loading ? (
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, padding: 24 }}>Cargando...</div>
      ) : facturas.length === 0 ? (
        <div style={{ fontFamily: SN, fontSize: 14, color: C.ink3, padding: 24 }}>Sin facturas en el periodo seleccionado.</div>
      ) : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SN, fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.paper2 }}>
                {['Numero', 'Fecha', 'Mesa', 'Base', 'IVA', 'Total', 'Hash', 'Estado'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: C.ink3, borderBottom: `1px solid ${C.rule}`, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturas.map((f, i) => (
                <tr key={f.id}
                  onClick={() => setSelected(f)}
                  style={{ background: i % 2 === 0 ? C.bone : C.paper, cursor: 'pointer', opacity: f.anulada ? 0.5 : 1 }}>
                  <td style={{ padding: '10px 14px', fontFamily: SM, fontSize: 12, color: C.red }}>
                    T-{String(f.numero_factura).padStart(8, '0')}
                  </td>
                  <td style={{ padding: '10px 14px', color: C.ink3, fontSize: 12 }}>{formatFecha(f.fecha_expedicion)}</td>
                  <td style={{ padding: '10px 14px' }}>{f.mesa_label}</td>
                  <td style={{ padding: '10px 14px', fontFamily: SM }}>{formatEuro(f.base_imponible)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: SM, color: C.ink3 }}>{formatEuro(f.cuota_iva)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: SM, fontWeight: 700 }}>{formatEuro(f.importe_total)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                    {f.huella?.slice(0, 8)}…
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {f.anulada ? (
                      <Badge color={C.redS}>ANULADA</Badge>
                    ) : f.enviada_aeat ? (
                      <Badge color={C.greenS}>AEAT OK</Badge>
                    ) : (
                      <Badge color={C.amberS}>LOCAL</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginacion */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Btn size="sm" onClick={() => load(page - 1)} disabled={page === 0}>Anterior</Btn>
          <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3, alignSelf: 'center' }}>{page + 1} / {pages}</span>
          <Btn size="sm" onClick={() => load(page + 1)} disabled={page >= pages - 1}>Siguiente</Btn>
        </div>
      )}

      {/* Modal detalle factura */}
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 32, width: 480, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.1em', marginBottom: 8 }}>FACTURA SIMPLIFICADA</div>
            <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, letterSpacing: '-.01em', marginBottom: 20 }}>
              T-{String(selected.numero_factura).padStart(8, '0')}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
              {[
                ['Emisor', selected.razon_social],
                ['NIF', selected.nif_emisor],
                ['Mesa', selected.mesa_label],
                ['Fecha', formatFecha(selected.fecha_expedicion)],
                ['Base imponible', formatEuro(selected.base_imponible)],
                [`IVA ${selected.tipo_iva}%`, formatEuro(selected.cuota_iva)],
                ['TOTAL', formatEuro(selected.importe_total)],
                ['Estado', selected.anulada ? 'ANULADA' : selected.enviada_aeat ? 'Enviada AEAT' : 'Local (Fase 1)'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>HASH SHA-256</div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink2, wordBreak: 'break-all', lineHeight: 1.6 }}>{selected.huella}</div>
            </div>

            {selected.huella_anterior && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>HASH ANTERIOR (encadenado)</div>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, wordBreak: 'break-all', lineHeight: 1.6 }}>{selected.huella_anterior}</div>
              </div>
            )}

            {selected.primer_registro && (
              <div style={{ background: C.amberS, borderRadius: 4, padding: '6px 10px', marginBottom: 14, fontFamily: SM, fontSize: 11, color: C.ink2 }}>
                Primer registro de la serie T — encadenamiento iniciado
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>QR AEAT (verificacion)</div>
              <a href={selected.qr_data} target="_blank" rel="noreferrer"
                style={{ fontFamily: SM, fontSize: 10, color: C.red, wordBreak: 'break-all', lineHeight: 1.6, textDecoration: 'none' }}>
                {selected.qr_data}
              </a>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {!selected.anulada && (
                <Btn variant="danger" onClick={() => anular(selected)} disabled={anulando}>
                  {anulando ? 'Anulando...' : 'Anular factura'}
                </Btn>
              )}
              <Btn onClick={() => setSelected(null)}>Cerrar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id: 'camareros',   label: 'Camareros',   icon: ICONS.users   },
  { id: 'mesas',       label: 'Mesas',       icon: ICONS.grid    },
  { id: 'impresoras',  label: 'Impresoras',  icon: ICONS.printer },
  { id: 'flujos',      label: 'Flujos',      icon: ICONS.wifi    },
  { id: 'turno',       label: 'Turno',       icon: ICONS.clock   },
  { id: 'analytics',   label: 'Analytics',   icon: ICONS.chart   },
  { id: 'carta',       label: 'Carta',       icon: ICONS.book    },
  { id: 'facturas',    label: 'Facturas',    icon: ICONS.receipt },
  { id: 'restaurante', label: 'Restaurante', icon: ICONS.shield  },
]

export default function OwnerPage() {
  const { session, checking } = useAuth('owner')
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [tab, setTab] = useState('camareros')

  const logout = () => {
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  if (checking || !session) return (
    <div style={{ minHeight: '100dvh', background: C.paper }}/>
  )

  return (
    <div style={{ minHeight: '100dvh', background: C.paper, fontFamily: SN }}>
      <SugerenciaButton session={session} tema="light" />
      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${C.red} !important; box-shadow: 0 0 0 3px rgba(217,68,43,.15); }
        button { font-family: ${SN}; }
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      `}</style>

      {/* Top nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(246,241,231,.94)',
        backdropFilter: 'blur(14px)', borderBottom: `1px solid ${C.rule}`,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 56 }}>
        <Logo/>
        <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 500, color: C.ink }}>
          ia<span style={{ color: C.red }}>.</span>rest
        </div>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
          color: C.ink3, textTransform: 'uppercase', padding: '3px 8px', background: C.paper2,
          border: `1px solid ${C.rule}`, borderRadius: 3 }}>
          Panel del dueño
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>{session.nombre}</div>
          <button onClick={logout} style={{ background: 'none', border: `1px solid ${C.rule}`,
            borderRadius: 4, padding: '6px 10px', cursor: 'pointer', color: C.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon d={ICONS.logout} size={14}/>
            <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600 }}>Salir</span>
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 32, background: C.paper2,
          border: `1px solid ${C.rule}`, borderRadius: 8, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: tab === t.id ? C.bone : 'transparent',
                color: tab === t.id ? C.ink : C.ink3,
                fontFamily: SN, fontSize: 13, fontWeight: tab === t.id ? 600 : 500,
                boxShadow: tab === t.id ? `0 1px 0 rgba(26,23,20,.04), 0 1px 3px rgba(26,23,20,.1)` : 'none',
                transition: 'all .15s' }}>
              <Icon d={t.icon} size={15}/>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'camareros'  && <CamarerosTab/>}
        {tab === 'mesas'      && <MesasTab/>}
        {tab === 'impresoras' && <ImpresorasTab/>}
        {tab === 'flujos'     && <FlujoTab/>}
        {tab === 'turno'      && <TurnoTab/>}
        {tab === 'analytics'  && <Analytics compact />}
        {tab === 'carta'       && <CartaTab/>}
        {tab === 'facturas'    && <FacturasTab/>}
        {tab === 'restaurante' && <RestauranteTab/>}
      </div>
    </div>
  )
}
