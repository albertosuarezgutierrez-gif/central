'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Analytics from '@/components/Analytics'
import SugerenciaButton from '@/components/SugerenciaButton'
import { supabase } from '@/lib/supabase'
import CartaPublicPanel from '@/components/owner/CartaPublicPanel'
import FueraCartaSection from '@/components/owner/FueraCartaSection'
import SupervisorTab from '@/components/owner/SupervisorTab'

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
type Mesa = { id: string; codigo: string; nombre: string | null; zona: string; capacidad: number; estado: string; pos_x: number | null; pos_y: number | null; forma: 'round' | 'square' | 'bar' | null }
type Turno = { id: string; nombre: string; estado: string; created_at: string; fecha: string }
type TurnoStats = { total_comandas: number; avg_latencia_ms: number | null; mesas_activas: { codigo: string; count: number }[] }
type Impresora = { id: string; nombre: string; seccion_id: string; secciones_ids: string[]; cloud_device_id: string | null; modelo: string | null; activa: boolean; ultimo_ping: string | null; configurada: boolean; connection_type: string; ip_address: string | null; port: number | null; impresora_fallback_id: string | null }
type BridgeToken = { id: string; token: string; nombre: string; activo: boolean; ultimo_ping: string | null }
type PrintJob = { id: string; status: string; seccion_id: string; created_at: string; sent_at: string | null; acked_at: string | null; attempts: number; error_msg: string | null; impresoras?: { nombre: string } }
type Reserva = {
  id: string; nombre_cliente: string; telefono: string | null
  num_personas: number; fecha_reserva: string; hora_reserva: string
  duracion_min: number; notas: string | null; estado: string; canal: string
  mesa_id: string | null; mesas?: { id: string; codigo: string; nombre: string | null } | null
}

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
  alertTriangle: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.77 3.19 2 2 0 0 1 3.74 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6.59 6.59l.97-1.04a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  qr: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2',
}

const ZONA_LABEL: Record<string, string> = { salon: 'Salón', terraza: 'Terraza', barra: 'Barra' }
const ROL_LABEL: Record<string, string> = { camarero: 'Camarero', jefe_sala: 'Jefe sala', cocina: 'Cocina', running: 'Running', owner: 'Owner', super_admin: 'Super' }

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
    background: 'rgba(26,23,20,.6)', backdropFilter: 'blur(4px)', padding: 16 }}>
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, width: '100%', maxWidth: 440,
      maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column',
      boxShadow: '0 18px 40px -12px rgba(26,23,20,.28)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink }}>{title}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, display: 'flex' }}>
          <Icon d={ICONS.x} size={20}/>
        </button>
      </div>
      <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>{children}</div>
    </div>
  </div>
)

/* ─── Tab: Camareros ─── */
type Seccion = { id: string; nombre: string; color_kds?: string; icono?: string; activa?: boolean; orden?: number }
function CamarerosTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [camareros, setCamareros] = useState<Camarero[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Camarero } | { del: Camarero } | { qr: Camarero }>(null)
  const [form, setForm] = useState({ nombre: '', pin: '', rol: 'camarero', activo: true, seccion_id: '' })
  const [showPins, setShowPins] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState('')
  const [delErr, setDelErr] = useState('')
  const [codigoAcceso, setCodigoAcceso] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/camareros', { headers: sh() })
    const d = await r.json()
    setCamareros(d.camareros || [])
    const rs = await fetch('/api/owner/secciones', { headers: sh() })
    if (rs.ok) { const ds = await rs.json(); setSecciones(ds.secciones || []) }
    const rr = await fetch('/api/owner/restaurante', { headers: sh() })
    if (rr.ok) { const dr = await rr.json(); setCodigoAcceso(dr.restaurante?.codigo_acceso ?? '') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ nombre: '', pin: '', rol: 'camarero', activo: true, seccion_id: '' }); setErr(''); setModal('create') }
  const openEdit = (c: Camarero) => { setForm({ nombre: c.nombre, pin: c.pin, rol: c.rol, activo: c.activo, seccion_id: c.seccion_id || '' }); setErr(''); setModal({ edit: c }) }
  const openDel = (c: Camarero) => { setDelErr(''); setModal({ del: c }) }
  const openQr  = (c: Camarero) => { setModal({ qr: c }) }

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
    const r = await fetch('/api/owner/camareros', { method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: (modal as { del: Camarero }).del.id }) })
    if (!r.ok) {
      const d = await r.json()
      const msg = d.error || 'Error al borrar'
      setDelErr(msg.includes('foreign key') || msg.includes('violates')
        ? 'Este camarero tiene comandas o datos históricos asociados. Márcalo como BAJA en lugar de borrar.'
        : msg)
      return
    }
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

      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, background: C.bone, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as 'touch' }}>
        <div className="carta-table-wrap" style={{ overflowX: "auto" }}>
        {/* Table header */}
        <div className='carta-table-row' style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px 80px 100px',
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
          <div key={c.id} className='carta-table-row' style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px 80px 100px',
            padding: '14px 20px', alignItems: 'center',
            borderBottom: i < camareros.length - 1 ? `1px solid ${C.rule}` : 'none',
            background: !c.activo ? C.paper : 'transparent' }}>
            <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: c.activo ? C.ink : C.ink4 }}>{c.nombre}</span>
            <span><Badge color={c.rol === 'jefe_sala' ? C.redS : c.rol === 'cocina' ? C.paper2 : C.paper2}>{ROL_LABEL[c.rol] || c.rol}</Badge></span>
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
              <Btn size="sm" variant="ghost" onClick={() => openQr(c)}><Icon d={ICONS.qr} size={13}/></Btn>
              <Btn size="sm" variant="ghost" onClick={() => openEdit(c)}><Icon d={ICONS.edit} size={13}/></Btn>
              <Btn size="sm" variant="danger" onClick={() => openDel(c)}><Icon d={ICONS.trash} size={13}/></Btn>
            </span>
          </div>
        ))}
        </div>{/* /minWidth */}
      </div>

      {/* Create / Edit modal */}
      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal === 'create' ? 'Nuevo camarero' : 'Editar camarero'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Marta"/>
            <Field label="PIN (4 dígitos)" value={form.pin} onChange={v => setForm(f => ({ ...f, pin: v }))} placeholder="1234" type="text" error={err.includes('PIN') ? err : undefined}/>
            <Select label="Rol" value={form.rol} onChange={v => setForm(f => ({ ...f, rol: v, seccion_id: '' }))}
              options={[{ value: 'camarero', label: 'Camarero' }, { value: 'jefe_sala', label: 'Jefe de sala' }, { value: 'cocina', label: 'Cocina' }, { value: 'running', label: 'Running' }]}/>
            {form.rol === 'cocina' && (
              <Select label="Sección" value={form.seccion_id} onChange={v => setForm(f => ({ ...f, seccion_id: v }))}
                options={[{ value: '', label: 'Todas las secciones' }, ...secciones.map(s => ({ value: s.id, label: s.nombre }))]}/>
            )}
            {form.rol === 'running' && (
              <div style={{ padding: '10px 12px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                💡 Las zonas que cubre el running se configuran desde la pantalla <strong>/running</strong> o en esta ficha tras guardarlo.
              </div>
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

      {/* QR modal */}
      {modal && typeof modal === 'object' && 'qr' in modal && (() => {
        const cam = (modal as { qr: Camarero }).qr
        const loginUrl = codigoAcceso ? `https://www.iarest.es/login?r=${codigoAcceso}` : ''
        const qrImgUrl = loginUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(loginUrl)}` : ''
        return (
          <Modal title={`Acceso QR · ${cam.nombre}`} onClose={() => setModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              {qrImgUrl && (
                <div style={{ background: '#fff', borderRadius: 12, padding: 8, border: `1px solid ${C.rule}` }}>
                  <img src={qrImgUrl} alt="QR de acceso" width={220} height={220} style={{ display: 'block', borderRadius: 6 }} />
                </div>
              )}
              <div style={{ width: '100%', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.1em', marginBottom: 6 }}>PIN DE ACCESO</div>
                <div style={{ fontFamily: SM, fontSize: 28, fontWeight: 700, color: C.ink, letterSpacing: '0.2em' }}>{cam.pin}</div>
              </div>
              <div style={{ width: '100%', fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.7, textAlign: 'center' }}>
                El camarero escanea el QR con la cámara del móvil → se abre la app → escribe su PIN
              </div>
              <div style={{ width: '100%' }}><Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn></div>
            </div>
          </Modal>
        )
      })()}

      {modal && typeof modal === 'object' && 'del' in modal && (
        <Modal title="Borrar camarero" onClose={() => setModal(null)}>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.ink2, marginTop: 0, lineHeight: 1.5 }}>
            ¿Borrar a <strong>{(modal as { del: Camarero }).del.nombre}</strong>? Esta acción no se puede deshacer.
          </p>
          {delErr && (
            <div style={{ padding: '10px 12px', background: '#FFF3CD', border: `1px solid ${C.amber}`, borderRadius: 8,
              fontFamily: SN, fontSize: 12, color: C.ink, marginBottom: 8, lineHeight: 1.5 }}>
              ⚠️ {delErr}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            {delErr && (
              <Btn variant="ghost" onClick={async () => {
                const c = (modal as { del: Camarero }).del
                await fetch('/api/owner/camareros', { method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...sh() },
                  body: JSON.stringify({ id: c.id, activo: false }) })
                await load(); setModal(null)
              }}>Marcar como BAJA</Btn>
            )}
            {!delErr && <Btn variant="danger" onClick={del}><Icon d={ICONS.trash} size={14}/>Borrar</Btn>}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── ZonaTabs: tabs de zona arrastrables ──────────────────────
function ZonaTabs({ zonas, mesas, zonaActiva, onSelect, onReorder }: {
  zonas: Zona[]; mesas: Mesa[]
  zonaActiva: string
  onSelect: (tipo: string) => void
  onReorder: (ids: string[]) => void
}) {
  const [order, setOrder] = useState<string[]>([])
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx]         = useState<number | null>(null)

  useEffect(() => { setOrder(zonas.map(z => z.id)) }, [zonas])

  const ordered = order
    .map(id => zonas.find(z => z.id === id))
    .filter(Boolean) as Zona[]

  const handleDragStart = (idx: number) => setDraggingIdx(idx)
  const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx) }
  const handleDrop      = (idx: number) => {
    if (draggingIdx === null || draggingIdx === idx) return
    const next = [...order]
    const [moved] = next.splice(draggingIdx, 1)
    next.splice(idx, 0, moved)
    setOrder(next)
    setDraggingIdx(null); setOverIdx(null)
    onReorder(next)
  }
  const handleDragEnd = () => { setDraggingIdx(null); setOverIdx(null) }

  return (
    <div style={{
      display:'flex', gap:5, marginBottom:12,
      overflowX:'auto', paddingBottom:4, scrollbarWidth:'none',
    }}>
      {ordered.map((z, idx) => {
        const cnt = mesas.filter(m => m.zona === z.tipo).length
        const on  = zonaActiva === z.tipo
        const isDrag = draggingIdx === idx
        const isOver = overIdx === idx && draggingIdx !== idx
        return (
          <div
            key={z.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(z.tipo)}
            style={{
              padding:'7px 13px', borderRadius:8, flexShrink:0,
              border:`1px solid ${isOver ? C.red : on ? C.red : C.rule}`,
              background: isOver ? C.redS+'88' : on ? C.redS : C.bone,
              color: on ? C.red : C.ink3,
              fontSize:12, fontFamily:SN, fontWeight: on ? 500 : 400,
              cursor:'grab', userSelect:'none', transition:'all .1s',
              opacity: isDrag ? .4 : 1,
              display:'flex', alignItems:'center', gap:6,
            }}
          >
            <span style={{ fontSize:9, color:C.ink4, opacity:.5, marginRight:-2 }}>⠿</span>
            {z.nombre}
            <span style={{ opacity:.6, fontFamily:SM, fontSize:10 }}>{cnt}</span>
          </div>
        )
      })}
      <div style={{ fontSize:9, color:C.ink4, fontFamily:SM, alignSelf:'center', marginLeft:4, opacity:.5, flexShrink:0 }}>
        arrastra para reordenar
      </div>
    </div>
  )
}

/* ─── Tab: Mesas ─── */
type Zona = { id: string; nombre: string; tipo: string; prefijo: string; descripcion?: string; orden: number; activa: boolean }


// ── Constantes diseñador ──────────────────────────────────────
// El canvas usa coordenadas lógicas 0-1000 × 0-620
// y escala al tamaño real del contenedor en tiempo real.
const LOGI_W = 1000
const LOGI_H = 620
const GRID   = 20

function snapGrid(v: number) { return Math.round(v / GRID) * GRID }
function mesaSize(forma: string, cap: number) {
  if (forma === 'bar')    return { w: 80, h: 40 }
  if (forma === 'square') return { w: cap >= 6 ? 90 : 72, h: cap >= 6 ? 90 : 72 }
  return { w: cap >= 6 ? 80 : 68, h: cap >= 6 ? 80 : 68 }
}

function MesasTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [mesas,      setMesas]      = useState<Mesa[]>([])
  const [zonas,      setZonas]      = useState<Zona[]>([])
  const [loading,    setLoading]    = useState(true)
  const [vista,      setVista]      = useState<'plano'|'lista'>('plano')
  const [zonaActiva, setZonaActiva] = useState('')
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [isMobile,   setIsMobile]   = useState(false)

  // Canvas ref + scale
  const canvasRef  = useRef<HTMLDivElement>(null)
  const scaleRef   = useRef(1)

  // Drag state
  const draggingRef  = useRef<string|null>(null)
  const dragOffRef   = useRef({ x: 0, y: 0 })

  // Modales CRUD
  const [modal,    setModal]    = useState<null|'create'|'zona-create'|{edit:Mesa}|{del:Mesa}|{editZona:Zona}>(null)
  const [form,     setForm]     = useState({ codigo:'', nombre:'', zona:'', capacidad:'4', forma:'round' as 'round'|'square'|'bar' })
  const [zonaForm, setZonaForm] = useState({ nombre:'', prefijo:'', descripcion:'' })
  const [err,      setErr]      = useState('')

  const selected = mesas.find(m => m.id === selectedId) ?? null

  // Detectar móvil
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Calcular escala canvas
  const getScale = () => {
    if (!canvasRef.current) return 1
    return canvasRef.current.clientWidth / LOGI_W
  }

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
    const ms: Mesa[] = d.mesas || []
    setMesas(ms)
    if (zs.length > 0) {
      setForm(f => ({ ...f, zona: zs[0].tipo }))
      setZonaActiva(zs.filter(z => z.activa)[0]?.tipo ?? '')
    }
    setLoading(false)
  }, [loadZonas])

  useEffect(() => { load() }, [load])

  // ── Auto-layout ────────────────────────────────────────────
  const getPos = (mesa: Mesa, idx: number) => {
    if (mesa.pos_x !== null && mesa.pos_y !== null) return { x: mesa.pos_x, y: mesa.pos_y }
    const col = idx % 5
    const row = Math.floor(idx / 5)
    return { x: 40 + col * 120, y: 40 + row * 120 }
  }

  // ── Drag (mouse) ───────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const mesa = mesas.find(m => m.id === id)
    if (!mesa) return
    scaleRef.current = getScale()
    const rect = canvasRef.current!.getBoundingClientRect()
    const scale = scaleRef.current
    const { x, y } = getPos(mesa, mesas.findIndex(m => m.id === id))
    dragOffRef.current = {
      x: e.clientX - rect.left - x * scale,
      y: e.clientY - rect.top  - y * scale,
    }
    draggingRef.current = id
    setSelectedId(id)

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !canvasRef.current) return
      const r = canvasRef.current.getBoundingClientRect()
      const sc = scaleRef.current
      const sz = mesaSize(mesa.forma ?? 'round', mesa.capacidad)
      const nx = snapGrid(Math.max(0, Math.min((ev.clientX - r.left - dragOffRef.current.x) / sc, LOGI_W - sz.w)))
      const ny = snapGrid(Math.max(0, Math.min((ev.clientY - r.top  - dragOffRef.current.y) / sc, LOGI_H - sz.h)))
      setMesas(prev => prev.map(m => m.id === draggingRef.current ? { ...m, pos_x: nx, pos_y: ny } : m))
    }
    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Touch drag ─────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    const mesa = mesas.find(m => m.id === id)
    if (!mesa) return
    scaleRef.current = getScale()
    const rect = canvasRef.current!.getBoundingClientRect()
    const scale = scaleRef.current
    const touch = e.touches[0]
    const { x, y } = getPos(mesa, mesas.findIndex(m => m.id === id))
    dragOffRef.current = {
      x: touch.clientX - rect.left - x * scale,
      y: touch.clientY - rect.top  - y * scale,
    }
    draggingRef.current = id
    setSelectedId(id)

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault()
      if (!draggingRef.current || !canvasRef.current) return
      const r = canvasRef.current.getBoundingClientRect()
      const sc = scaleRef.current
      const sz = mesaSize(mesa.forma ?? 'round', mesa.capacidad)
      const t = ev.touches[0]
      const nx = snapGrid(Math.max(0, Math.min((t.clientX - r.left - dragOffRef.current.x) / sc, LOGI_W - sz.w)))
      const ny = snapGrid(Math.max(0, Math.min((t.clientY - r.top  - dragOffRef.current.y) / sc, LOGI_H - sz.h)))
      setMesas(prev => prev.map(m => m.id === draggingRef.current ? { ...m, pos_x: nx, pos_y: ny } : m))
    }
    const onEnd = () => {
      draggingRef.current = null
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
  }

  // ── Guardar plano ──────────────────────────────────────────
  const guardarPlano = async () => {
    setSaving(true)
    await Promise.all(
      mesas.filter(m => m.zona === zonaActiva).map(m =>
        fetch('/api/owner/mesas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...sh() },
          body: JSON.stringify({ id: m.id, pos_x: m.pos_x, pos_y: m.pos_y, forma: m.forma }),
        })
      )
    )
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ── Añadir mesa en plano ───────────────────────────────────
  const addMesaPlano = async (forma: 'round'|'square'|'bar') => {
    const zona = zonas.find(z => z.tipo === zonaActiva)
    if (!zona) return
    const mesasZona = mesas.filter(m => m.zona === zonaActiva)
    const n = mesasZona.length + 1
    const codigo = zona.prefijo + String(n).padStart(2, '0')
    const r = await fetch('/api/owner/mesas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({
        codigo, zona: zonaActiva, capacidad: forma === 'bar' ? 2 : 4, forma,
        pos_x: snapGrid(40 + (mesasZona.length % 5) * 120),
        pos_y: snapGrid(40 + Math.floor(mesasZona.length / 5) * 120),
      }),
    })
    const d = await r.json()
    if (d.mesa) { setMesas(prev => [...prev, d.mesa]); setSelectedId(d.mesa.id) }
  }

  // ── Update + save selected ─────────────────────────────────
  const updateSelected = (patch: Partial<Mesa>) => {
    if (!selectedId) return
    setMesas(prev => prev.map(m => m.id === selectedId ? { ...m, ...patch } : m))
  }

  const saveSelected = async (patch?: Partial<Mesa>) => {
    const m = patch ? { ...selected, ...patch } : selected
    if (!m) return
    await fetch('/api/owner/mesas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id: m.id, codigo: m.codigo, nombre: m.nombre, capacidad: m.capacidad, zona: m.zona, forma: m.forma, pos_x: m.pos_x, pos_y: m.pos_y }),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const delSelected = async () => {
    if (!selected || !confirm(`¿Eliminar ${selected.codigo}?`)) return
    await fetch('/api/owner/mesas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id: selected.id }),
    })
    setMesas(prev => prev.filter(m => m.id !== selected.id))
    setSelectedId(null)
  }

  // ── Mover con flechas (móvil) ──────────────────────────────
  const moverMesa = (dx: number, dy: number) => {
    if (!selected) return
    const nx = snapGrid(Math.max(0, Math.min((selected.pos_x ?? 40) + dx, LOGI_W - 80)))
    const ny = snapGrid(Math.max(0, Math.min((selected.pos_y ?? 40) + dy, LOGI_H - 80)))
    const patch = { pos_x: nx, pos_y: ny }
    updateSelected(patch)
    saveSelected({ ...selected, ...patch })
  }

  // ── CRUD ───────────────────────────────────────────────────
  const openCreate = () => { setForm({ codigo:'', nombre:'', zona: zonas[0]?.tipo||'salon', capacidad:'4', forma:'round' }); setErr(''); setModal('create') }
  const openEdit   = (m: Mesa) => { setForm({ codigo:m.codigo, nombre:m.nombre??'', zona:m.zona, capacidad:String(m.capacidad), forma:m.forma??'round' }); setErr(''); setModal({ edit: m }) }
  const openDel    = (m: Mesa) => setModal({ del: m })

  const save = async () => {
    setErr('')
    if (!form.codigo.trim()) return setErr('Código requerido')
    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const body = isEdit
      ? { id: (modal as {edit:Mesa}).edit.id, ...form, nombre: form.nombre.trim()||null, capacidad: parseInt(form.capacidad)||4 }
      : { ...form, nombre: form.nombre.trim()||null, capacidad: parseInt(form.capacidad)||4 }
    const r = await fetch('/api/owner/mesas', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type':'application/json', ...sh() }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/mesas', { method: 'DELETE', headers: { 'Content-Type':'application/json', ...sh() }, body: JSON.stringify({ id: (modal as {del:Mesa}).del.id }) })
    await load(); setModal(null)
  }

  const saveZona = async () => {
    setErr('')
    if (!zonaForm.nombre.trim() || !zonaForm.prefijo.trim()) return setErr('Nombre y prefijo requeridos')
    const isEdit = modal && typeof modal === 'object' && 'editZona' in modal
    const body = isEdit ? { id: (modal as {editZona:Zona}).editZona.id, ...zonaForm } : zonaForm
    const r = await fetch('/api/owner/zonas', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type':'application/json', ...sh() }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null); setZonaForm({ nombre:'', prefijo:'', descripcion:'' })
  }

  const delZona = async (z: Zona) => {
    // Avisar si hay mesas usando este tipo (solo para tipos custom, los base comparten tipo)
    const mesasEnZona = mesas.filter(m => m.zona === z.tipo)
    const esBase = ['salon','terraza','barra'].includes(z.tipo)
    const msg = (!esBase && mesasEnZona.length > 0)
      ? `¿Eliminar zona "${z.nombre}"?\n⚠️ Tiene ${mesasEnZona.length} mesa(s) — quedarán sin zona hasta que las reasignes.`
      : `¿Eliminar zona "${z.nombre}"?`
    if (!confirm(msg)) return
    const r = await fetch('/api/owner/zonas', { method: 'DELETE', headers: { 'Content-Type':'application/json', ...sh() }, body: JSON.stringify({ id: z.id }) })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      alert('Error al eliminar la zona: ' + (d.error || 'Error desconocido'))
      return
    }
    await load()
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:C.ink3, fontFamily:SM, fontSize:12 }}>CARGANDO...</div>

  const mesasZona = mesas.filter(m => m.zona === zonaActiva)
  const zonaObj   = zonas.find(z => z.tipo === zonaActiva)

  return (
    <div>
      <style>{`
        .mesa-drag{touch-action:none;cursor:move}
        .mesa-drag:active .mbi{filter:brightness(.94)}
        .mesa-drag.sel .mbi{outline:2px solid ${C.red};outline-offset:2px;box-shadow:0 0 0 4px ${C.red}22}
        .dp-in:focus,.dp-sel:focus{border-color:${C.red}!important;outline:none}
        .shp-opt:hover{border-color:${C.red}!important;color:${C.red}!important}
        .addbtn:hover,.addbtn:active{background:${C.paper2}!important}
        .zona-tab.on{background:${C.redS};border-color:${C.red};color:${C.red}}
        .zona-tab{border:1px solid ${C.rule};background:${C.bone};color:${C.ink3};border-radius:20px;padding:5px 14px;font-size:12px;cursor:pointer;white-space:nowrap;font-family:${SN}}
      `}</style>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, letterSpacing:'.14em', color:C.ink3, textTransform:'uppercase' }}>Espacio</div>
          <div style={{ fontFamily:SE, fontSize:24, fontWeight:500, color:C.ink, marginTop:2 }}>Mesas</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', border:`1px solid ${C.rule}`, borderRadius:8, overflow:'hidden' }}>
            {(['plano','lista'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)} style={{
                padding:'7px 12px', border:'none', cursor:'pointer',
                background: vista===v ? C.ink : C.bone, color: vista===v ? C.paper : C.ink3,
                fontSize:12, fontFamily:SN, fontWeight:500,
              }}>
                {v === 'plano' ? '⊞ Plano' : '☰ Lista'}
              </button>
            ))}
          </div>
          <Btn variant="ghost" onClick={() => { setZonaForm({ nombre:'', prefijo:'', descripcion:'' }); setErr(''); setModal('zona-create') }}>
            <Icon d={ICONS.grid} size={14}/>Zonas
          </Btn>
          {vista === 'lista' && (
            <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={15}/>Añadir</Btn>
          )}
        </div>
      </div>

      {/* ══ VISTA PLANO ══════════════════════════════════════════ */}
      {vista === 'plano' && (
        <div>
          {/* Tabs zonas — draggables para reordenar */}
          <ZonaTabs
            zonas={zonas.filter(z => z.activa)}
            mesas={mesas}
            zonaActiva={zonaActiva}
            onSelect={tipo => { setZonaActiva(tipo); setSelectedId(null) }}
            onReorder={async (ids) => {
              const ses = localStorage.getItem('ia_rest_session') ?? ''
              await Promise.all(ids.map((id, idx) =>
                fetch('/api/owner/zonas', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
                  body: JSON.stringify({ id, orden: idx }),
                })
              ))
              await load()
            }}
          />

          {/* Toolbar añadir + guardar */}
          <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:11, color:C.ink3, fontFamily:SM, flexShrink:0 }}>+ AÑADIR:</span>
            {([{ f:'round' as const, l:'● Redonda' }, { f:'square' as const, l:'■ Cuadrada' }, { f:'bar' as const, l:'▬ Barra' }]).map(({ f, l }) => (
              <button key={f} className="addbtn" onClick={() => addMesaPlano(f)} style={{
                padding:'5px 10px', borderRadius:6, border:`1px solid ${C.rule}`,
                background:C.bone, color:C.ink2, fontSize:11, fontFamily:SN, cursor:'pointer',
              }}>{l}</button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
              {saved && <span style={{ fontSize:11, color:C.green, fontFamily:SM }}>Guardado ✓</span>}
              <Btn variant="primary" onClick={guardarPlano}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
            </div>
          </div>

          {/* Canvas responsive */}
          <div ref={canvasRef} style={{
            position:'relative',
            width:'100%',
            // Mantiene ratio 1000:620
            aspectRatio: `${LOGI_W} / ${LOGI_H}`,
            background:C.bone,
            border:`1px solid ${C.rule}`,
            borderRadius:12,
            overflow:'hidden',
            backgroundImage:`linear-gradient(${C.rule}55 1px,transparent 1px),linear-gradient(90deg,${C.rule}55 1px,transparent 1px)`,
            backgroundSize:`${(GRID*2/LOGI_W)*100}% ${(GRID*2/LOGI_H)*100}%`,
            touchAction:'none',
          }}
            onClick={e => { if (e.target === canvasRef.current) setSelectedId(null) }}
          >
            {/* Hint zona */}
            <div style={{ position:'absolute', top:8, left:12, fontFamily:SM, fontSize:9, color:C.ink4, letterSpacing:'.08em', textTransform:'uppercase', pointerEvents:'none' }}>
              {zonaObj?.nombre}
              {isMobile && selected ? ' · arrastra para mover' : !isMobile ? ' · arrastra las mesas' : ''}
            </div>

            {mesasZona.map((mesa, idx) => {
              const { x, y } = getPos(mesa, idx)
              const sz  = mesaSize(mesa.forma ?? 'round', mesa.capacidad)
              const sc  = typeof window !== 'undefined' ? (canvasRef.current?.clientWidth ?? LOGI_W) / LOGI_W : 1
              const isSel   = selectedId === mesa.id
              const isRound = (mesa.forma ?? 'round') === 'round'
              const isBar   = (mesa.forma ?? 'round') === 'bar'

              return (
                <div
                  key={mesa.id}
                  className={`mesa-drag${isSel ? ' sel' : ''}`}
                  onMouseDown={e => handleMouseDown(e, mesa.id)}
                  onTouchStart={e => handleTouchStart(e, mesa.id)}
                  onClick={e => { e.stopPropagation(); setSelectedId(mesa.id) }}
                  style={{
                    position:'absolute',
                    left:`${(x / LOGI_W) * 100}%`,
                    top:`${(y / LOGI_H) * 100}%`,
                    width:`${(sz.w / LOGI_W) * 100}%`,
                    height:`${(sz.h / LOGI_H) * 100}%`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >
                  <div className="mbi" style={{
                    width:'100%', height:'100%',
                    borderRadius: isRound ? '50%' : isBar ? '4px' : '8px',
                    background: isSel ? C.redS : C.paper,
                    border: `1.5px solid ${isSel ? C.red : C.rule}`,
                    display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center', gap:1,
                    boxShadow: isSel ? `0 0 0 2px ${C.red}33` : '0 1px 3px rgba(26,23,20,.06)',
                    overflow:'hidden',
                  }}>
                    {!isBar && (
                      <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:`${sc > 0.5 ? 14 : 10}px`, fontWeight:500, color: isSel ? C.red : C.ink, lineHeight:1 }}>
                        {mesa.capacidad}
                      </div>
                    )}
                    <div style={{ fontFamily:SM, fontSize:`${sc > 0.5 ? 8 : 6}px`, color: isSel ? C.red : C.ink3, lineHeight:1 }}>
                      {mesa.codigo}
                    </div>
                  </div>
                </div>
              )
            })}

            {mesasZona.length === 0 && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, opacity:.4, pointerEvents:'none' }}>
                <div style={{ fontSize:24 }}>⊞</div>
                <div style={{ fontFamily:SN, fontSize:12, color:C.ink3, textAlign:'center', padding:'0 20px' }}>Sin mesas — usa los botones de arriba para añadir</div>
              </div>
            )}
          </div>

          {/* Panel detalle — debajo en móvil, lateral en desktop */}
          {selected && (
            <div style={{
              marginTop:12,
              background:C.bone,
              border:`1px solid ${C.rule}`,
              borderRadius:12,
              padding:'14px 16px',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ fontFamily:SM, fontSize:10, color:C.ink3, letterSpacing:'.08em', flex:1 }}>
                  {selected.codigo} · EDITANDO
                </div>
                {saved && <span style={{ fontSize:10, color:C.green, fontFamily:SM }}>✓</span>}
                <button onClick={() => setSelectedId(null)} style={{ background:'none', border:'none', cursor:'pointer', color:C.ink3, fontSize:18, padding:'0 4px' }}>×</button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:10, marginBottom:12 }}>
                {/* Código */}
                <div>
                  <div style={{ fontSize:11, color:C.ink3, marginBottom:4 }}>Código</div>
                  <input className="dp-in" value={selected.codigo}
                    onChange={e => updateSelected({ codigo: e.target.value.toUpperCase() })}
                    onBlur={() => saveSelected()}
                    style={{ width:'100%', padding:'8px 10px', border:`1px solid ${C.rule}`, borderRadius:6, background:C.paper, color:C.ink, fontSize:13, fontFamily:SM, boxSizing:'border-box' }}
                  />
                </div>
                {/* Capacidad */}
                <div>
                  <div style={{ fontSize:11, color:C.ink3, marginBottom:4 }}>Pax</div>
                  <input className="dp-in" type="number" min={1} max={20} value={selected.capacidad}
                    onChange={e => updateSelected({ capacidad: parseInt(e.target.value)||1 })}
                    onBlur={() => saveSelected()}
                    style={{ width:'100%', padding:'8px 10px', border:`1px solid ${C.rule}`, borderRadius:6, background:C.paper, color:C.ink, fontSize:13, fontFamily:SM, boxSizing:'border-box' }}
                  />
                </div>
                {/* Nombre */}
                <div>
                  <div style={{ fontSize:11, color:C.ink3, marginBottom:4 }}>Nombre</div>
                  <input className="dp-in" value={selected.nombre ?? ''}
                    onChange={e => updateSelected({ nombre: e.target.value || null })}
                    onBlur={() => saveSelected()}
                    placeholder="opcional"
                    style={{ width:'100%', padding:'8px 10px', border:`1px solid ${C.rule}`, borderRadius:6, background:C.paper, color:C.ink, fontSize:12, fontFamily:SN, boxSizing:'border-box' }}
                  />
                </div>
                {/* Zona */}
                <div>
                  <div style={{ fontSize:11, color:C.ink3, marginBottom:4 }}>Zona</div>
                  <select className="dp-sel" value={selected.zona}
                    onChange={e => { const v = e.target.value; updateSelected({ zona: v }); saveSelected({ ...selected, zona: v }) }}
                    style={{ width:'100%', padding:'8px 10px', border:`1px solid ${C.rule}`, borderRadius:6, background:C.paper, color:C.ink, fontSize:12, fontFamily:SN, boxSizing:'border-box' }}
                  >
                    {zonas.filter(z => z.activa).map(z => <option key={z.id} value={z.tipo}>{z.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* Forma + controles móvil */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-start' }}>
                {/* Forma */}
                <div style={{ flex:'0 0 auto' }}>
                  <div style={{ fontSize:11, color:C.ink3, marginBottom:6 }}>Forma</div>
                  <div style={{ display:'flex', gap:5 }}>
                    {([
                      { v:'round'  as const, svg:<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/> },
                      { v:'square' as const, svg:<rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/> },
                      { v:'bar'    as const, svg:<rect x="1" y="5" width="16" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/> },
                    ]).map(({ v, svg }) => (
                      <button key={v} className="shp-opt" onClick={() => { updateSelected({ forma: v }); saveSelected({ ...selected, forma: v }) }}
                        style={{
                          width:40, height:36, borderRadius:6, cursor:'pointer',
                          border:`1.5px solid ${selected.forma===v ? C.red : C.rule}`,
                          background: selected.forma===v ? C.redS : C.paper,
                          color: selected.forma===v ? C.red : C.ink3,
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                        <svg width="18" height="18" viewBox="0 0 18 18">{svg}</svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Flechas posición (especialmente útil en móvil) */}
                <div style={{ flex:'0 0 auto' }}>
                  <div style={{ fontSize:11, color:C.ink3, marginBottom:6 }}>Posición</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,32px)', gridTemplateRows:'repeat(3,32px)', gap:3 }}>
                    {[
                      [null, { dx:0,  dy:-GRID }, null],
                      [{ dx:-GRID, dy:0 }, null, { dx:GRID, dy:0 }],
                      [null, { dx:0,  dy:GRID  }, null],
                    ].map((row, ri) => row.map((cell, ci) => (
                      <div key={`${ri}-${ci}`}>
                        {cell ? (
                          <button
                            onPointerDown={e => { e.preventDefault(); moverMesa(cell.dx, cell.dy) }}
                            style={{
                              width:32, height:32, borderRadius:6, border:`1px solid ${C.rule}`,
                              background:C.paper, color:C.ink2, fontSize:14, cursor:'pointer',
                              display:'flex', alignItems:'center', justifyContent:'center',
                            }}>
                            {cell.dy < 0 ? '↑' : cell.dy > 0 ? '↓' : cell.dx < 0 ? '←' : '→'}
                          </button>
                        ) : <div/>}
                      </div>
                    )))}
                  </div>
                </div>

                {/* Borrar */}
                <div style={{ marginLeft:'auto', alignSelf:'flex-end' }}>
                  <button onClick={delSelected} style={{
                    padding:'8px 14px', borderRadius:7,
                    border:`1px solid ${C.rule}`, background:'none',
                    color:C.ink3, fontSize:12, fontFamily:SN, cursor:'pointer',
                    display:'flex', alignItems:'center', gap:5,
                  }}>
                    <Icon d={ICONS.trash} size={13}/>Eliminar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ fontFamily:SM, fontSize:10, color:C.ink4, marginTop:8 }}>
            {isMobile
              ? 'Toca para seleccionar · arrastra con el dedo · usa las flechas para ajuste fino'
              : `Snap ${GRID}px · arrastra con el ratón · toca para editar`}
          </div>
        </div>
      )}

      {/* ══ VISTA LISTA ══════════════════════════════════════════ */}
      {vista === 'lista' && (
        <div>
          {zonas.filter(z => z.activa).map(zona => {
            const ms = mesas.filter(m => m.zona === zona.tipo)
            if (ms.length === 0 && zonas.indexOf(zona) > 0) return null
            return (
              <div key={zona.id} style={{ marginBottom:24 }}>
                <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, letterSpacing:'.14em', color:C.red,
                  textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ background:C.paper2, color:C.ink, fontFamily:SM, fontSize:10, padding:'2px 6px', borderRadius:3, border:`1px solid ${C.rule}` }}>{zona.prefijo}</span>
                  {zona.nombre}
                  <span style={{ color:C.ink4 }}>· {ms.length} mesas</span>
                  <button onClick={() => { setZonaForm({ nombre:zona.nombre, prefijo:zona.prefijo, descripcion:zona.descripcion||'' }); setErr(''); setModal({ editZona: zona }) }}
                    style={{ background:'none', border:'none', cursor:'pointer', padding:0, opacity:.5 }}>
                    <Icon d={ICONS.edit} size={11}/>
                  </button>
                  <button onClick={() => delZona(zona)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, opacity:.4 }}>
                    <Icon d={ICONS.trash} size={11}/>
                  </button>
                </div>
                {ms.length === 0 ? (
                  <div style={{ fontFamily:SN, fontSize:13, color:C.ink4, padding:'10px 0' }}>Sin mesas en esta zona.</div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:8 }}>
                    {ms.map(m => (
                      <div key={m.id} style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:8, padding:'12px 14px',
                        display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                          <div style={{ fontFamily:SM, fontSize:17, fontWeight:700, color:C.ink }}>{m.codigo}</div>
                          {m.nombre && <div style={{ fontFamily:SE, fontSize:12, color:C.ink2, marginTop:1, fontStyle:'italic' }}>{m.nombre}</div>}
                          <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginTop:3 }}>{m.capacidad} pax · {m.forma??'round'}</div>
                        </div>
                        <div style={{ display:'flex', gap:4 }}>
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
        </div>
      )}

      {/* Modales */}
      {modal && (modal === 'zona-create' || (typeof modal === 'object' && 'editZona' in modal)) && (
        <Modal title={modal === 'zona-create' ? 'Nueva zona' : 'Editar zona'} onClose={() => setModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Nombre" value={zonaForm.nombre} onChange={v => setZonaForm(f => ({ ...f, nombre: v }))} placeholder="Terraza VIP"/>
            <Field label="Prefijo (1-2 letras)" value={zonaForm.prefijo} onChange={v => setZonaForm(f => ({ ...f, prefijo: v.toUpperCase().slice(0,2) }))} placeholder="V"/>
            <Field label="Descripción (opcional)" value={zonaForm.descripcion} onChange={v => setZonaForm(f => ({ ...f, descripcion: v }))} placeholder="Zona exterior"/>
            <div style={{ background:C.paper2, borderRadius:4, padding:'8px 12px', fontFamily:SM, fontSize:11, color:C.ink3 }}>
              Prefijo <strong>{zonaForm.prefijo||'V'}</strong> → mesas <strong>{zonaForm.prefijo||'V'}01, {zonaForm.prefijo||'V'}02…</strong>
            </div>
            {err && <div style={{ fontFamily:SM, fontSize:11, color:C.red }}>{err}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveZona}><Icon d={ICONS.check} size={14}/>{modal === 'zona-create' ? 'Crear' : 'Guardar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal === 'create' ? 'Nueva mesa' : 'Editar mesa'} onClose={() => setModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Código (ej. S5)" value={form.codigo} onChange={v => setForm(f => ({ ...f, codigo: v.toUpperCase() }))} placeholder="S5"/>
            <Field label="Nombre (opcional)" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder='ej. "La ventana"'/>
            <Select label="Zona" value={form.zona} onChange={v => setForm(f => ({ ...f, zona: v }))}
              options={zonas.filter(z => z.activa).map(z => ({ value: z.tipo, label: `${z.nombre} (${z.prefijo})` }))}/>
            <Field label="Capacidad" value={form.capacidad} onChange={v => setForm(f => ({ ...f, capacidad: v }))} placeholder="4" type="number"/>
            {err && <div style={{ fontFamily:SM, fontSize:11, color:C.red }}>{err}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={save}><Icon d={ICONS.check} size={14}/>{modal === 'create' ? 'Crear' : 'Guardar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && typeof modal === 'object' && 'del' in modal && (
        <Modal title="Borrar mesa" onClose={() => setModal(null)}>
          <p style={{ fontFamily:SN, fontSize:14, color:C.ink2, marginTop:0 }}>
            ¿Borrar la mesa <strong>{(modal as {del:Mesa}).del.codigo}</strong>?
          </p>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
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
  nif: string | null; razon_social: string | null; logo_url?: string | null
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
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

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

  const uploadLogo = async (file: File) => {
    setLogoUploading(true); setLogoMsg('')
    const fd = new FormData()
    fd.append('logo', file)
    const r = await fetch('/api/owner/logo', { method: 'POST', headers: sh(), body: fd })
    const d = await r.json()
    if (r.ok) {
      setRest(prev => prev ? { ...prev, logo_url: d.logo_url } : prev)
      setLogoMsg('Logo guardado.')
    } else {
      setLogoMsg(d.error ?? 'Error al subir')
    }
    setLogoUploading(false)
    setTimeout(() => setLogoMsg(''), 4000)
  }

  const deleteLogo = async () => {
    setLogoUploading(true)
    await fetch('/api/owner/logo', { method: 'DELETE', headers: sh() })
    setRest(prev => prev ? { ...prev, logo_url: null } : prev)
    setLogoUploading(false)
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

      {/* ── Logo del restaurante ── */}
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, background: C.bone }}>
        <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase', marginBottom: 4 }}>
          LOGO DEL RESTAURANTE
        </div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 16, lineHeight: 1.5 }}>
          Aparece en la carta digital pública y centrado en el QR de mesa. PNG, JPG, WebP o SVG · máx 2 MB.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* Preview */}
          <div style={{
            width: 88, height: 88, borderRadius: 8, flexShrink: 0,
            border: `2px solid ${C.rule}`, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {rest?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rest.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.rule} strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            )}
          </div>
          {/* Acciones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                {logoUploading ? 'Subiendo…' : rest?.logo_url ? 'Cambiar logo' : 'Subir logo'}
              </Btn>
              {rest?.logo_url && (
                <Btn variant="ghost" onClick={deleteLogo} disabled={logoUploading}>
                  Quitar logo
                </Btn>
              )}
            </div>
            {logoMsg && (
              <span style={{ fontFamily: SM, fontSize: 11, color: logoMsg.includes('Error') || logoMsg.includes('supera') ? C.red : C.green }}>
                {logoMsg}
              </span>
            )}
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>
              El logo se adapta automáticamente a cualquier forma o proporción.
            </div>
          </div>
        </div>
        <input
          ref={logoInputRef} type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }}
        />
      </div>

      {/* Datos del restaurante */}
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, background: C.bone }}>
        <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase', marginBottom: 18 }}>
          DATOS DEL RESTAURANTE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
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
  const [impacto, setImpacto] = useState<{ comandas_en_cocina: number; mesas: string[] } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/turno', { headers: sh() })
    const d = await r.json()
    setActivo(d.activo)
    setImpacto(d.impacto_activo ?? null)
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

          {/* Impacto real */}
          {impacto && impacto.comandas_en_cocina > 0 ? (
            <div style={{ background: '#FDE8E4', border: '1px solid #E8B4AD', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.redD, textTransform: 'uppercase', marginBottom: 6 }}>
                ⚠ Hay actividad en curso
              </div>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.redD, lineHeight: 1.5 }}>
                <strong>{impacto.comandas_en_cocina}</strong> comanda{impacto.comandas_en_cocina !== 1 ? 's' : ''} activa{impacto.comandas_en_cocina !== 1 ? 's' : ''} en cocina
                {impacto.mesas.length > 0 && (
                  <span style={{ color: C.redD, opacity: .8 }}> — mesas {impacto.mesas.join(', ')}</span>
                )}
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.redD, opacity: .7, marginTop: 4 }}>
                Asegúrate de que cocina ha despachado todo antes de cerrar.
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: SN, fontSize: 12, color: C.redD, opacity: .7, marginBottom: 14 }}>
              ✓ No hay comandas activas en este turno.
            </div>
          )}

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
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
type Producto = { id: string; nombre: string; descripcion: string | null; precio: number | null; categoria: string; seccion: string; nombre_alternativo: string[]; familia: string | null; activo: boolean; orden: number }
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

function CartaTab({ restauranteId }: { restauranteId: string }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [view, setView] = useState<CartaView>('lista')
  const [productos, setProductos] = useState<Producto[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Producto } | { del: Producto }>(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', precio: '', seccion: '', nombre_alternativo: '', familia: '' })
  const [err, setErr] = useState('')

  // Scanner state
  const [images, setImages] = useState<{ data: string; mediaType: string; preview: string }[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ProductoDraft[] | null>(null)
  const [extractErr, setExtractErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [qrPanelOpen, setQrPanelOpen] = useState(false)

  const SECCIONES_DEFAULT = ['entrantes', 'principales', 'postres', 'bebidas', 'cafes', 'copas', 'otras']

  const load = useCallback(async () => {
    const [rCarta, rSec] = await Promise.all([
      fetch('/api/owner/carta', { headers: sh() }),
      fetch('/api/owner/secciones', { headers: sh() }),
    ])
    const dCarta = await rCarta.json()
    const dSec   = await rSec.json()
    setProductos(dCarta.productos || [])
    setSecciones(dSec.secciones || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const primeraSeccion = secciones[0]?.id || SECCIONES_DEFAULT[0]

  // ── CRUD ──
  const openCreate = () => { setForm({ nombre: '', descripcion: '', precio: '', seccion: primeraSeccion, nombre_alternativo: '', familia: '' }); setErr(''); setModal('create') }
  const openEdit = (p: Producto) => {
    setForm({
      nombre: p.nombre, descripcion: p.descripcion || '',
      precio: p.precio != null ? String(p.precio) : '',
      seccion: p.seccion || 'otras',
      nombre_alternativo: (p.nombre_alternativo || []).join(', '),
      familia: p.familia || '',
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
      categoria: form.seccion,
      nombre_alternativo: aliases,
      familia: form.familia.trim() || null,
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
          <Btn onClick={() => setQrPanelOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
              <path d="M14 14h2v2h-2zM18 14h3M18 16v2M14 18h2v2M18 20h3v-2"/>
            </svg>
            QR y PDF
          </Btn>
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

              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as 'touch' }}>
              <div style={{ minWidth: 560, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone }}>
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
                      {secciones.length > 0
                        ? secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)
                        : SECCIONES_DEFAULT.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)
                      }
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
            </div>
          )}
        </div>
      )}

      {/* ── LISTA VIEW ── */}
      {view === 'lista' && (
        <>
          <FueraCartaSection restauranteId={restauranteId} />
          {productos.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: SE, fontSize: 22, color: C.ink3, marginBottom: 8 }}>Carta vacía</div>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, marginBottom: 20 }}>
                Añade productos manualmente o escanea la carta con IA.
              </div>
              <Btn onClick={() => setView('escanear')}><Icon d={ICONS.sparkle} size={14}/>Escanear carta</Btn>
            </div>
          ) : (
            (Object.entries(byCategoria) as [string, Producto[]][]).map(([cat, ps]) => (
              <div key={cat} style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em',
                  color: C.red, textTransform: 'uppercase', marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 8 }}>
                  {cat}
                  <span style={{ color: C.ink4 }}>· {ps.length}</span>
                </div>
                <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', background: C.bone }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as 'touch' }}>
                  <div style={{ minWidth: 380 }}>
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
              options={secciones.length > 0
                ? secciones.map(s => ({ value: s.id, label: s.nombre }))
                : SECCIONES_DEFAULT.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
              }/>
            <Field label="Aliases (separados por coma)" value={form.nombre_alternativo} onChange={v => setForm(f => ({ ...f, nombre_alternativo: v }))} placeholder="bravas, una de bravas, patatas"/>
            <div>
              <Field label="Familia BRAIN (opcional)" value={form.familia} onChange={v => setForm(f => ({ ...f, familia: v }))} placeholder="vino_tinto"/>
              <div style={{fontFamily:SM,fontSize:10,color:C.ink3,marginTop:4,lineHeight:1.5}}>
                Si varios productos comparten familia, el sistema muestra opciones al camarero cuando hay ambigüedad.<br/>
                Ejemplos: <span style={{color:C.ink2}}>vino_tinto · vino_blanco · cerveza · refresco · postre · vermut</span>
              </div>
            </div>
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

      {qrPanelOpen && <CartaPublicPanel onClose={() => setQrPanelOpen(false)} />}
    </div>
  )
}

/* ─── Tab: Secciones de cocina ─── */
const COLORES_KDS = ['#D9442B','#E8A33B','#3F7D44','#2B6A6E','#7B5EA7','#C4602A','#1A6B9A','#6B5F52']
const ICONOS_SEC  = ['🍽️','🥩','🥗','🍺','☕','🍰','🍳','🥘','🌮','🍕','🥤','🍷']

function SeccionesTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<null | 'create' | { edit: Seccion }>(null)
  const [form, setForm]           = useState({ nombre: '', color_kds: '#D9442B', icono: '🍽️' })
  const [err, setErr]             = useState('')
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/secciones', { headers: sh() })
    const d = await r.json()
    setSecciones(d.secciones || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ nombre: '', color_kds: '#D9442B', icono: '🍽️' }); setErr(''); setModal('create') }
  const openEdit   = (s: Seccion) => { setForm({ nombre: s.nombre, color_kds: s.color_kds||'#D9442B', icono: s.icono||'🍽️' }); setErr(''); setModal({ edit: s }) }

  const save = async () => {
    if (!form.nombre.trim()) return setErr('Nombre requerido')
    setSaving(true); setErr('')
    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const r = await fetch('/api/owner/secciones', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify(isEdit ? { id: (modal as { edit: Seccion }).edit.id, ...form } : form),
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const toggleActiva = async (s: Seccion) => {
    await fetch('/api/owner/secciones', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: s.id, activa: !s.activa }) })
    await load()
  }

  const del = async (s: Seccion) => {
    if (!confirm(`¿Borrar sección "${s.nombre}"?`)) return
    const r = await fetch('/api/owner/secciones', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: s.id }) })
    const d = await r.json()
    if (!r.ok) { alert(d.error); return }
    await load()
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, gap:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontFamily:SE, fontSize:28, fontWeight:500, color:C.ink, marginTop:2 }}>Secciones</div>
          <div style={{ fontFamily:SN, fontSize:13, color:C.ink3, marginTop:4, lineHeight:1.5 }}>
            Cada sección es una partida de cocina o barra. Totalmente personalizable.
          </div>
        </div>
        <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={14}/>Nueva sección</Btn>
      </div>

      {loading ? <div style={{ fontFamily:SM, fontSize:12, color:C.ink3 }}>Cargando...</div>
      : secciones.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 24px', background:C.bone, borderRadius:8, border:`1px dashed ${C.rule}` }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🍽️</div>
          <div style={{ fontFamily:SE, fontSize:18, color:C.ink, marginBottom:6 }}>Sin secciones todavía</div>
          <div style={{ fontFamily:SN, fontSize:13, color:C.ink3, marginBottom:16 }}>Crea tu primera sección — cocina caliente, fría, barra, postres...</div>
          <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={14}/>Crear primera sección</Btn>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {secciones.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:C.bone, border:`1px solid ${C.rule}`, borderRadius:6, opacity:s.activa===false?0.55:1, borderLeft:`4px solid ${s.color_kds||C.red}` }}>
              <span style={{ fontSize:20 }}>{s.icono||'🍽️'}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:14, color:C.ink }}>{s.nombre}</div>
                <div style={{ fontFamily:SM, fontSize:10, color:C.ink3, marginTop:2 }}>{s.id}</div>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
                <button onClick={() => toggleActiva(s)} style={{ background:'none', border:`1px solid ${C.rule}`, borderRadius:3, padding:'3px 8px', fontFamily:SM, fontSize:9, letterSpacing:'.08em', color:C.ink3, cursor:'pointer', textTransform:'uppercase' }}>
                  {s.activa===false?'Activar':'Ocultar'}
                </button>
                <Btn variant="ghost" onClick={() => openEdit(s)}><Icon d={ICONS.edit} size={13}/>Editar</Btn>
                <Btn variant="danger" onClick={() => del(s)}><Icon d={ICONS.trash} size={13}/></Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal==='create'?'Nueva sección':'Editar sección'} onClose={() => setModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Nombre" value={form.nombre} onChange={v => setForm(f=>({...f,nombre:v}))} placeholder="ej. Cocina caliente"/>
            <div>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, letterSpacing:'.12em', color:C.ink3, textTransform:'uppercase', marginBottom:8 }}>Icono</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {ICONOS_SEC.map(ic => (
                  <button key={ic} onClick={() => setForm(f=>({...f,icono:ic}))} style={{ fontSize:20, padding:'6px 8px', borderRadius:6, cursor:'pointer', border:`2px solid ${form.icono===ic?C.red:C.rule}`, background:form.icono===ic?C.redS:C.paper }}>{ic}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, letterSpacing:'.12em', color:C.ink3, textTransform:'uppercase', marginBottom:8 }}>Color en KDS</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                {COLORES_KDS.map(c => (
                  <button key={c} onClick={() => setForm(f=>({...f,color_kds:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${form.color_kds===c?C.ink:'transparent'}` }}/>
                ))}
                <input type="color" value={form.color_kds} onChange={e => setForm(f=>({...f,color_kds:e.target.value}))} style={{ width:28, height:28, padding:0, border:`1px solid ${C.rule}`, borderRadius:4, cursor:'pointer' }} title="Color personalizado"/>
              </div>
            </div>
            <div style={{ background:C.paper2, border:`1px solid ${C.rule}`, borderRadius:6, padding:'10px 14px', borderLeft:`4px solid ${form.color_kds}` }}>
              <div style={{ fontFamily:SM, fontSize:10, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Vista previa KDS</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>{form.icono}</span>
                <span style={{ fontWeight:600, fontSize:14 }}>{form.nombre||'Nombre de la sección'}</span>
              </div>
            </div>
            {err && <div style={{ fontFamily:SM, fontSize:11, color:C.red }}>{err}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} disabled={saving}><Icon d={ICONS.check} size={14}/>{saving?'Guardando...':modal==='create'?'Crear':'Guardar'}</Btn>
            </div>
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
const seccionStyle  = (id: string) => SECCIONES_IMP.find(s => s.value === id) ?? { value: id, label: id, color: '#E5DAC2', text: '#4B4036' }
const seccionStyles = (ids: string[]) => ids.map(id => seccionStyle(id))
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
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [editando, setEditando]         = useState<Impresora | null>(null)
  const [modal, setModal]               = useState<null | 'create' | 'bridge' | { del: Impresora }>(null)
  const [testResult, setTestResult]     = useState<Record<string, { status: 'testing'|'ok'|'error'|'timeout', msg?: string }>>({})  // impresora_id → resultado test
  const [form, setForm]                 = useState({
    nombre: '', secciones_ids: ['calientes'] as string[], connection_type: 'ip_local',
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
        secciones_ids:  editando.secciones_ids?.length > 0 ? editando.secciones_ids : [editando.seccion_id],
        seccion_id:     editando.secciones_ids?.[0] ?? editando.seccion_id,
        connection_type: editando.connection_type,
        ip_address:     editando.ip_address,
        port:           editando.port,
        cloud_device_id: editando.cloud_device_id,
        modelo:         editando.modelo,
        impresora_fallback_id: editando.impresora_fallback_id || null,
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
        secciones_ids:   form.secciones_ids,
        seccion_id:      form.secciones_ids[0] ?? 'calientes',
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
    setForm({ nombre: '', secciones_ids: ['calientes'], connection_type: 'ip_local', ip_address: '', port: '9100', cloud_device_id: '', modelo: '' })
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
    setTestResult(prev => ({ ...prev, [id]: { status: 'testing' } }))
    try {
      const res  = await fetch('/api/print', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ trigger: 'test', impresora_id: id })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.job_id) {
        setTestResult(prev => ({ ...prev, [id]: { status: 'error', msg: body.error ?? 'No se pudo crear job' } }))
        setTimeout(() => setTestResult(prev => { const n = {...prev}; delete n[id]; return n }), 6000)
        return
      }
      // Polling hasta confirmar resultado (max 20s)
      const jobId    = body.job_id
      const deadline = Date.now() + 20000
      let   done     = false
      while (!done && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500))
        const sb = await fetch(`/api/owner/print-jobs?job_id=${jobId}`, { headers: sh() }).then(r => r.json()).catch(() => null)
        const job = sb?.jobs?.find((j: { id: string }) => j.id === jobId)
        if (job?.status === 'impreso') {
          setTestResult(prev => ({ ...prev, [id]: { status: 'ok' } }))
          done = true
        } else if (job?.status === 'error') {
          setTestResult(prev => ({ ...prev, [id]: { status: 'error', msg: job.error_msg ?? 'Error en impresora' } }))
          done = true
        }
      }
      if (!done) setTestResult(prev => ({ ...prev, [id]: { status: 'timeout', msg: 'Bridge no respondió en 20s' } }))
    } catch (e) {
      setTestResult(prev => ({ ...prev, [id]: { status: 'error', msg: String(e) } }))
    }
    setTimeout(() => setTestResult(prev => { const n = {...prev}; delete n[id]; return n }), 8000)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => setModal('bridge')}><Icon d={ICONS.wifi} size={14}/>Bridge local</Btn>
          <Btn variant="primary" onClick={() => { setErr(''); setModal('create') }}>
            <Icon d={ICONS.plus} size={15}/>Añadir impresora
          </Btn>
        </div>
      </div>

      {/* Nota compatibilidad hardware */}
      <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.amber, fontWeight: 800, letterSpacing: '.08em', marginTop: 1, whiteSpace: 'nowrap' }}>ℹ COMPATIBILIDAD</div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
          ia.rest garantiza compatibilidad 100% con impresoras <strong style={{ color: C.ink2 }}>ESC/POS TCP</strong> (IP local vía bridge) y <strong style={{ color: C.ink2 }}>Star CloudPRNT</strong> (modelos LAN/WiFi).
          Otras impresoras pueden funcionar pero no están oficialmente soportadas.{' '}
          <span style={{ color: C.ink4 }}>Modelos validados: Star TSP143IIILAN · Star TSP143IIIW · Epson TM-T20III LAN · Sunmi NT311.</span>
        </div>
      </div>

      {/* Lista impresoras */}
      {impresoras.length === 0 ? (
        <div style={{ border: `1px dashed ${C.rule}`, borderRadius: 8, padding: '48px 24px', textAlign: 'center', color: C.ink4, fontFamily: SN, fontSize: 14, marginBottom: 32 }}>
          <div style={{ color: C.ink3, fontWeight: 600, marginBottom: 4 }}>Sin impresoras configuradas</div>
          <div style={{ fontSize: 13 }}>Añade la primera para empezar a imprimir tickets automáticamente</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, background: C.bone, marginBottom: 32, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as 'touch' }}>
          <div style={{ minWidth: 580 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 80px 120px', padding: '10px 20px', borderBottom: `1px solid ${C.rule}`, fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>
            <span>Impresora</span><span>Sección</span><span>Conexión</span><span>Ping</span><span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {impresoras.map((imp, i) => {
            const secsBadges = seccionStyles(imp.secciones_ids?.length > 0 ? imp.secciones_ids : (imp.seccion_id ? [imp.seccion_id] : []))
            const isOnline  = imp.ultimo_ping && Date.now() - new Date(imp.ultimo_ping).getTime() < 35000
            const testState = testResult[imp.id]
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
                        <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Secciones</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {SECCIONES_IMP.map(s => {
                            const eds = editando.secciones_ids?.length > 0 ? editando.secciones_ids : (editando.seccion_id ? [editando.seccion_id] : [])
                            const sel = eds.includes(s.value)
                            return (
                              <button key={s.value} type="button"
                                onClick={() => {
                                  const cur = editando.secciones_ids?.length > 0 ? editando.secciones_ids : (editando.seccion_id ? [editando.seccion_id] : [])
                                  const next = sel ? cur.filter(x => x !== s.value) : [...cur, s.value]
                                  if (next.length === 0) return // al menos una
                                  setEditando(ed => ed ? { ...ed, secciones_ids: next, seccion_id: next[0] } : null)
                                }}
                                style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', border: `1.5px solid ${sel ? s.text : C.rule}`, background: sel ? s.color : C.bone, color: sel ? s.text : C.ink3, transition: 'all .15s' }}>
                                {sel ? '✓ ' : ''}{s.label.split(' ')[0]}
                              </button>
                            )
                          })}
                        </div>
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
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontFamily: SN, fontSize: 12, color: C.ink3, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                        Impresora de fallback (si falla la principal)
                      </label>
                      <select
                        value={editando.impresora_fallback_id ?? ''}
                        onChange={e => setEditando(ed => ed ? { ...ed, impresora_fallback_id: e.target.value || null } : null)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.rule}`, background: C.bone, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none' }}
                      >
                        <option value="">Sin fallback</option>
                        {impresoras.filter(i => i.id !== editando.id).map(i => (
                          <option key={i.id} value={i.id}>🖨️ {i.nombre}</option>
                        ))}
                      </select>
                    </div>
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
                      {imp.impresora_fallback_id && (
                        <div style={{ fontFamily: SM, fontSize: 10, color: C.amber, marginTop: 2 }}>
                          ↩ fallback: {impresoras.find(i => i.id === imp.impresora_fallback_id)?.nombre ?? imp.impresora_fallback_id}
                        </div>
                      )}
                    </div>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {secsBadges.map(sec => (
                        <span key={sec.value} style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', background: sec.color, color: sec.text, padding: '3px 8px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                          {sec.label.split(' ')[0].toUpperCase()}
                        </span>
                      ))}
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                      {CONN_TYPES.find(ct => ct.value === imp.connection_type)?.label ?? imp.connection_type}
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 11, color: isOnline ? C.green : C.ink4, fontWeight: isOnline ? 700 : 400 }}>
                      {isOnline ? 'ONLINE' : fmtPing(imp.ultimo_ping)}
                    </span>
                    <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => testPrint(imp.id)}
                        disabled={!!testState}
                        title="Test de impresión"
                        style={{
                          background: testState?.status === 'ok' ? C.greenS : testState?.status === 'error' || testState?.status === 'timeout' ? '#3D1010' : testState?.status === 'testing' ? C.paper2 : C.paper2,
                          color:      testState?.status === 'ok' ? C.green  : testState?.status === 'error' || testState?.status === 'timeout' ? C.red : C.ink3,
                          border: `1px solid ${testState?.status === 'ok' ? C.green : testState?.status === 'error' || testState?.status === 'timeout' ? C.red : C.rule}`,
                          borderRadius: 4, padding: '5px 8px', cursor: testState ? 'not-allowed' : 'pointer',
                          fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                          transition: 'all .2s',
                        }}>
                        {testState?.status === 'testing' ? '⏳ ...' : testState?.status === 'ok' ? '✓ OK' : testState?.status === 'error' ? '✗ ERROR' : testState?.status === 'timeout' ? '⏱ TIMEOUT' : 'TEST'}
                      </button>
                      <Btn size="sm" onClick={() => setEditando({...imp})}><Icon d={ICONS.edit} size={13}/></Btn>
                      <Btn size="sm" variant="danger" onClick={() => setModal({ del: imp })}><Icon d={ICONS.trash} size={13}/></Btn>
                      </span>
                      {(testState?.status === 'error' || testState?.status === 'timeout') && testState.msg && (
                        <div style={{ fontFamily: SM, fontSize: 9, color: C.red, letterSpacing: '.04em', maxWidth: 180, textAlign: 'right', lineHeight: 1.4 }}>
                          {testState.msg}
                        </div>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          </div>{/* /minWidth impresoras */}
        </div>
      )}

      {/* Print Jobs recientes */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase', marginBottom: 12 }}>Últimos jobs · polling 5s</div>
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, background: C.bone, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as 'touch' }}>
          <div style={{ minWidth: 480 }}>
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
          </div>{/* /minWidth printjobs */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Secciones</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SECCIONES_IMP.map(s => {
                  const sel = form.secciones_ids.includes(s.value)
                  return (
                    <button key={s.value} type="button"
                      onClick={() => {
                        const next = sel ? form.secciones_ids.filter(x => x !== s.value) : [...form.secciones_ids, s.value]
                        if (next.length === 0) return
                        setForm(f => ({ ...f, secciones_ids: next }))
                      }}
                      style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', border: `1.5px solid ${sel ? s.text : C.rule}`, background: sel ? s.color : C.bone, color: sel ? s.text : C.ink3, transition: 'all .15s' }}>
                      {sel ? '✓ ' : ''}{s.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>Selecciona las secciones que recibirán tickets en esta impresora</div>
            </div>
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
                'export IAREST_API=https://www.iarest.es',
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
                          onClick={() => {
                            const copy = (text: string) => {
                              if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(text).catch(() => {
                                  const el = document.createElement('textarea')
                                  el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
                                  document.body.appendChild(el); el.select(); document.execCommand('copy')
                                  document.body.removeChild(el)
                                })
                              } else {
                                const el = document.createElement('textarea')
                                el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
                                document.body.appendChild(el); el.select(); document.execCommand('copy')
                                document.body.removeChild(el)
                              }
                              setCopiedTokenId(bt.id)
                              setTimeout(() => setCopiedTokenId(null), 2000)
                            }
                            copy(bt.token)
                          }}
                          style={{ background: copiedTokenId === bt.id ? C.green : C.paper2, color: copiedTokenId === bt.id ? '#fff' : C.ink3, border: `1px solid ${copiedTokenId === bt.id ? C.green : C.rule}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontFamily: SM, fontSize: 10, fontWeight: 700, transition: 'all .2s' }}>
                          {copiedTokenId === bt.id ? '✓ COPIADO' : 'COPIAR'}
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
  nombre: string | null
  zona_tipo: string | null
  zona_tipos: string[]
  seccion_id: string | null
  seccion_ids: string[]
  producto_ids: string[]
  destino_tipo: 'impresora' | 'kds'
  destino_ref: string
  destino_kds_ref: string | null
  destino_nombre: string | null
  prioridad: number
  activa: boolean
  es_fallback: boolean
  imprimir_al_marchar: boolean
  impresora_pase_id: string | null
  hora_desde: string | null
  hora_hasta: string | null
}
type CatImp      = { id: string; nombre: string; seccion_id: string; connection_type: string }
type CatSec      = { id: string; nombre: string; color_kds: string; icono: string }
type CatZona     = { id: string; tipo: string; nombre: string }
type CatProducto = { id: string; nombre: string; seccion: string; precio: number }

function FlujoTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [reglas,     setReglas]     = useState<ReglaEnvio[]>([])
  const [impresoras, setImpresoras] = useState<CatImp[]>([])
  const [secciones,  setSecciones]  = useState<CatSec[]>([])
  const [zonas,      setZonas]      = useState<CatZona[]>([])
  const [productos,  setProductos]  = useState<CatProducto[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')
  const [ordenModified, setOrdenModified] = useState(false)
  const [savingOrden,   setSavingOrden]   = useState(false)
  const [dragging,  setDragging]  = useState<string | null>(null)
  const [dragOver,  setDragOver]  = useState<string | null>(null)
  // tree: which sections are expanded in the product picker
  const [secAbiertas, setSecAbiertas] = useState<Set<string>>(new Set())
  // simulator
  const [simOpen,    setSimOpen]    = useState(false)
  const [simProdId,  setSimProdId]  = useState('')
  const [simZona,    setSimZona]    = useState('')
  const [simResult,  setSimResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  const [form, setForm] = useState({
    nombre:              '',
    zona_tipos:          [] as string[],
    seccion_ids:         [] as string[],
    producto_ids:        [] as string[],
    dest_imp:            true,
    dest_kds:            false,
    destino_imp_ref:     '',
    destino_kds_ref:     '',
    es_fallback:         false,
    imprimir_al_marchar: false,
    impresora_pase_id:   '',
    hora_desde:          '',
    hora_hasta:          '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/owner/reglas-envio', { headers: sh() })
    if (r.ok) {
      const d = await r.json()
      setReglas(d.reglas); setImpresoras(d.impresoras)
      setSecciones(d.secciones); setZonas(d.zonas)
      setProductos(d.productos ?? [])
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = () => {
    setForm({ nombre:'', zona_tipos:[], seccion_ids:[], producto_ids:[],
      dest_imp:true, dest_kds:false, destino_imp_ref:'', destino_kds_ref:'',
      es_fallback:false, imprimir_al_marchar:false, impresora_pase_id:'',
      hora_desde:'', hora_hasta:'' })
    setSecAbiertas(new Set())
    setErr('')
    setModal(true)
  }

  // ── Zone multi-checkbox ──
  const toggleZona = (tipo: string) =>
    setForm(f => ({ ...f, zona_tipos: f.zona_tipos.includes(tipo) ? f.zona_tipos.filter(z => z !== tipo) : [...f.zona_tipos, tipo] }))
  const toggleTodasZonas = () =>
    setForm(f => ({ ...f, zona_tipos: f.zona_tipos.length === zonas.length ? [] : zonas.map(z => z.tipo) }))

  // ── Section + product tree ──
  const prodsBySeccion = (sid: string) => productos.filter(p => p.seccion === sid)

  type SecState = 'none' | 'some' | 'all'
  const seccionState = (sid: string): SecState => {
    if (form.seccion_ids.includes(sid)) return 'all'
    const prods = prodsBySeccion(sid)
    const sel = prods.filter(p => form.producto_ids.includes(p.id))
    if (sel.length === 0) return 'none'
    if (sel.length === prods.length) return 'all'
    return 'some'
  }

  const toggleSeccion = (sid: string) => {
    const state = seccionState(sid)
    const prods = prodsBySeccion(sid).map(p => p.id)
    if (state === 'all') {
      setForm(f => ({
        ...f,
        seccion_ids:  f.seccion_ids.filter(s => s !== sid),
        producto_ids: f.producto_ids.filter(pid => !prods.includes(pid)),
      }))
    } else {
      setForm(f => ({
        ...f,
        seccion_ids:  [...new Set([...f.seccion_ids, sid])],
        producto_ids: f.producto_ids.filter(pid => !prods.includes(pid)),
      }))
    }
  }

  const toggleProducto = (pid: string, sid: string) => {
    const seccionFull = form.seccion_ids.includes(sid)
    const prods = prodsBySeccion(sid)

    setForm(f => {
      let pids = [...f.producto_ids]
      let sids = [...f.seccion_ids]

      if (seccionFull) {
        // Expand from "whole section" → deselect only this product
        const otrosIds = prods.filter(p => p.id !== pid).map(p => p.id)
        pids = [...new Set([...pids, ...otrosIds])]
        sids = sids.filter(s => s !== sid)
      } else if (pids.includes(pid)) {
        pids = pids.filter(p => p !== pid)
      } else {
        pids = [...pids, pid]
        // If all products now selected → collapse to section level
        if (prods.every(p => pids.includes(p.id))) {
          pids = pids.filter(p => !prods.map(pr => pr.id).includes(p))
          sids = [...new Set([...sids, sid])]
        }
      }
      return { ...f, producto_ids: pids, seccion_ids: sids }
    })
  }

  const isProdChecked = (pid: string, sid: string) =>
    form.seccion_ids.includes(sid) || form.producto_ids.includes(pid)

  // ── Simulator (client-side mirror of courier logic) ──
  const simular = () => {
    if (!simProdId) { setSimResult({ ok:false, msg:'Selecciona un producto' }); return }
    const prod = productos.find(p => p.id === simProdId)
    if (!prod) { setSimResult({ ok:false, msg:'Producto no encontrado' }); return }

    const seccion = prod.seccion
    const zona    = simZona || null
    const now     = new Date()
    const hhmm    = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    const horaOk = (desde: string|null, hasta: string|null) => {
      if (!desde || !hasta) return true
      return desde <= hasta ? hhmm >= desde && hhmm <= hasta : hhmm >= desde || hhmm <= hasta
    }

    const evaluar = (candidatas: ReglaEnvio[]) => {
      return candidatas
        .filter(r => {
          if (!horaOk(r.hora_desde, r.hora_hasta)) return false
          const zonaTypes = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
          if (zonaTypes.length > 0 && !zonaTypes.includes(zona ?? '')) return false
          const prodIds = r.producto_ids ?? []
          if (prodIds.length > 0) return prodIds.includes(simProdId)
          const ids = r.seccion_ids?.length > 0 ? r.seccion_ids : (r.seccion_id ? [r.seccion_id] : [])
          return ids.length === 0 || ids.includes(seccion)
        })
        .map(r => {
          const zonaTypes = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
          const ids = r.seccion_ids?.length > 0 ? r.seccion_ids : (r.seccion_id ? [r.seccion_id] : [])
          return {
            r,
            score: r.prioridad * 100
              + (zonaTypes.length > 0   ? 10 : 0)
              + ((r.producto_ids?.length ?? 0) > 0 ?  8 : 0)
              + (ids.length > 0         ?  5 : 0)
              + (r.hora_desde           ?  2 : 0),
          }
        })
        .sort((a,b) => b.score - a.score)[0]?.r ?? null
    }

    const activas   = reglas.filter(r => r.activa && !r.es_fallback)
    const fallbacks = reglas.filter(r => r.activa && r.es_fallback)
    const regla = evaluar(activas) ?? evaluar(fallbacks)

    if (!regla) {
      setSimResult({ ok:false, msg:`Sin regla → fallback legacy (impresora de sección "${seccion}")` })
      return
    }

    const destinos: string[] = []
    if (regla.destino_tipo === 'impresora') {
      const imp = impresoras.find(i => i.id === regla.destino_ref)
      if (imp) destinos.push(`🖨️ ${imp.nombre}`)
    }
    if (regla.destino_tipo === 'kds' || regla.destino_kds_ref) {
      const kdsRef = regla.destino_tipo === 'kds' ? regla.destino_ref : regla.destino_kds_ref
      const sec = secciones.find(s => s.id === kdsRef)
      if (sec) destinos.push(`📺 KDS · ${sec.nombre}`)
    }
    if (regla.imprimir_al_marchar && regla.impresora_pase_id) {
      const imp = impresoras.find(i => i.id === regla.impresora_pase_id)
      if (imp) destinos.push(`🖨️ Pase: ${imp.nombre}`)
    }

    const label = regla.nombre ? `"${regla.nombre}"` : `Regla #${regla.prioridad}`
    setSimResult({
      ok: true,
      msg: `${label}${regla.es_fallback ? ' (fallback)' : ''} → ${destinos.join(' + ')}`,
    })
  }

  // ── Save ──
  const guardar = async () => {
    if (!form.dest_imp && !form.dest_kds) return setErr('Selecciona al menos un destino')
    if (form.dest_imp && !form.destino_imp_ref) return setErr('Selecciona la impresora')
    if (form.dest_kds && !form.destino_kds_ref) return setErr('Selecciona la sección KDS')
    if (form.imprimir_al_marchar && !form.impresora_pase_id) return setErr('Selecciona la impresora de pase')

    setSaving(true); setErr('')

    // Determinar destino_tipo/destino_ref para backward compat
    let destino_tipo: 'impresora' | 'kds' = 'impresora'
    let destino_ref  = ''
    let destino_nombre = ''
    let destino_kds_ref: string | null = null

    if (form.dest_imp && form.destino_imp_ref) {
      destino_tipo   = 'impresora'
      destino_ref    = form.destino_imp_ref
      destino_nombre = impresoras.find(i => i.id === form.destino_imp_ref)?.nombre ?? ''
      if (form.dest_kds && form.destino_kds_ref) destino_kds_ref = form.destino_kds_ref
    } else if (form.dest_kds && form.destino_kds_ref) {
      destino_tipo   = 'kds'
      destino_ref    = form.destino_kds_ref
      destino_nombre = secciones.find(s => s.id === form.destino_kds_ref)?.nombre ?? ''
    }

    const noFallbacks = reglas.filter(r => !r.es_fallback)
    const r = await fetch('/api/owner/reglas-envio', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre:              form.nombre || null,
        zona_tipos:          form.zona_tipos,
        seccion_ids:         form.seccion_ids,
        producto_ids:        form.producto_ids,
        destino_tipo, destino_ref, destino_nombre, destino_kds_ref,
        es_fallback:         form.es_fallback,
        prioridad:           form.es_fallback ? 0 : noFallbacks.length + 1,
        imprimir_al_marchar: form.imprimir_al_marchar,
        impresora_pase_id:   form.impresora_pase_id || null,
        hora_desde:          form.hora_desde || null,
        hora_hasta:          form.hora_hasta || null,
      }),
    })
    if (!r.ok) setErr('Error al guardar')
    else { setModal(false); load() }
    setSaving(false)
  }

  const toggleActiva = async (regla: ReglaEnvio) => {
    await fetch('/api/owner/reglas-envio', { method:'PATCH', headers:{...sh(),'Content-Type':'application/json'}, body:JSON.stringify({ id:regla.id, activa:!regla.activa }) })
    load()
  }
  const guardarOrden = async () => {
    setSavingOrden(true)
    const noFb = reglas.filter(r => !r.es_fallback)
    for (let i = 0; i < noFb.length; i++) {
      await fetch('/api/owner/reglas-envio', { method:'PATCH', headers:{...sh(),'Content-Type':'application/json'}, body:JSON.stringify({ id:noFb[i].id, prioridad:noFb.length-i }) })
    }
    setSavingOrden(false); setOrdenModified(false); load()
  }
  const handleDrop = (targetId: string) => {
    if (!dragging || dragging === targetId) return
    const from = reglas.findIndex(x => x.id === dragging)
    const to   = reglas.findIndex(x => x.id === targetId)
    const newR = [...reglas]; const [m] = newR.splice(from,1); newR.splice(to,0,m)
    setReglas(newR); setOrdenModified(true); setDragging(null); setDragOver(null)
  }
  const borrar = async (id: string) => {
    if (!confirm('¿Eliminar esta regla?')) return
    await fetch('/api/owner/reglas-envio', { method:'DELETE', headers:{...sh(),'Content-Type':'application/json'}, body:JSON.stringify({ id }) })
    load()
  }

  // ── Helpers de display ──
  const zonasDeRegla = (r: ReglaEnvio) => {
    const tipos = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
    return tipos.map(t => zonas.find(z => z.tipo === t)?.nombre ?? t)
  }
  const secsDeRegla = (r: ReglaEnvio) =>
    (r.seccion_ids?.length > 0 ? r.seccion_ids : (r.seccion_id ? [r.seccion_id] : []))
      .map(id => secciones.find(s => s.id === id) ?? { id, nombre:id, color_kds:C.ink4, icono:'' })
  const nProdsLabel = (r: ReglaEnvio) => {
    const n = r.producto_ids?.length ?? 0
    if (n === 0) return null
    const names = r.producto_ids.slice(0,2).map(id => productos.find(p=>p.id===id)?.nombre ?? '').filter(Boolean)
    return n <= 2 ? names.join(', ') : `${names[0]} +${n-1}`
  }
  const destinoLabel = (r: ReglaEnvio) => {
    const parts: string[] = []
    if (r.destino_tipo === 'impresora') {
      parts.push(`🖨️ ${r.destino_nombre ?? r.destino_ref}`)
      if (r.destino_kds_ref) {
        const sec = secciones.find(s => s.id === r.destino_kds_ref)
        parts.push(`📺 ${sec?.nombre ?? r.destino_kds_ref}`)
      }
    } else {
      parts.push(`📺 ${r.destino_nombre ?? r.destino_ref}`)
    }
    return parts.join(' + ')
  }

  // ── Styles ──
  const inputSt: React.CSSProperties = { width:'100%', padding:'8px 10px', borderRadius:6, border:`1px solid ${C.rule}`, background:C.bone, fontFamily:SN, fontSize:13, color:C.ink, outline:'none', boxSizing:'border-box' }
  const labelSt: React.CSSProperties = { fontFamily:SN, fontSize:12, color:C.ink3, fontWeight:600, marginBottom:4, display:'block' }

  const Chk = ({ checked, indeterminate, onClick }: { checked:boolean; indeterminate?:boolean; onClick:()=>void }) => (
    <div onClick={onClick} style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`2px solid ${checked||indeterminate?C.red:C.rule}`, background:checked?C.red:indeterminate?C.redS:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
      {checked    && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1 4 3.5 7 8 1" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
      {!checked && indeterminate && <div style={{ width:8, height:2, background:C.red, borderRadius:1 }} />}
    </div>
  )

  const toggleBtn = (active: boolean, label: string, onClick: ()=>void) => (
    <button onClick={onClick} style={{ flex:1, padding:'8px 0', border:`2px solid ${active?C.red:C.rule}`, borderRadius:8, background:active?C.redS:'transparent', fontFamily:SN, fontSize:13, fontWeight:600, color:active?C.red:C.ink3, cursor:'pointer' }}>
      {label}
    </button>
  )

  return (
    <div style={{ padding:'20px 0' }}>

      {/* ── Cabecera ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <div style={{ fontFamily:SE, fontSize:20, fontWeight:700, color:C.ink }}>Flujos de trabajo</div>
          <div style={{ fontFamily:SN, fontSize:13, color:C.ink3, marginTop:4 }}>
            Define a dónde va cada comanda según zona, sección, producto y horario.
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {ordenModified && (
            <button onClick={guardarOrden} disabled={savingOrden} style={{ background:C.green, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
              {savingOrden?'Guardando…':'↕ Guardar orden'}
            </button>
          )}
          <button onClick={openModal} style={{ background:C.red, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
            <Icon d={ICONS.plus} size={15}/> Nueva regla
          </button>
        </div>
      </div>

      {/* ── Aviso sin terminales ── */}
      {!loading && impresoras.length===0 && secciones.length===0 && (
        <div style={{ background:C.amberS, border:`1px solid ${C.amber}`, borderRadius:8, padding:'12px 16px', fontFamily:SN, fontSize:13, color:C.ink2, marginBottom:16 }}>
          ⚠️ No hay impresoras activas ni secciones de cocina. Configúralos primero.
        </div>
      )}

      {/* ── Simulador ── */}
      <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:10, marginBottom:16, overflow:'hidden' }}>
        <div onClick={()=>setSimOpen(v=>!v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', cursor:'pointer', userSelect:'none' }}>
          <span style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:C.ink }}>🎯 Simulador</span>
          <span style={{ fontFamily:SN, fontSize:12, color:C.ink4 }}>— prueba una regla antes de abrir el restaurante</span>
          <span style={{ marginLeft:'auto', color:C.ink4, fontSize:12 }}>{simOpen?'▲':'▼'}</span>
        </div>
        {simOpen && (
          <div style={{ padding:'0 14px 14px', borderTop:`1px solid ${C.rule}` }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:8, marginTop:12, alignItems:'flex-end' }}>
              <div>
                <label style={labelSt}>Producto</label>
                <select value={simProdId} onChange={e=>setSimProdId(e.target.value)} style={inputSt}>
                  <option value="">— Selecciona —</option>
                  {secciones.map(s => (
                    <optgroup key={s.id} label={`${s.icono} ${s.nombre}`}>
                      {prodsBySeccion(s.id).map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                  {productos.filter(p => !secciones.some(s=>s.id===p.seccion)).map(p=>(
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelSt}>Zona de la mesa</label>
                <select value={simZona} onChange={e=>setSimZona(e.target.value)} style={inputSt}>
                  <option value="">— Sin zona —</option>
                  {zonas.map(z=><option key={z.tipo} value={z.tipo}>{z.nombre}</option>)}
                </select>
              </div>
              <button onClick={simular} style={{ background:C.red, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                Probar →
              </button>
            </div>
            {simResult && (
              <div style={{ marginTop:10, padding:'10px 12px', borderRadius:8, background:simResult.ok?C.greenS:C.redS, border:`1px solid ${simResult.ok?C.green:C.red}`, fontFamily:SM, fontSize:12, color:simResult.ok?C.green:C.red }}>
                {simResult.msg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Leyenda prioridad ── */}
      <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:8, padding:'10px 14px', marginBottom:16, fontFamily:SN, fontSize:12, color:C.ink3, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px' }}>
        <div style={{ gridColumn:'1/-1', fontWeight:700, color:C.ink2, marginBottom:2 }}>Orden de cascada · Arrastra para reordenar</div>
        <div>1. Producto específico + zona</div><div>3. Sección + zona</div>
        <div>2. Producto específico</div>        <div>4. Sección · 5. Global · 6. Fallback</div>
      </div>

      {/* ── Lista de reglas ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:C.ink4, fontFamily:SN }}>Cargando…</div>
      ) : reglas.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:C.ink4, fontFamily:SN, border:`2px dashed ${C.rule}`, borderRadius:12 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🔀</div>
          <div style={{ fontWeight:600, marginBottom:4 }}>Sin flujos configurados</div>
          <div style={{ fontSize:12 }}>Todas las comandas se enrutan según la configuración de impresoras estándar</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {/* Fallback separator */}
          {reglas.some(r=>r.es_fallback) && reglas.some(r=>!r.es_fallback) && (() => {
            const firstFb = reglas.findIndex(r=>r.es_fallback)
            return reglas.map((r: ReglaEnvio, i: number) => [
              i === firstFb ? (
                <div key="sep-fb" style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                  <div style={{ flex:1, height:1, background:C.rule }} />
                  <span style={{ fontFamily:SN, fontSize:11, color:C.ink4, fontWeight:600 }}>FALLBACK — si ninguna regla aplica</span>
                  <div style={{ flex:1, height:1, background:C.rule }} />
                </div>
              ) : null,
              <ReglaRow key={r.id} r={r as ReglaEnvio}
                isDragging={dragging===r.id} isDragOver={dragOver===r.id}
                onDragStart={()=>{ setDragging(r.id) }}
                onDragOver={(e: React.DragEvent)=>{e.preventDefault();setDragOver(r.id)}}
                onDragLeave={()=>{ setDragOver(null) }}
                onDrop={()=>handleDrop(r.id)}
                onDragEnd={()=>{setDragging(null);setDragOver(null)}}
                zonasLabel={zonasDeRegla(r) as string[]}
                secsLabel={secsDeRegla(r)}
                prodsLabel={nProdsLabel(r)}
                destinoLabel={destinoLabel(r)}
                onToggle={()=>{ void toggleActiva(r) }}
                onDelete={()=>{ void borrar(r.id) }}
              />
            ])
          })()}
          {!(reglas.some(r=>r.es_fallback) && reglas.some(r=>!r.es_fallback)) && reglas.map(r => (
            <ReglaRow key={r.id} r={r as ReglaEnvio}
              isDragging={dragging===r.id} isDragOver={dragOver===r.id}
              onDragStart={()=>{ setDragging(r.id) }}
              onDragOver={(e: React.DragEvent)=>{e.preventDefault();setDragOver(r.id)}}
              onDragLeave={()=>{ setDragOver(null) }}
              onDrop={()=>handleDrop(r.id)}
              onDragEnd={()=>{setDragging(null);setDragOver(null)}}
              zonasLabel={zonasDeRegla(r) as string[]}
              secsLabel={secsDeRegla(r)}
              prodsLabel={nProdsLabel(r)}
              destinoLabel={destinoLabel(r)}
              onToggle={()=>{ void toggleActiva(r) }}
              onDelete={()=>{ void borrar(r.id) }}
            />
          ))}
        </div>
      )}

      {/* ── Modal nueva regla ── */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(26,23,20,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}
          onClick={e=>{ if (e.target===e.currentTarget) setModal(false) }}>
          <div style={{ background:C.paper, borderRadius:14, padding:24, width:'100%', maxWidth:500, boxShadow:'0 8px 32px rgba(26,23,20,.2)', maxHeight:'92vh', overflowY:'auto' }}>

            <div style={{ fontFamily:SE, fontSize:18, fontWeight:700, color:C.ink, marginBottom:16 }}>Nueva regla de flujo</div>

            {/* Nombre */}
            <div style={{ marginBottom:14 }}>
              <label style={labelSt}>Nombre de la regla <span style={{ fontWeight:400, color:C.ink4 }}>(opcional)</span></label>
              <input type="text" placeholder="ej: Barbacoa, Bebidas terraza, Postres noche…" value={form.nombre}
                onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={inputSt} />
            </div>

            {/* SI — condiciones */}
            <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
              <div style={{ fontFamily:SN, fontSize:11, fontWeight:700, color:C.red, marginBottom:10, letterSpacing:'0.06em' }}>SI (condiciones)</div>

              {/* Zona multi-checkbox */}
              <div style={{ marginBottom:12 }}>
                <label style={labelSt}>Zona de sala</label>
                <div style={{ border:`1px solid ${C.rule}`, borderRadius:6, background:C.paper }}>
                  {/* "Todas" master */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:`1px solid ${C.rule}`, background:form.zona_tipos.length===0?C.bone:'transparent' }}>
                    <Chk checked={form.zona_tipos.length===0} onClick={toggleTodasZonas}/>
                    <span style={{ fontFamily:SN, fontSize:13, color:C.ink, fontStyle:'italic' }}>Todas las zonas</span>
                  </div>
                  {zonas.map((z,i)=>(
                    <div key={z.tipo} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:i<zonas.length-1?`1px solid ${C.rule}`:'none', background:form.zona_tipos.includes(z.tipo)?C.bone:'transparent' }}>
                      <Chk checked={form.zona_tipos.includes(z.tipo)} onClick={()=>toggleZona(z.tipo)}/>
                      <span style={{ fontFamily:SN, fontSize:13, color:C.ink }}>{z.nombre}</span>
                    </div>
                  ))}
                  {zonas.length===0 && <div style={{ padding:'10px 12px', fontFamily:SN, fontSize:12, color:C.ink4, fontStyle:'italic' }}>Sin zonas configuradas</div>}
                </div>
                <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginTop:3 }}>Sin selección = todas las zonas</div>
              </div>

              {/* Secciones árbol con productos */}
              <div style={{ marginBottom:12 }}>
                <label style={labelSt}>
                  Secciones / Productos{' '}
                  <span style={{ fontWeight:400, color:C.ink4 }}>
                    ({form.seccion_ids.length===0 && form.producto_ids.length===0 ? 'todos' :
                      [form.seccion_ids.length>0?`${form.seccion_ids.length} sección${form.seccion_ids.length>1?'es':''}`:null,
                       form.producto_ids.length>0?`${form.producto_ids.length} producto${form.producto_ids.length>1?'s':''}`:null]
                      .filter(Boolean).join(', ')})
                  </span>
                </label>
                <div style={{ border:`1px solid ${C.rule}`, borderRadius:6, background:C.paper, maxHeight:200, overflowY:'auto' }}>
                  {secciones.map((s,i)=>{
                    const state = seccionState(s.id)
                    const abierta = secAbiertas.has(s.id)
                    const prods = prodsBySeccion(s.id)
                    return (
                      <div key={s.id} style={{ borderBottom:i<secciones.length-1?`1px solid ${C.rule}`:'none' }}>
                        {/* Section row */}
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:state!=='none'?C.bone:'transparent' }}>
                          <Chk checked={state==='all'} indeterminate={state==='some'} onClick={()=>toggleSeccion(s.id)}/>
                          <span style={{ fontFamily:SN, fontSize:13, color:C.ink, flex:1 }}>{s.icono} {s.nombre}</span>
                          <div style={{ width:10, height:10, borderRadius:'50%', background:s.color_kds, flexShrink:0 }}/>
                          {prods.length > 0 && (
                            <button onClick={()=>setSecAbiertas(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n})}
                              style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', color:C.ink4, fontSize:11 }}>
                              {abierta?'▲':'▼'} {prods.length}
                            </button>
                          )}
                        </div>
                        {/* Products (expanded) */}
                        {abierta && prods.map(p=>(
                          <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px 6px 32px', borderTop:`1px solid ${C.rule}`, background:isProdChecked(p.id,s.id)?C.bone:'transparent' }}>
                            <Chk checked={isProdChecked(p.id,s.id)} onClick={()=>toggleProducto(p.id,s.id)}/>
                            <span style={{ fontFamily:SN, fontSize:12, color:C.ink2 }}>{p.nombre}</span>
                            <span style={{ marginLeft:'auto', fontFamily:SM, fontSize:11, color:C.ink4 }}>{p.precio.toFixed(2)} €</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {secciones.length===0 && <div style={{ padding:'10px 12px', fontFamily:SN, fontSize:12, color:C.ink4, fontStyle:'italic' }}>Sin secciones configuradas</div>}
                </div>
                <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginTop:3 }}>▼ Despliega una sección para seleccionar productos concretos</div>
              </div>

              {/* Horario */}
              <div>
                <label style={labelSt}>Horario (opcional)</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="time" value={form.hora_desde} onChange={e=>setForm(f=>({...f,hora_desde:e.target.value}))} style={{ ...inputSt, width:120 }}/>
                  <span style={{ fontFamily:SN, fontSize:12, color:C.ink4 }}>a</span>
                  <input type="time" value={form.hora_hasta} onChange={e=>setForm(f=>({...f,hora_hasta:e.target.value}))} style={{ ...inputSt, width:120 }}/>
                </div>
                <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginTop:3 }}>Vacío = activa siempre</div>
              </div>
            </div>

            {/* ENTONCES — destino */}
            <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
              <div style={{ fontFamily:SN, fontSize:11, fontWeight:700, color:C.green, marginBottom:10, letterSpacing:'0.06em' }}>ENTONCES (destino)</div>

              <div style={{ marginBottom:10 }}>
                <label style={labelSt}>Tipo de destino <span style={{ fontWeight:400, color:C.ink4 }}>(puedes marcar ambos)</span></label>
                <div style={{ display:'flex', gap:8 }}>
                  {toggleBtn(form.dest_imp, '🖨️ Impresora', ()=>setForm(f=>({...f,dest_imp:!f.dest_imp,destino_imp_ref:''})))}
                  {toggleBtn(form.dest_kds, '📺 Pantalla KDS', ()=>setForm(f=>({...f,dest_kds:!f.dest_kds,destino_kds_ref:''})))}
                </div>
              </div>

              {form.dest_imp && (
                <div style={{ marginBottom:10 }}>
                  <label style={labelSt}>Impresora</label>
                  <select value={form.destino_imp_ref} onChange={e=>setForm(f=>({...f,destino_imp_ref:e.target.value}))} style={inputSt}>
                    <option value="">— Selecciona —</option>
                    {impresoras.map(i=><option key={i.id} value={i.id}>🖨️ {i.nombre}</option>)}
                  </select>
                  {impresoras.length===0 && <div style={{ fontFamily:SN, fontSize:11, color:C.amber, marginTop:3 }}>⚠️ No hay impresoras activas configuradas</div>}
                </div>
              )}

              {form.dest_kds && (
                <div style={{ marginBottom:10 }}>
                  <label style={labelSt}>Sección KDS</label>
                  <select value={form.destino_kds_ref} onChange={e=>setForm(f=>({...f,destino_kds_ref:e.target.value}))} style={inputSt}>
                    <option value="">— Selecciona —</option>
                    {secciones.map(s=><option key={s.id} value={s.id}>📺 KDS · {s.nombre}</option>)}
                  </select>
                  {secciones.length===0 && <div style={{ fontFamily:SN, fontSize:11, color:C.amber, marginTop:3 }}>⚠️ No hay secciones de cocina configuradas</div>}
                </div>
              )}

              {/* Imprimir al marchar */}
              <div style={{ borderTop:`1px solid ${C.rule}`, paddingTop:10, marginTop:4 }}>
                <div onClick={()=>setForm(f=>({...f,imprimir_al_marchar:!f.imprimir_al_marchar,impresora_pase_id:''}))} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                  <Chk checked={form.imprimir_al_marchar} onClick={()=>setForm(f=>({...f,imprimir_al_marchar:!f.imprimir_al_marchar,impresora_pase_id:''}))}/>
                  <span style={{ fontFamily:SN, fontSize:13, color:C.ink, fontWeight:500 }}>Imprimir ticket de pase al marchar</span>
                </div>
                <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginLeft:26, marginTop:2 }}>Cuando cocina pulsa MARCHAR, imprime un resumen en sala</div>
                {form.imprimir_al_marchar && (
                  <div style={{ marginTop:10 }}>
                    <label style={labelSt}>Impresora de pase</label>
                    <select value={form.impresora_pase_id} onChange={e=>setForm(f=>({...f,impresora_pase_id:e.target.value}))} style={inputSt}>
                      <option value="">— Selecciona impresora —</option>
                      {impresoras.map(i=><option key={i.id} value={i.id}>🖨️ {i.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Fallback toggle */}
            <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
              <div onClick={()=>setForm(f=>({...f,es_fallback:!f.es_fallback}))} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <Chk checked={form.es_fallback} onClick={()=>setForm(f=>({...f,es_fallback:!f.es_fallback}))}/>
                <span style={{ fontFamily:SN, fontSize:13, color:C.ink, fontWeight:500 }}>Regla fallback</span>
              </div>
              <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginLeft:26, marginTop:2 }}>
                Se aplica solo si ninguna otra regla coincide. Evita que comandas queden sin destino.
              </div>
            </div>

            {err && <div style={{ color:C.red, fontFamily:SN, fontSize:12, marginBottom:12 }}>{err}</div>}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={()=>setModal(false)} style={{ background:'transparent', border:`1px solid ${C.rule}`, borderRadius:8, padding:'9px 18px', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{ background:saving?C.ink4:C.red, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontFamily:SN, fontSize:13, fontWeight:600, cursor:saving?'default':'pointer' }}>
                {saving?'Guardando…':'Guardar regla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente de fila de regla ──
function ReglaRow({ r, isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, zonasLabel, secsLabel, prodsLabel, destinoLabel, onToggle, onDelete }: {
  r: ReglaEnvio; key?: React.Key
  isDragging: boolean; isDragOver: boolean
  onDragStart:()=>void; onDragOver:(e:React.DragEvent)=>void
  onDragLeave:()=>void; onDrop:()=>void; onDragEnd:()=>void
  zonasLabel: string[]; secsLabel: {id:string;nombre:string;color_kds:string;icono:string}[]
  prodsLabel: string|null; destinoLabel: string
  onToggle:()=>void; onDelete:()=>void
}) {
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
      style={{ background:isDragOver?'#EFE7D6':r.activa?'#FBF8F1':'#EFE7D6', border:`1px solid ${isDragOver?'#D9442B':r.activa?'#D8CDB6':'#E5DAC2'}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, opacity:isDragging?0.4:r.activa?1:0.55, transition:'opacity .2s,border-color .15s', cursor:'grab' }}>
      <div style={{ color:'#9A8D7C', fontSize:18, cursor:'grab', flexShrink:0, userSelect:'none' }}>⠿</div>

      <div style={{ flex:1, minWidth:0 }}>
        {/* Nombre + fallback badge */}
        {(r.nombre || r.es_fallback) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            {r.nombre && <span style={{ fontFamily:"'Inter Tight',system-ui,sans-serif", fontSize:13, fontWeight:700, color:'#1A1714' }}>{r.nombre}</span>}
            {r.es_fallback && <span style={{ background:'#F7E3B6', border:'1px solid #E8A33B', borderRadius:4, padding:'1px 6px', fontSize:10, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#A8761A', fontWeight:600 }}>FALLBACK</span>}
          </div>
        )}
        {/* SI */}
        <div style={{ fontFamily:"'Inter Tight',system-ui,sans-serif", fontSize:11, color:'#9A8D7C', marginBottom:3 }}>SI</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {zonasLabel.length > 0 ? zonasLabel.map((n,i)=>(
            <span key={i} style={{ background:'#E5DAC2', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#3A332C', fontWeight:600 }}>📍 {n}</span>
          )) : (
            <span style={{ background:'#E5DAC2', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#9A8D7C', fontStyle:'italic' }}>Todas las zonas</span>
          )}
          {prodsLabel ? (
            <span style={{ background:'#F4D8CF', border:'1px solid #D9442B', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#A8311E', fontWeight:600 }}>📦 {prodsLabel}</span>
          ) : secsLabel.length > 0 ? secsLabel.map(s=>(
            <span key={s.id} style={{ background:'#E5DAC2', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#3A332C', fontWeight:600 }}>{s.icono} {s.nombre}</span>
          )) : (
            <span style={{ background:'#E5DAC2', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#9A8D7C', fontStyle:'italic' }}>Todas las secciones</span>
          )}
          {r.hora_desde && r.hora_hasta && (
            <span style={{ background:'#F7E3B6', border:'1px solid #E8A33B', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#3A332C' }}>🕐 {r.hora_desde}–{r.hora_hasta}</span>
          )}
        </div>
      </div>

      <div style={{ color:'#D9442B', fontWeight:700, fontSize:18, flexShrink:0 }}>→</div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"'Inter Tight',system-ui,sans-serif", fontSize:11, color:'#9A8D7C', marginBottom:3 }}>ENTONCES</div>
        <div style={{ fontFamily:"'Inter Tight',system-ui,sans-serif", fontSize:13, color:'#1A1714', fontWeight:600 }}>{destinoLabel}</div>
        {r.imprimir_al_marchar && (
          <span style={{ display:'inline-block', marginTop:3, background:'#D4E4D2', border:'1px solid #3F7D44', borderRadius:4, padding:'1px 6px', fontSize:10, fontFamily:"'Inter Tight',system-ui,sans-serif", color:'#3F7D44' }}>🖨️ pase al marchar</span>
        )}
      </div>

      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <button onClick={onToggle} style={{ background:r.activa?'#D4E4D2':'#E5DAC2', color:r.activa?'#3F7D44':'#9A8D7C', border:'none', borderRadius:6, padding:'5px 10px', fontFamily:"'Inter Tight',system-ui,sans-serif", fontSize:11, fontWeight:600, cursor:'pointer' }}>
          {r.activa?'● ON':'○ OFF'}
        </button>
        <button onClick={onDelete} style={{ background:'transparent', color:'#9A8D7C', border:'1px solid #D8CDB6', borderRadius:6, padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
          <Icon d={ICONS.trash} size={13}/>
        </button>
      </div>
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

// ── Tab: Notificaciones Marchar ───────────────────────────────────
const CANAL_OPTS = [
  { value: 'push_audio_completo', label: 'Push + Audio completo', desc: '"Saliendo. Mesa 4. Entrecot por dos, patatas."' },
  { value: 'push_audio_corto',    label: 'Push + Audio corto',    desc: '"Mesa 4, lista para servir."' },
  { value: 'solo_visual',         label: 'Solo visual',           desc: 'Banner en pantalla, sin voz' },
  { value: 'igual_que_running',   label: 'Igual que Running',     desc: 'Misma notificación que recibe el running' },
  { value: 'sin_notificacion',    label: 'Sin notificación',      desc: 'No recibe nada' },
]

const AUDIO_OPTS = [
  { value: 'tts',       label: 'Voz TTS (español)',    desc: 'Síntesis de voz natural en es-ES' },
  { value: 'tono',      label: 'Tono + banner',         desc: 'Pitido y texto en pantalla, sin voz' },
  { value: 'vibracion', label: 'Solo vibración',        desc: 'Sin sonido, solo vibración del dispositivo' },
]

function NotificacionesTab() {
  const sh = useCallback(() => ({ 'Content-Type': 'application/json', 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' }), [])
  const [config, setConfig] = useState({
    running_canal:         'push_audio_completo',
    camarero_con_running:  'solo_visual',
    camarero_sin_running:  'push_audio_completo',
    canal_audio:           'tts',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    fetch('/api/owner/notif-config', { headers: sh() })
      .then(r => r.json())
      .then(d => { if (d.marchar) setConfig(c => ({ ...c, ...d.marchar })) })
      .catch(() => {})
  }, [sh])

  const guardar = async () => {
    setSaving(true)
    await fetch('/api/owner/notif-config', {
      method: 'PUT',
      headers: sh(),
      body: JSON.stringify({ marchar: config }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const CanalSelect = ({ label, value, onChange, excluir }: { label: string; value: string; onChange: (v: string) => void; excluir?: string[] }) => {
    const opts = CANAL_OPTS.filter(o => !excluir?.includes(o.value))
    const sel = opts.find(o => o.value === value)
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>{label}</div>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.rule}`, borderRadius: 8, background: C.paper, fontFamily: SN, fontSize: 13, color: C.ink, cursor: 'pointer' }}
        >
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {sel && <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 4, fontStyle: 'italic' }}>{sel.desc}</div>}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink, marginBottom: 4 }}>Notificaciones · MARCHAR</div>
      <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 24 }}>
        Configura quién recibe qué cuando cocina pulsa MARCHAR en el KDS.
      </div>

      {/* Bloque Running */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.red, marginBottom: 14 }}>
          Running (receptor principal)
        </div>
        <CanalSelect
          label="Notificación al Running cuando está activo"
          value={config.running_canal}
          onChange={v => setConfig(c => ({ ...c, running_canal: v }))}
          excluir={['igual_que_running']}
        />
      </div>

      {/* Bloque Camarero con Running */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 14 }}>
          Camarero cuando hay Running en la zona
        </div>
        <CanalSelect
          label="El camarero también recibe..."
          value={config.camarero_con_running}
          onChange={v => setConfig(c => ({ ...c, camarero_con_running: v }))}
        />
      </div>

      {/* Bloque Camarero sin Running */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 14 }}>
          Camarero cuando NO hay Running
        </div>
        <CanalSelect
          label="Notificación directa al camarero"
          value={config.camarero_sin_running}
          onChange={v => setConfig(c => ({ ...c, camarero_sin_running: v }))}
          excluir={['igual_que_running']}
        />
      </div>

      {/* Canal audio */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '18px 20px', marginBottom: 24 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 14 }}>
          Canal de audio
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AUDIO_OPTS.map(o => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="canal_audio"
                value={o.value}
                checked={config.canal_audio === o.value}
                onChange={() => setConfig(c => ({ ...c, canal_audio: o.value }))}
                style={{ marginTop: 3, accentColor: C.red }}
              />
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{o.label}</div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, fontStyle: 'italic' }}>{o.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Guardar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Btn variant="primary" onClick={guardar}>
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar configuración'}
        </Btn>
        {saved && (
          <span style={{ fontFamily: SN, fontSize: 12, color: C.green }}>
            Cambios aplicados — efecto inmediato
          </span>
        )}
      </div>
    </div>
  )
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

/* ─── Tab: Modificaciones / Audit Trail ─── */
type Modificacion = {
  id: string; tipo_accion: string; motivo_declarado: string; motivo_categoria: string
  valor_antes: Record<string,unknown>|null; valor_despues: Record<string,unknown>|null
  camarero_nombre: string; autorizado_nombre: string|null; requiere_autorizacion: boolean
  estado_item_en_kds: string|null; mesa_numero: string|null; created_at: string
}
type Sospechoso = { camarero_id: string; camarero_nombre: string; num_eliminaciones: number; primera_accion: string; ultima_accion: string }

const TIPO_META: Record<string,{label:string;color:string}> = {
  eliminar_item:      {label:'Ítem eliminado',    color:C.red},
  modificar_cantidad: {label:'Cantidad cambiada', color:C.amber},
  cancelar_comanda:   {label:'Comanda cancelada', color:C.red},
  aplicar_descuento:  {label:'Descuento aplicado',color:C.amber},
  modificar_nota:     {label:'Nota modificada',   color:C.green},
}
const MOTIVO_META: Record<string,string> = {
  error_pedido:'Error al pedir', cliente_cambio:'Cliente cambió de opinión',
  producto_no_disponible:'Producto no disponible', orden_supervisor:'Orden supervisor', otro:'Otro',
}

function ModificacionesTab({ restauranteId }: { restauranteId: string }) {
  const [mods, setMods]             = useState<Modificacion[]>([])
  const [sosp, setSosp]             = useState<Sospechoso[]>([])
  const [kpis, setKpis]             = useState<{total:number;cancelados:number;enCocina:number}|null>(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const hoy = new Date(); hoy.setHours(0,0,0,0)

    let query = supabase.from('comanda_modificaciones')
      .select('*').eq('restaurante_id', restauranteId)
      .gte('created_at', new Date(Date.now()-24*60*60*1000).toISOString())
      .order('created_at',{ascending:false}).limit(200)
    if (filtroTipo!=='todos') query = (query as unknown as {eq:(a:string,b:string)=>typeof query}).eq('tipo_accion', filtroTipo) as typeof query
    const {data:modsData} = await query
    setMods((modsData||[]) as unknown as Modificacion[])

    const {data:hoyData} = await supabase.from('comanda_modificaciones')
      .select('tipo_accion,estado_item_en_kds')
      .eq('restaurante_id', restauranteId)
      .gte('created_at', hoy.toISOString())
    if (hoyData) {
      const h = hoyData as unknown as {tipo_accion:string;estado_item_en_kds:string|null}[]
      setKpis({
        total: h.length,
        cancelados: h.filter(m=>['eliminar_item','cancelar_comanda'].includes(m.tipo_accion)).length,
        enCocina: h.filter(m=>['en_proceso','listo'].includes(m.estado_item_en_kds||'')).length,
      })
    }
    const {data:sospData} = await supabase.rpc('fn_camareros_sospechosos',{p_restaurante_id:restauranteId})
    setSosp((sospData||[]) as Sospechoso[])
    setLoading(false)
  }, [restauranteId, filtroTipo])

  useEffect(() => { load() }, [load])

  const fmtHora = (iso:string) => new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})

  return (
    <div>
      {sosp.length>0&&(
        <div style={{background:C.redS,border:`1px solid ${C.red}44`,borderRadius:10,padding:'14px 18px',marginBottom:20}}>
          <div style={{fontFamily:SM,fontSize:10,fontWeight:700,color:C.red,letterSpacing:'.1em',marginBottom:8}}>⚠ ACTIVIDAD INUSUAL DETECTADA</div>
          {sosp.map(s=>(
            <div key={s.camarero_id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderTop:`1px solid ${C.red}22`}}>
              <div>
                <div style={{fontFamily:SN,fontWeight:600,fontSize:14,color:C.ink}}>{s.camarero_nombre}</div>
                <div style={{fontFamily:SM,fontSize:10,color:C.ink3}}>{fmtHora(s.primera_accion)} – {fmtHora(s.ultima_accion)}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:28,color:C.red,lineHeight:1}}>{s.num_eliminaciones}</div>
                <div style={{fontFamily:SM,fontSize:9,color:C.ink3}}>eliminaciones/hora</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {kpis&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
          {[
            {v:kpis.total,     l:'Modificaciones hoy',   c:C.ink2, a:false},
            {v:kpis.cancelados,l:'Ítems eliminados',      c:C.red,  a:kpis.cancelados>10},
            {v:kpis.enCocina,  l:'Cancelados en cocina',  c:C.red,  a:kpis.enCocina>0},
          ].map((k,i)=>(
            <div key={i} style={{background:C.bone,border:`1px solid ${k.a?C.red+'55':C.rule}`,borderRadius:10,padding:'12px 16px'}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:32,color:k.c,lineHeight:1}}>{k.v}</div>
              <div style={{fontFamily:SN,fontSize:11,color:C.ink3,marginTop:4}}>{k.l}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap' as const}}>
        {['todos','eliminar_item','modificar_cantidad','cancelar_comanda'].map(f=>(
          <button key={f} onClick={()=>setFiltroTipo(f)}
            style={{padding:'6px 14px',borderRadius:20,border:`1px solid ${filtroTipo===f?C.red+'55':C.rule}`,
              background:filtroTipo===f?C.redS:'transparent',fontFamily:SN,fontSize:12,
              fontWeight:filtroTipo===f?600:400,color:filtroTipo===f?C.red:C.ink3,cursor:'pointer'}}>
            {f==='todos'?'Todos':f==='eliminar_item'?'🗑 Eliminar':f==='modificar_cantidad'?'✏ Cantidad':'✕ Cancelar'}</button>
        ))}
        <button onClick={load} style={{marginLeft:'auto',padding:'6px 14px',borderRadius:20,border:`1px solid ${C.rule}`,background:'transparent',fontFamily:SN,fontSize:12,color:C.ink3,cursor:'pointer'}}>↻ Actualizar</button>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:C.ink3,fontFamily:SN,fontSize:13}}>Cargando…</div>
      ) : mods.length===0 ? (
        <div style={{textAlign:'center',padding:'60px 0',border:`1px dashed ${C.rule}`,borderRadius:12}}>
          <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink3}}>Sin modificaciones registradas</div>
          <div style={{fontFamily:SN,fontSize:12,color:C.ruleS,marginTop:6}}>buena señal</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {mods.map(m=>{
            const meta = TIPO_META[m.tipo_accion]||{label:m.tipo_accion,color:C.ink3}
            const fueEnCocina=['en_proceso','listo'].includes(m.estado_item_en_kds||'')
            const diff=m.tipo_accion==='modificar_cantidad'&&m.valor_antes&&m.valor_despues
              ?`${(m.valor_antes as Record<string,unknown>).cantidad} → ${(m.valor_despues as Record<string,unknown>).cantidad} ud.`
              :null
            return (
              <div key={m.id} style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:10,padding:'12px 16px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' as const,marginBottom:5}}>
                      <span style={{fontFamily:SN,fontWeight:600,fontSize:13,color:meta.color}}>{meta.label}</span>
                      {fueEnCocina&&<span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:99,background:C.redS,color:C.red}}>en cocina</span>}
                      {m.autorizado_nombre&&<span style={{fontFamily:SM,fontSize:9,padding:'2px 8px',borderRadius:99,background:C.greenS,color:C.green}}>✓ auth: {m.autorizado_nombre}</span>}
                    </div>
                    <div style={{display:'flex',gap:12,flexWrap:'wrap' as const,alignItems:'center'}}>
                      <span style={{fontFamily:SN,fontSize:13,color:C.ink}}>{m.camarero_nombre}</span>
                      {m.mesa_numero&&<span style={{fontFamily:SM,fontSize:10,color:C.ink3}}>Mesa {m.mesa_numero}</span>}
                      {diff&&<span style={{fontFamily:SM,fontSize:10,color:C.amber}}>{diff}</span>}
                    </div>
                    <div style={{fontFamily:SN,fontSize:11,color:C.ink3,marginTop:4,fontStyle:'italic'}}>
                      &ldquo;{MOTIVO_META[m.motivo_categoria]||m.motivo_declarado}&rdquo;
                    </div>
                  </div>
                  <div style={{fontFamily:SM,fontSize:11,color:C.ink3,flexShrink:0}}>{fmtHora(m.created_at)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Control de Caja ─── */
function CajaTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [data, setData] = useState<{
    turno: { id: string; nombre: string; created_at: string } | null
    movimientos: { id:string; tipo:string; concepto:string; importe:number; saldo_acumulado:number; camarero_nombre:string; mesa_label:string|null; notas:string|null; created_at:string }[]
    resumen: { saldo_actual:number; cobros_efectivo:number; cambios:number; retiros:number; gastos:number; apertura:number } | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ tipo:'retiro', concepto:'', importe:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [cierreEfectivo, setCierreEfectivo] = useState('')
  const [cierreDesvio, setCierreDesvio] = useState<number|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja', { headers: sh() })
    const d = await r.json()
    setData(d)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addMovimiento = async () => {
    if (!form.concepto || !form.importe) return
    setSaving(true)
    await fetch('/api/caja', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: form.tipo, concepto: form.concepto, importe: parseFloat(form.importe), notas: form.notas || undefined })
    })
    setForm({ tipo:'retiro', concepto:'', importe:'', notas:'' })
    setModalOpen(false); setSaving(false); load()
  }

  const calcDesvio = () => {
    if (!data?.resumen || !cierreEfectivo) return
    const esperado = data.resumen.saldo_actual
    const real = parseFloat(cierreEfectivo)
    setCierreDesvio(Math.round((real - esperado) * 100) / 100)
  }

  const TIPO_COLOR: Record<string,string> = {
    apertura: C.green, cobro_efectivo: C.green,
    cambio: C.amber, retiro: C.red, gasto: C.red,
    ingreso_manual: C.green, cierre: C.ink3,
  }
  const TIPO_ICONO: Record<string,string> = {
    apertura:'🔓', cobro_efectivo:'💵', cambio:'🔄',
    retiro:'⬆', gasto:'🛒', ingreso_manual:'⬇', cierre:'🔒',
  }

  const fmtEur = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(2).replace('.',',')} €`
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'})

  if (loading) return <div style={{padding:40,textAlign:'center',color:C.ink4,fontFamily:SM,fontSize:12}}>Cargando caja…</div>

  if (!data?.turno) return (
    <div style={{padding:40,textAlign:'center'}}>
      <div style={{fontSize:32,marginBottom:12}}>🔒</div>
      <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.ink2,marginBottom:8}}>Sin turno activo</div>
      <div style={{fontSize:13,color:C.ink3}}>Abre un turno en la pestaña Turno para empezar a registrar caja.</div>
    </div>
  )

  const { resumen, movimientos, turno } = data
  const saldo = resumen?.saldo_actual ?? 0

  return (
    <div style={{paddingTop:24}}>

      {/* RESUMEN SUPERIOR */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:20}}>
        {/* Saldo actual — grande */}
        <div style={{gridColumn:'1/-1',background:saldo>=0?C.greenS:C.redS,border:`1px solid ${saldo>=0?C.green+'44':C.red+'44'}`,borderRadius:12,padding:'16px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:saldo>=0?C.green:C.red,marginBottom:4}}>
              Saldo en caja · {turno.nombre}
            </div>
            <div style={{fontFamily:SM,fontSize:28,fontWeight:700,color:saldo>=0?C.green:C.red}}>
              {fmtEur(saldo)}
            </div>
          </div>
          <div style={{fontSize:36}}>{saldo>=0?'💰':'⚠️'}</div>
        </div>

        {[
          { label:'Apertura', val: resumen?.apertura??0, ico:'🔓', col:C.ink3 },
          { label:'Cobros efectivo', val: resumen?.cobros_efectivo??0, ico:'💵', col:C.green },
          { label:'Cambios entregados', val: -(resumen?.cambios??0), ico:'🔄', col:C.amber },
          { label:'Retiros', val: -(resumen?.retiros??0), ico:'⬆', col:C.red },
          { label:'Gastos', val: -(resumen?.gastos??0), ico:'🛒', col:C.red },
        ].map(({label,val,ico,col})=>(
          <div key={label} style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:11,color:C.ink4,marginBottom:4,display:'flex',gap:6,alignItems:'center'}}>
              <span>{ico}</span>{label}
            </div>
            <div style={{fontFamily:SM,fontSize:16,fontWeight:600,color:col}}>{fmtEur(val)}</div>
          </div>
        ))}
      </div>

      {/* ACCIONES */}
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap' as const}}>
        <button onClick={()=>setModalOpen(true)}
          style={{padding:'9px 16px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:13,fontWeight:600,color:C.ink,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          ＋ Movimiento manual
        </button>
        <button onClick={()=>{ setCierreOpen(true); setCierreEfectivo(''); setCierreDesvio(null) }}
          style={{padding:'9px 16px',background:C.redS,border:`1px solid ${C.red}44`,borderRadius:8,fontSize:13,fontWeight:600,color:C.red,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          🔒 Cierre de caja
        </button>
        <button onClick={load}
          style={{padding:'9px 16px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>
          ↺ Actualizar
        </button>
      </div>

      {/* MODAL: Movimiento manual */}
      {modalOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:480,background:C.bone,borderRadius:16,padding:24,boxShadow:'0 -4px 32px rgba(26,23,20,.2)'}}>
            <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,marginBottom:16}}>Movimiento manual</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13,color:C.ink}}>
                <option value="retiro">⬆ Retiro de caja</option>
                <option value="gasto">🛒 Gasto</option>
                <option value="ingreso_manual">⬇ Ingreso manual</option>
                <option value="apertura">🔓 Fondo inicial</option>
              </select>
              <input placeholder="Concepto (ej: Compra hielo)" value={form.concepto} onChange={e=>setForm(f=>({...f,concepto:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13,color:C.ink}}/>
              <input type="number" inputMode="decimal" placeholder="Importe €" value={form.importe} onChange={e=>setForm(f=>({...f,importe:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SM,fontSize:16,color:C.ink}}/>
              <input placeholder="Notas (opcional)" value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13,color:C.ink}}/>
              <div style={{display:'flex',gap:8,marginTop:4}}>
                <button onClick={()=>setModalOpen(false)} style={{flex:1,padding:10,border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
                <button onClick={addMovimiento} disabled={saving||!form.concepto||!form.importe}
                  style={{flex:2,padding:10,border:'none',borderRadius:8,background:C.red,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',opacity:saving?.6:1}}>
                  {saving?'Guardando…':'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cierre de caja */}
      {cierreOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:480,background:C.bone,borderRadius:16,padding:24,boxShadow:'0 -4px 32px rgba(26,23,20,.2)'}}>
            <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,marginBottom:4}}>Cierre de caja</div>
            <div style={{fontSize:12,color:C.ink3,marginBottom:16}}>Saldo esperado según sistema: <strong style={{fontFamily:SM,color:C.ink}}>{fmtEur(saldo)}</strong></div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div>
                <div style={{fontSize:11,color:C.ink4,marginBottom:6,textTransform:'uppercase',letterSpacing:'1px'}}>Efectivo real contado</div>
                <input type="number" inputMode="decimal" placeholder="0.00" value={cierreEfectivo}
                  onChange={e=>{setCierreEfectivo(e.target.value);setCierreDesvio(null)}}
                  style={{width:'100%',padding:'12px 14px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SM,fontSize:22,color:C.ink}}/>
              </div>
              {cierreEfectivo && (
                <button onClick={calcDesvio}
                  style={{padding:'10px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper2,fontSize:13,fontWeight:600,color:C.ink,cursor:'pointer'}}>
                  Calcular desvío
                </button>
              )}
              {cierreDesvio !== null && (
                <div style={{padding:'14px 16px',borderRadius:10,background:Math.abs(cierreDesvio)<1?C.greenS:C.redS,border:`1px solid ${Math.abs(cierreDesvio)<1?C.green:C.red}44`}}>
                  <div style={{fontSize:12,color:Math.abs(cierreDesvio)<1?C.green:C.red,fontWeight:700,marginBottom:4}}>
                    {Math.abs(cierreDesvio)<0.01?'✓ Cuadra perfectamente':cierreDesvio>0?'⬆ Sobrante':'⬇ Faltante'}
                  </div>
                  <div style={{fontFamily:SM,fontSize:24,fontWeight:700,color:Math.abs(cierreDesvio)<1?C.green:C.red}}>
                    {fmtEur(cierreDesvio)}
                  </div>
                  {Math.abs(cierreDesvio)>=1 && (
                    <div style={{fontSize:11,color:C.ink3,marginTop:6}}>
                      Esperado {fmtEur(saldo)} · Contado {fmtEur(parseFloat(cierreEfectivo))}
                    </div>
                  )}
                </div>
              )}
              <div style={{display:'flex',gap:8,marginTop:4}}>
                <button onClick={()=>setCierreOpen(false)} style={{flex:1,padding:10,border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
                <button onClick={async()=>{
                  await fetch('/api/caja',{method:'POST',headers:{...sh(),'Content-Type':'application/json'},body:JSON.stringify({tipo:'cierre',concepto:`Cierre · real ${fmtEur(parseFloat(cierreEfectivo)||0)} · desvío ${fmtEur(cierreDesvio??0)}`,importe:0,notas:cierreDesvio!==null?`Contado: ${cierreEfectivo}€ | Desvío: ${cierreDesvio}€`:undefined})})
                  setCierreOpen(false); load()
                }} style={{flex:2,padding:10,border:'none',borderRadius:8,background:C.red,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}}>
                  Registrar cierre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LISTADO DE MOVIMIENTOS */}
      <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.rule}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:C.ink3}}>Movimientos del turno</div>
          <div style={{fontFamily:SM,fontSize:11,color:C.ink4}}>{movimientos.length} registros</div>
        </div>

        {movimientos.length === 0 && (
          <div style={{padding:24,textAlign:'center',color:C.ink4,fontSize:13}}>Sin movimientos aún</div>
        )}

        {movimientos.map((m, i) => (
          <div key={m.id} style={{
            padding:'11px 16px',
            borderBottom: i < movimientos.length-1 ? `1px solid ${C.rule}` : 'none',
            display:'flex',alignItems:'center',gap:12,
            background: i===0 ? C.paper2 : 'transparent',
          }}>
            {/* Icono tipo */}
            <div style={{width:32,height:32,borderRadius:8,background:TIPO_COLOR[m.tipo]+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
              {TIPO_ICONO[m.tipo]??'·'}
            </div>
            {/* Info */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:C.ink,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.concepto}</div>
              <div style={{fontSize:11,color:C.ink4,marginTop:1,display:'flex',gap:8}}>
                <span>{m.camarero_nombre}</span>
                {m.mesa_label && <span>· {m.mesa_label}</span>}
                <span>· {fmtTime(m.created_at)}</span>
              </div>
            </div>
            {/* Importe */}
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontFamily:SM,fontSize:14,fontWeight:700,color:m.importe>=0?C.green:C.red}}>
                {m.importe>=0?'+':''}{fmtEur(m.importe)}
              </div>
              <div style={{fontFamily:SM,fontSize:10,color:C.ink4,marginTop:1}}>
                saldo {fmtEur(m.saldo_acumulado)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Cubierto por zona ─── */
function ZonaCubiertoOverride({ sesion, precioGlobal, activoGlobal }: {
  sesion: Record<string,string>
  precioGlobal: number
  activoGlobal: boolean
}) {
  type ZonaRow = { id: string; nombre: string; tipo: string; servicio_override: boolean | null; servicio_precio_zona: number | null }
  const [zonas, setZonas] = useState<ZonaRow[]>([])
  const [saving, setSaving] = useState<string|null>(null)

  useEffect(() => {
    fetch('/api/owner/zonas', { headers: sesion })
      .then(r => r.json())
      .then(d => Array.isArray(d) && setZonas(d))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (id: string, patch: Partial<ZonaRow>) => {
    setSaving(id)
    setZonas(z => z.map(x => x.id === id ? { ...x, ...patch } : x))
    await fetch('/api/owner/zonas', {
      method: 'PUT', headers: sesion,
      body: JSON.stringify({ id, ...patch }),
    })
    setSaving(null)
  }

  if (!zonas.length) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
        Cubierto por zona
      </div>
      <div style={{ fontSize: 12, color: C.ink3, marginBottom: 14 }}>
        Cada zona puede anular la configuración global. Útil para barra (sin cubierto) o terraza (precio diferente).
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {zonas.map(z => {
          // null = hereda global, true/false = override
          const override   = z.servicio_override
          const hereda     = override === null || override === undefined
          const activoFinal = hereda ? activoGlobal : override
          const precioFinal = z.servicio_precio_zona ?? precioGlobal

          return (
            <div key={z.id} style={{
              background: C.bone, border: `1px solid ${C.rule}`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              {/* Fila nombre + estado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hereda ? 0 : 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{z.nombre}</span>
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontFamily: SM,
                    color: hereda ? C.ink4 : activoFinal ? C.green : C.ink3,
                    background: hereda ? C.paper2 : activoFinal ? `${C.green}18` : C.paper2,
                    padding: '2px 7px', borderRadius: 6, letterSpacing: '.06em',
                  }}>
                    {hereda ? 'hereda global' : activoFinal ? 'con cubierto' : 'sin cubierto'}
                  </span>
                </div>
                {/* Toggle override: null → false → true → null */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => update(z.id, { servicio_override: hereda ? false : override === false ? true : null })}
                    disabled={saving === z.id}
                    style={{
                      padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.rule}`,
                      background: hereda ? C.ink : 'transparent',
                      color: hereda ? '#fff' : C.ink3,
                      fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: SN,
                    }}>
                    {hereda ? 'Global ✓' : 'Usar global'}
                  </button>
                  {!hereda && (
                    <button
                      onClick={() => update(z.id, { servicio_override: !override })}
                      disabled={saving === z.id}
                      style={{
                        padding: '5px 12px', borderRadius: 7, border: `1px solid ${activoFinal ? C.green+'66' : C.rule}`,
                        background: activoFinal ? `${C.green}18` : C.paper2,
                        color: activoFinal ? C.green : C.ink3,
                        fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: SN,
                      }}>
                      {activoFinal ? 'Con cubierto' : 'Sin cubierto'}
                    </button>
                  )}
                </div>
              </div>

              {/* Precio propio — solo visible si override activo */}
              {!hereda && activoFinal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: C.ink3, flex: 1 }}>
                    Precio en esta zona
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number" min="0" step="0.10"
                      value={z.servicio_precio_zona ?? precioGlobal}
                      onChange={e => setZonas(zs => zs.map(x => x.id === z.id ? { ...x, servicio_precio_zona: parseFloat(e.target.value) || null } : x))}
                      onBlur={e => update(z.id, { servicio_precio_zona: parseFloat(e.target.value) || null })}
                      style={{
                        width: 72, padding: '6px 8px', borderRadius: 7,
                        border: `1px solid ${C.rule}`, background: C.paper2,
                        fontSize: 13, fontFamily: SM, color: C.ink,
                        textAlign: 'right' as const, outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 12, color: C.ink4 }}>€ / pax</span>
                    {z.servicio_precio_zona !== null && (
                      <button onClick={() => update(z.id, { servicio_precio_zona: null })}
                        style={{ fontSize: 11, color: C.ink4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>
                        Usar global ({precioGlobal}€)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Tab: Servicio / Cubierto ─── */
// ─── Tab QR Mesa ───────────────────────────────────────────
function QRTabOwner({ restauranteId, sh }: { restauranteId: string; sh: () => Record<string,string> }) {
  const [mesas, setMesas] = useState<any[]>([])
  const [conectado, setConectado] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string|null>(null)
  const [editPrecio, setEditPrecio] = useState<Record<string,string>>({})
  const [editConcepto, setEditConcepto] = useState<Record<string,string>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/owner/mesas', { headers: sh() }).then(r => r.json()),
      fetch('/api/qr/connect/status', { headers: sh() }).then(r => r.json()),
    ]).then(([md, cd]) => {
      setMesas(md.mesas || [])
      setConectado(cd.conectado || false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const updateQR = async (id: string, patch: Record<string,unknown>) => {
    setSaving(id)
    const r = await fetch('/api/owner/mesas', { method: 'PATCH', headers: { ...sh(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
    const d = await r.json()
    if (d.mesa) setMesas(prev => prev.map(m => m.id === id ? { ...m, ...d.mesa } : m))
    setSaving(null)
  }

  const conectarStripe = async () => {
    const r = await fetch('/api/qr/connect/link', { method: 'POST', headers: sh() })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else alert('Configura STRIPE_CLIENT_ID en las variables de entorno de Vercel')
  }

  const nAct = mesas.filter(m => m.qr_habilitado).length

  if (loading) return <div style={{ padding: 32, color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>

  return (
    <div style={{ maxWidth: 640 }}>
      {!conectado ? (
        <div style={{ background: C.bone, borderRadius: 14, padding: '20px 22px', border: `1px solid ${C.rule}`, marginBottom: 24 }}>
          <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 500, color: C.ink, marginBottom: 6 }}>Activar pagos QR</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 16, lineHeight: 1.6 }}>
            Conecta tu cuenta bancaria. Los cobros van directamente a ti. ia.rest recibe un 0,5% automático por cada cobro QR.
          </div>
          <button onClick={conectarStripe} style={{ padding: '10px 20px', background: C.red, border: 'none', borderRadius: 10, color: C.bone, fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Conectar cuenta bancaria →
          </button>
        </div>
      ) : (
        <div style={{ background: C.greenS, borderRadius: 12, padding: '12px 18px', border: `1px solid ${C.green}55`, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: C.green, fontSize: 16 }}>✓</span>
          <div>
            <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>Cuenta bancaria conectada</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>Los cobros QR llegan directamente a tu banco</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 500, color: C.ink }}>Mesas QR</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SM, fontSize: 14, color: C.amber }}>{nAct * 12},00 €/mes</div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{nAct} mesa{nAct !== 1 ? 's' : ''} activa{nAct !== 1 ? 's' : ''} × 12 €</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mesas.map(mesa => {
          const on = !!mesa.qr_habilitado
          const modo = mesa.qr_modo_pago || 'solo_pedido'
          const precio = editPrecio[mesa.id] ?? (mesa.qr_precio_fijo_persona?.toString() || '')
          const concepto = editConcepto[mesa.id] ?? (mesa.qr_precio_fijo_concepto || 'Cubierto')
          const isSaving = saving === mesa.id
          return (
            <div key={mesa.id} style={{ background: C.bone, borderRadius: 14, padding: '14px 18px', border: `1px solid ${on ? C.green + '55' : C.rule}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: on ? 12 : 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: SM, fontSize: 14, color: C.ink, fontWeight: 600 }}>{mesa.codigo}</span>
                  {on && <span style={{ fontFamily: SM, fontSize: 9, padding: '2px 7px', background: C.greenS, border: `1px solid ${C.green}44`, borderRadius: 20, color: C.green }}>QR · 12€/mes</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isSaving && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>...</span>}
                  <div onClick={() => !isSaving && updateQR(mesa.id, { qr_habilitado: !on })}
                    style={{ width: 42, height: 24, borderRadius: 12, background: on ? C.red : C.paper2, border: `1px solid ${C.rule}`, cursor: isSaving ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: isSaving ? 0.6 : 1 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: C.bone, position: 'absolute', top: 3, left: on ? 22 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                  </div>
                </div>
              </div>
              {on && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 6, letterSpacing: '0.06em' }}>MODO PAGO</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['solo_pedido', 'opcional', 'obligatorio'] as const).map(v => (
                        <button key={v} onClick={() => updateQR(mesa.id, { qr_modo_pago: v })}
                          style={{ flex: 1, padding: '7px 0', background: modo === v ? C.paper3 : 'transparent', border: `1px solid ${modo === v ? C.ruleS : C.rule}`, borderRadius: 8, color: modo === v ? C.ink : C.ink3, fontFamily: SN, fontSize: 10, cursor: 'pointer', fontWeight: modo === v ? 600 : 400 }}>
                          {v === 'solo_pedido' ? 'Solo pedido' : v === 'opcional' ? 'Pago opcional' : 'Pago obligatorio'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 6, letterSpacing: '0.06em' }}>PRECIO FIJO / PERSONA</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={concepto} onChange={e => setEditConcepto(p => ({ ...p, [mesa.id]: e.target.value }))}
                        onBlur={() => updateQR(mesa.id, { qr_precio_fijo_concepto: concepto })}
                        placeholder="Cubierto / Menú del día..."
                        style={{ flex: 2, padding: '8px 12px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 9, color: C.ink, fontFamily: SN, fontSize: 12, outline: 'none' }} />
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input type="number" value={precio} min="0" step="0.5"
                          onChange={e => setEditPrecio(p => ({ ...p, [mesa.id]: e.target.value }))}
                          onBlur={() => updateQR(mesa.id, { qr_precio_fijo_persona: parseFloat(precio) || null })}
                          placeholder="0,00"
                          style={{ width: '100%', padding: '8px 28px 8px 12px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 9, color: C.ink, fontFamily: SN, fontSize: 12, outline: 'none' }} />
                        <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontFamily: SM, fontSize: 11, color: C.ink3 }}>€</span>
                      </div>
                    </div>
                    {mesa.qr_precio_fijo_persona ? (
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.amber, marginTop: 5 }}>
                        Al escanear se preguntará cuántas personas son · El importe se suma a la cuenta final
                      </div>
                    ) : (
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 4 }}>Sin precio fijo por persona</div>
                    )}
                  </div>
                  {mesa.qr_token && (
                    <div style={{ background: C.paper2, borderRadius: 9, padding: '9px 13px', border: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>iarest.es/q/{mesa.qr_token.slice(0, 12)}...</span>
                      <button onClick={() => { navigator.clipboard.writeText(`https://www.iarest.es/q/${mesa.qr_token}`); }}
                        style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink3, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                        Copiar URL
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── ia.rest cobro ── */}
      <CobroConfigSection restauranteId={restauranteId} sh={sh} />

      {/* ── Sesiones pre-auth pendientes de cobro ── */}
      <PreauthPendientesPanel restauranteId={restauranteId} sh={sh} />
    </div>
  )
}

// ── Sección ia.rest cobro (modo + timer + progreso descuento) ─
function CobroConfigSection({ restauranteId, sh }: { restauranteId: string; sh: () => Record<string,string> }) {
  const [config, setConfig] = useState<{ modo_cobro: string; timer_inactividad_min: number } | null>(null)
  const [resumen, setResumen] = useState<{ volumen_eur: number; comision_eur: number; descuento_cuota_eur: number; num_transacciones: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const TRAMOS = [
    { desde: 0,     hasta: 2000,  descuento: 0,  label: '0–2k€'  },
    { desde: 2000,  hasta: 5000,  descuento: 15, label: '2–5k€'  },
    { desde: 5000,  hasta: 10000, descuento: 30, label: '5–10k€' },
    { desde: 10000, hasta: 20000, descuento: 50, label: '10–20k€'},
    { desde: 20000, hasta: null,  descuento: 59, label: '+20k€'  },
  ]

  useEffect(() => {
    fetch('/api/owner/cobro-config', { headers: sh() })
      .then(r => r.json())
      .then(d => { setConfig(d.config); setResumen(d.mes_actual) })
      .catch(() => {})
  }, [])

  const save = async (patch: Record<string,unknown>) => {
    setSaving(true)
    const r = await fetch('/api/owner/cobro-config', {
      method: 'PUT',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const d = await r.json()
    if (d.config) setConfig(d.config)
    setMsg(d.ok ? 'Guardado' : (d.error || 'Error'))
    setSaving(false)
    setTimeout(() => setMsg(''), 2000)
  }

  const volumen = resumen?.volumen_eur || 0
  const descuento = resumen?.descuento_cuota_eur || 0
  const tramoActual = TRAMOS.reduce((best, t) => volumen >= t.desde ? t : best, TRAMOS[0])
  const tramoSig = TRAMOS.find(t => t.desde > tramoActual.desde)
  const progreso = tramoSig
    ? Math.min(100, ((volumen - tramoActual.desde) / (tramoSig.desde - tramoActual.desde)) * 100)
    : 100

  const modoOpts = [
    { val: 'cuenta_abierta', label: 'Cuenta abierta',     desc: 'Máxima comodidad. El cliente paga al final cuando quiere' },
    { val: 'pre_auth',       label: 'Pre-autorización',   desc: 'Se verifica la tarjeta al abrir sesión. Si se va sin pagar, cobras igualmente' },
    { val: 'por_ronda',      label: 'Pago por ronda',     desc: 'Cada pedido se cobra al momento. Impago imposible' },
  ]

  return (
    <div style={{ marginTop: 36, borderTop: `1px solid ${C.rule}`, paddingTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 500, color: C.ink }}>ia.rest cobro</div>
        <span style={{ fontFamily: SM, fontSize: 9, letterSpacing: '.08em', background: C.redS, color: C.red, border: `1px solid ${C.red}44`, borderRadius: 20, padding: '2px 8px' }}>NUEVO</span>
      </div>

      {/* Progreso descuento mes actual */}
      <div style={{ background: C.paper, borderRadius: 14, padding: '18px 20px', border: `1px solid ${C.rule}`, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>Descuento en cuota este mes</div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
              {resumen?.num_transacciones || 0} cobros · {volumen.toFixed(2).replace('.',',')} € procesados
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 700, fontStyle: 'italic', color: descuento > 0 ? C.green : C.ink3 }}>
              {descuento > 0 ? `-${descuento}€` : '—'}
            </div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>próxima cuota</div>
          </div>
        </div>
        <div style={{ background: C.paper2, borderRadius: 6, height: 8, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 6, background: progreso >= 100 ? C.green : C.red, width: `${progreso}%`, transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {TRAMOS.map((t, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: SM, fontSize: 9, color: volumen >= t.desde ? C.ink : C.ink4, fontWeight: volumen >= t.desde ? 700 : 400 }}>
                {t.descuento === 0 ? '—' : `-${t.descuento}€`}
              </div>
              <div style={{ fontFamily: SN, fontSize: 8, color: C.ink4, marginTop: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>
        {tramoSig ? (
          <div style={{ fontFamily: SN, fontSize: 11, color: C.amber, marginTop: 10, textAlign: 'center' }}>
            Faltan {(tramoSig.desde - volumen).toFixed(0)} € para -{tramoSig.descuento}€/mes en cuota
          </div>
        ) : (
          <div style={{ fontFamily: SN, fontSize: 11, color: C.green, marginTop: 10, textAlign: 'center', fontWeight: 600 }}>
            ✓ Cuota completamente cubierta por ia.rest cobro este mes
          </div>
        )}
      </div>

      {/* Modo cobro */}
      {config && (
        <>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 10, letterSpacing: '0.06em' }}>MODO DE COBRO QR</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {modoOpts.map(opt => (
              <div key={opt.val}
                onClick={() => save({ modo_cobro: opt.val })}
                style={{ background: config.modo_cobro === opt.val ? C.redS : C.paper, border: `1px solid ${config.modo_cobro === opt.val ? C.red + '55' : C.rule}`, borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${config.modo_cobro === opt.val ? C.red : C.ink3}`, background: config.modo_cobro === opt.val ? C.red : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {config.modo_cobro === opt.val && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{opt.label}</div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Timer inactividad */}
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 10, letterSpacing: '0.06em' }}>ALERTA AL CAMARERO SI LA MESA NO PAGA</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[30, 45, 60, 90].map(min => (
              <button key={min}
                onClick={() => save({ timer_inactividad_min: min })}
                style={{ flex: 1, padding: '10px 0', background: config.timer_inactividad_min === min ? C.paper3 : C.paper, border: `1px solid ${config.timer_inactividad_min === min ? C.ruleS : C.rule}`, borderRadius: 10, color: config.timer_inactividad_min === min ? C.ink : C.ink3, fontFamily: SM, fontSize: 12, fontWeight: config.timer_inactividad_min === min ? 700 : 400, cursor: 'pointer' }}>
                {min}min
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, maxWidth: 380 }}>
              {config.modo_cobro === 'pre_auth' && 'La tarjeta del cliente queda capturada al abrir sesión. Puedes cobrar si se va sin pagar.'}
              {config.modo_cobro === 'por_ronda' && 'Cada pedido requiere pago antes de enviarse a cocina. El impago es imposible.'}
              {config.modo_cobro === 'cuenta_abierta' && 'El cliente paga cuando quiere. Si no paga, el camarero recibe alerta pasado el tiempo configurado.'}
            </div>
            {saving && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>Guardando...</span>}
            {msg && <span style={{ fontFamily: SM, fontSize: 10, color: msg === 'Guardado' ? C.green : C.red }}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Panel: sesiones QR con pre-auth pendientes de cobro ───────
function PreauthPendientesPanel({ restauranteId, sh }: { restauranteId: string; sh: () => Record<string,string> }) {
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})

  const cargar = () => {
    fetch(`/api/qr/sesiones-preauth?restaurante_id=${restauranteId}`, { headers: sh() })
      .then(r => r.json())
      .then(d => { setSesiones(d.sesiones || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  const cobrar = async (s: any) => {
    const importe = prompt(`Importe a cobrar (€) para mesa ${s.mesa_codigo}:`, s.total_estimado?.toString() || '')
    if (!importe || isNaN(parseFloat(importe))) return
    setCobrando(s.id)
    const r = await fetch('/api/qr/cobrar-preauth', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sesion_id: s.id, importe_eur: parseFloat(importe) }),
    })
    const d = await r.json()
    setMsg(prev => ({ ...prev, [s.id]: d.ok ? `✓ ${d.mensaje}` : `✗ ${d.error}` }))
    setCobrando(null)
    if (d.ok) setTimeout(() => cargar(), 1000)
  }

  if (loading || sesiones.length === 0) return null

  return (
    <div style={{ marginTop: 28, background: '#1F1A15', borderRadius: 14, padding: '18px 20px', border: `1px solid ${C.amber}44` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: SM, fontSize: 10, color: C.amber, letterSpacing: '.1em' }}>⚠ PENDIENTES DE COBRO (PRE-AUTH)</span>
        <span style={{ background: C.amber + '22', color: C.amber, fontFamily: SM, fontSize: 9, borderRadius: 10, padding: '1px 7px' }}>{sesiones.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sesiones.map(s => (
          <div key={s.id} style={{ background: C.paper, borderRadius: 10, padding: '10px 14px', border: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>Mesa {s.mesa_codigo}</div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>
                {Math.round(s.minutos_abierta || 0)}min · tarjeta capturada ✓
              </div>
              {msg[s.id] && (
                <div style={{ fontFamily: SN, fontSize: 11, color: msg[s.id].startsWith('✓') ? C.green : C.red, marginTop: 3 }}>{msg[s.id]}</div>
              )}
            </div>
            <button onClick={() => cobrar(s)} disabled={cobrando === s.id}
              style={{ padding: '8px 16px', background: cobrando === s.id ? C.paper2 : C.red, border: 'none', borderRadius: 9, color: cobrando === s.id ? C.ink3 : '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: cobrando === s.id ? 'not-allowed' : 'pointer' }}>
              {cobrando === s.id ? 'Cobrando...' : 'Cobrar →'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
function ServicioTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '', 'Content-Type': 'application/json' })
  const [form, setForm] = useState({
    servicio_activo:      false,
    servicio_precio:      1.50,
    servicio_nombre:      'Cubierto',
    servicio_auto:        true,
    servicio_skip:        true,
    servicio_preguntar_voz: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  useEffect(() => {
    fetch('/api/owner/config/servicio', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.config) setForm({
          servicio_activo:        d.config.servicio_activo         ?? false,
          servicio_precio:        parseFloat(d.config.servicio_precio) || 1.50,
          servicio_nombre:        d.config.servicio_nombre         ?? 'Cubierto',
          servicio_auto:          d.config.servicio_auto           ?? true,
          servicio_skip:          d.config.servicio_skip           ?? true,
          servicio_preguntar_voz: d.config.servicio_preguntar_voz  ?? false,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    setSaving(true); setMsg('')
    const r = await fetch('/api/owner/config/servicio', {
      method: 'PUT', headers: sh(), body: JSON.stringify(form)
    })
    setSaving(false)
    setMsg(r.ok ? 'Guardado ✓' : 'Error al guardar')
    if (r.ok) setTimeout(() => setMsg(''), 3000)
  }

  const toggle = (key: keyof typeof form) =>
    setForm(f => ({ ...f, [key]: !f[key] }))

  const ToggleRow = ({ label, sub, k }: { label: string; sub?: string; k: 'servicio_activo'|'servicio_auto'|'servicio_skip'|'servicio_preguntar_voz' }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:`1px solid ${C.rule}` }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, color:C.ink, fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:C.ink3, marginTop:2 }}>{sub}</div>}
      </div>
      <button onClick={() => toggle(k)} style={{
        width:42, height:24, borderRadius:12, border:'none', cursor:'pointer',
        background: form[k] ? C.red : C.rule, position:'relative', transition:'background .2s', flexShrink:0,
      }}>
        <div style={{
          position:'absolute', top:3, left: form[k] ? 21 : 3,
          width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s',
        }}/>
      </button>
    </div>
  )

  if (loading) return <div style={{ padding:24, color:C.ink3, fontFamily:SN }}>Cargando...</div>

  const totalEjemplo = (form.servicio_precio * 4).toFixed(2).replace('.', ',')

  return (
    <div style={{ padding:'0 0 40px' }}>
      <style>{`.srv-input:focus{border-color:${C.red}!important;outline:none}`}</style>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:22, color:C.ink, marginBottom:4 }}>
          Servicio de mesa
        </div>
        <div style={{ fontSize:13, color:C.ink3 }}>
          Cubierto, pan, agua — cobro automático por comensal al abrir la primera comanda.
        </div>
      </div>

      {/* Toggle principal */}
      <div style={{
        background: form.servicio_activo ? C.redS : C.bone,
        border: `1.5px solid ${form.servicio_activo ? C.red+'66' : C.rule}`,
        borderRadius:12, padding:'16px 20px', marginBottom:20, transition:'all .2s',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:500, color:C.ink }}>Cobrar servicio de mesa</div>
            <div style={{ fontSize:12, color:C.ink3, marginTop:3 }}>
              {form.servicio_activo
                ? 'Activo · se añade automáticamente a la primera comanda'
                : 'Desactivado · sin cobro de cubierto'}
            </div>
          </div>
          <button onClick={() => toggle('servicio_activo')} style={{
            width:48, height:28, borderRadius:14, border:'none', cursor:'pointer',
            background: form.servicio_activo ? C.red : C.rule, position:'relative', transition:'background .2s', flexShrink:0,
          }}>
            <div style={{
              position:'absolute', top:4, left: form.servicio_activo ? 24 : 4,
              width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s',
            }}/>
          </button>
        </div>
      </div>

      {/* Config detalle */}
      <div style={{
        background:C.bone, border:`1px solid ${C.rule}`, borderRadius:12, padding:'4px 20px 16px',
        marginBottom:16, opacity: form.servicio_activo ? 1 : 0.45, transition:'opacity .2s',
      }}>
        {/* Nombre en ticket */}
        <div style={{ padding:'12px 0', borderBottom:`1px solid ${C.rule}` }}>
          <div style={{ fontSize:13, color:C.ink3, marginBottom:6 }}>Nombre en el ticket</div>
          <input
            className="srv-input"
            value={form.servicio_nombre}
            onChange={e => setForm(f => ({ ...f, servicio_nombre: e.target.value }))}
            disabled={!form.servicio_activo}
            style={{
              width:'100%', padding:'9px 12px',
              border:`1px solid ${C.rule}`, borderRadius:8,
              background:C.paper, color:C.ink, fontSize:14, fontFamily:SN,
            }}
          />
        </div>

        {/* Precio */}
        <div style={{ padding:'12px 0', borderBottom:`1px solid ${C.rule}` }}>
          <div style={{ fontSize:13, color:C.ink3, marginBottom:6 }}>Precio por comensal</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input
              className="srv-input"
              type="number" min={0} max={20} step={0.25}
              value={form.servicio_precio}
              onChange={e => setForm(f => ({ ...f, servicio_precio: parseFloat(e.target.value) || 0 }))}
              disabled={!form.servicio_activo}
              style={{
                width:100, padding:'9px 12px',
                border:`1px solid ${C.rule}`, borderRadius:8,
                background:C.paper, color:C.ink, fontSize:14, fontFamily:SM,
              }}
            />
            <span style={{ fontSize:13, color:C.ink3 }}>€ / pax</span>
          </div>
        </div>

        <ToggleRow
          k="servicio_auto"
          label="Añadir automáticamente"
          sub="Al abrir primera comanda, sin que el camarero tenga que confirmarlo"
        />
        <ToggleRow
          k="servicio_skip"
          label="Permitir omitir"
          sub="El camarero puede saltarse el cubierto mesa a mesa si el cliente no lo quiere"
        />
        <ToggleRow
          k="servicio_preguntar_voz"
          label="Preguntar comensales al dictar por voz"
          sub="Si el camarero no lo dice en la frase, el sistema pregunta antes de confirmar. Recomendado para restaurantes, no para bares."
        />
      </div>

      {/* Preview */}
      {form.servicio_activo && (
        <div style={{
          background:C.amberS, border:`1px solid ${C.amber}55`,
          borderRadius:10, padding:'12px 16px', marginBottom:20,
          display:'flex', alignItems:'center', gap:12,
        }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:C.amber, fontFamily:SM, letterSpacing:'.06em', marginBottom:3 }}>
              EJEMPLO · 4 COMENSALES
            </div>
            <div style={{ fontSize:14, color:C.ink2 }}>
              1× {form.servicio_nombre || 'Cubierto'} (4 pax)
            </div>
          </div>
          <div style={{ fontFamily:SM, fontSize:16, fontWeight:700, color:C.amber }}>
            {totalEjemplo} €
          </div>
        </div>
      )}

      {/* Nota zonas */}
      {/* ── Override por zona ───────────────────────────── */}
      <ZonaCubiertoOverride sesion={sh()} precioGlobal={form.servicio_precio} activoGlobal={form.servicio_activo} />

      {/* Botón guardar */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button
          onClick={guardar}
          disabled={saving}
          style={{
            padding:'12px 28px', borderRadius:9, border:'none',
            background:C.red, color:'#fff', fontSize:14, fontWeight:500,
            fontFamily:SN, cursor:saving?'wait':'pointer', opacity:saving?0.7:1,
          }}
        >
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {msg && (
          <div style={{
            fontSize:13, color: msg.includes('Error') ? C.red : C.green,
            fontFamily:SM,
          }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Tab: Reservas ─── */
const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente:  { label: 'Pendiente',  bg: C.amberS,  fg: '#7A5A1A' },
  confirmada: { label: 'Confirmada', bg: C.greenS,   fg: C.green   },
  sentada:    { label: 'En mesa',    bg: '#E0D8FF',  fg: '#5B4CB0' },
  cancelada:  { label: 'Cancelada',  bg: C.redS,     fg: C.redD    },
  no_show:    { label: 'No show',    bg: C.paper2,   fg: C.ink3    },
}
const CANAL_ICON: Record<string, string> = {
  manual: '✍', telefono: '📞', web: '🌐', thefork: '🍴', covermanager: '📅',
}

function ReservasTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const hoy = () => new Date().toISOString().slice(0, 10)

  const [fecha, setFecha] = useState(hoy())
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [mesasDisp, setMesasDisp] = useState<{ id: string; codigo: string; nombre: string | null; capacidad: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Reserva }>(null)
  const [form, setForm] = useState({
    nombre_cliente: '', telefono: '', num_personas: '2',
    fecha_reserva: hoy(), hora_reserva: '13:00',
    duracion_min: '90', notas: '', canal: 'manual', mesa_id: '',
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (f = fecha) => {
    setLoading(true)
    const r = await fetch(`/api/owner/reservas?fecha=${f}`, { headers: sh() })
    const d = await r.json()
    setReservas(d.reservas || [])
    setMesasDisp(d.mesas || [])
    setLoading(false)
  }, [fecha])

  useEffect(() => { load(fecha) }, [fecha])

  const openCreate = () => {
    setForm({ nombre_cliente: '', telefono: '', num_personas: '2',
      fecha_reserva: fecha, hora_reserva: '13:00',
      duracion_min: '90', notas: '', canal: 'manual', mesa_id: '' })
    setErr(''); setModal('create')
  }
  const openEdit = (r: Reserva) => {
    setForm({
      nombre_cliente: r.nombre_cliente, telefono: r.telefono || '',
      num_personas: String(r.num_personas), fecha_reserva: r.fecha_reserva,
      hora_reserva: r.hora_reserva.slice(0, 5), duracion_min: String(r.duracion_min),
      notas: r.notas || '', canal: r.canal, mesa_id: r.mesa_id || '',
    })
    setErr(''); setModal({ edit: r })
  }

  const save = async () => {
    setErr('')
    if (!form.nombre_cliente.trim()) return setErr('Nombre requerido')
    if (!form.hora_reserva) return setErr('Hora requerida')
    const n = parseInt(form.num_personas)
    if (!n || n < 1) return setErr('Personas inválido')
    setSaving(true)
    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const url = '/api/owner/reservas'
    const body = {
      ...(isEdit ? { id: (modal as { edit: Reserva }).edit.id } : {}),
      nombre_cliente: form.nombre_cliente.trim(),
      telefono: form.telefono.trim() || null,
      num_personas: n,
      fecha_reserva: form.fecha_reserva,
      hora_reserva: form.hora_reserva,
      duracion_min: parseInt(form.duracion_min) || 90,
      notas: form.notas.trim() || null,
      canal: form.canal,
      mesa_id: form.mesa_id || null,
    }
    const r = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); return setErr(d.error || 'Error') }
    await load(fecha); setModal(null)
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/owner/reservas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, estado }),
    })
    await load(fecha)
  }

  const cancelar = async (id: string) => {
    await fetch('/api/owner/reservas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id }),
    })
    await load(fecha)
  }

  const asignarMesa = async (id: string, mesa_id: string) => {
    await fetch('/api/owner/reservas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, mesa_id: mesa_id || null, estado: mesa_id ? 'sentada' : 'confirmada' }),
    })
    await load(fecha)
  }

  const fmtHora = (t: string) => t.slice(0, 5)
  const fmtHoraFin = (t: string, dur: number) => {
    const [h, m] = t.split(':').map(Number)
    const tot = h * 60 + m + dur
    return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
  }

  const totalPax = reservas.reduce((s, r) => s + r.num_personas, 0)
  const esHoy = fecha === hoy()

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Agenda</div>
          <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Reservas</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ fontFamily: SM, fontSize: 12, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '7px 10px', background: C.bone, color: C.ink, outline: 'none' }}
          />
          {!esHoy && (
            <Btn variant="ghost" onClick={() => setFecha(hoy())}>Hoy</Btn>
          )}
          <Btn variant="primary" onClick={openCreate}>
            <Icon d={ICONS.plus} size={15}/>Nueva reserva
          </Btn>
        </div>
      </div>

      {/* Stats del día */}
      {!loading && reservas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginBottom: 20 }}>
          {[
            { val: reservas.length, label: 'Reservas', color: C.ink },
            { val: totalPax, label: 'Comensales', color: C.red },
            { val: reservas.filter(r => r.estado === 'confirmada').length, label: 'Confirmadas', color: C.green },
            { val: reservas.filter(r => r.estado === 'pendiente').length, label: 'Pendientes', color: '#7A5A1A' },
          ].map(s => (
            <div key={s.label} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista / Timeline */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>
      ) : reservas.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', border: `1px dashed ${C.rule}`, borderRadius: 12 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink3, marginBottom: 8 }}>
            Sin reservas para este día
          </div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, marginBottom: 20 }}>
            {esHoy ? 'El día está libre' : 'Puedes añadir reservas para cualquier fecha'}
          </div>
          <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={14}/>Añadir reserva</Btn>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reservas.map(r => {
            const meta = ESTADO_META[r.estado] || ESTADO_META.pendiente
            const mesaLabel = r.mesas ? (r.mesas.nombre ? `${r.mesas.codigo} · ${r.mesas.nombre}` : r.mesas.codigo) : null
            return (
              <div key={r.id} style={{
                background: C.bone, border: `1px solid ${C.rule}`,
                borderLeft: `4px solid ${r.estado === 'confirmada' ? C.green : r.estado === 'sentada' ? '#7B5EA7' : r.estado === 'pendiente' ? C.amber : C.ink3}`,
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  {/* Hora */}
                  <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 52 }}>
                    <div style={{ fontFamily: SM, fontSize: 17, fontWeight: 700, color: C.ink }}>{fmtHora(r.hora_reserva)}</div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{fmtHoraFin(r.hora_reserva, r.duracion_min)}</div>
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <div style={{ fontFamily: SN, fontSize: 15, fontWeight: 700, color: C.ink }}>{r.nombre_cliente}</div>
                      <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                        background: meta.bg, color: meta.fg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                      <span>👥 {r.num_personas} pax</span>
                      {r.telefono && <span>{CANAL_ICON['telefono']} {r.telefono}</span>}
                      <span>{CANAL_ICON[r.canal] || '✍'} {r.canal}</span>
                      {mesaLabel && <span style={{ color: '#5B4CB0', fontWeight: 600 }}>🪑 {mesaLabel}</span>}
                    </div>
                    {r.notas && (
                      <div style={{ marginTop: 6, fontFamily: SE, fontStyle: 'italic', fontSize: 12, color: C.amber }}>
                        &ldquo;{r.notas}&rdquo;
                      </div>
                    )}
                  </div>
                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.estado === 'pendiente' && (
                      <button onClick={() => cambiarEstado(r.id, 'confirmada')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.green}66`,
                          background: C.greenS, color: C.green, fontFamily: SM, fontSize: 10, fontWeight: 700,
                          cursor: 'pointer', letterSpacing: '.06em' }}>
                        CONFIRMAR
                      </button>
                    )}
                    {(r.estado === 'pendiente' || r.estado === 'confirmada') && !r.mesa_id && (
                      <select
                        onChange={e => e.target.value && asignarMesa(r.id, e.target.value)}
                        defaultValue=""
                        style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.rule}`,
                          background: C.paper, color: C.ink3, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                        <option value="">🪑 Sentar...</option>
                        {mesasDisp.filter(m => m.capacidad >= r.num_personas).map(m => (
                          <option key={m.id} value={m.id}>{m.codigo} ({m.capacidad}p)</option>
                        ))}
                        {mesasDisp.filter(m => m.capacidad < r.num_personas).map(m => (
                          <option key={m.id} value={m.id}>{m.codigo} ({m.capacidad}p) ⚠</option>
                        ))}
                      </select>
                    )}
                    {r.estado === 'sentada' && (
                      <button onClick={() => asignarMesa(r.id, '')}
                        style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.rule}`,
                          background: 'transparent', color: C.ink3, fontFamily: SM, fontSize: 9, cursor: 'pointer' }}>
                        Liberar mesa
                      </button>
                    )}
                    <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Icon d={ICONS.edit} size={13}/>
                    </Btn>
                    <button onClick={() => cambiarEstado(r.id, 'no_show')}
                      title="No-show"
                      style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.rule}`,
                        background: 'transparent', color: C.ink4, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                      ✗ NS
                    </button>
                    <Btn size="sm" variant="danger" onClick={() => cancelar(r.id)}>
                      <Icon d={ICONS.trash} size={13}/>
                    </Btn>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear / editar */}
      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal
          title={modal === 'create' ? 'Nueva reserva' : 'Editar reserva'}
          onClose={() => setModal(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nombre del cliente" value={form.nombre_cliente}
              onChange={v => setForm(f => ({ ...f, nombre_cliente: v }))} placeholder="Marta García"/>
            <Field label="Teléfono (opcional)" value={form.telefono}
              onChange={v => setForm(f => ({ ...f, telefono: v }))} placeholder="+34 600 000 000"/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Comensales" value={form.num_personas} type="number"
                onChange={v => setForm(f => ({ ...f, num_personas: v }))} placeholder="2"/>
              <Field label="Duración (min)" value={form.duracion_min} type="number"
                onChange={v => setForm(f => ({ ...f, duracion_min: v }))} placeholder="90"/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Fecha" value={form.fecha_reserva} type="date"
                onChange={v => setForm(f => ({ ...f, fecha_reserva: v }))}/>
              <Field label="Hora" value={form.hora_reserva} type="time"
                onChange={v => setForm(f => ({ ...f, hora_reserva: v }))}/>
            </div>
            <Select label="Canal" value={form.canal} onChange={v => setForm(f => ({ ...f, canal: v }))}
              options={[
                { value: 'manual',      label: '✍ Manual' },
                { value: 'telefono',    label: '📞 Teléfono' },
                { value: 'web',         label: '🌐 Web' },
                { value: 'thefork',     label: '🍴 TheFork' },
                { value: 'covermanager',label: '📅 CoverManager' },
              ]}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.ink3, textTransform: 'uppercase' }}>Mesa (opcional)</label>
              <select value={form.mesa_id} onChange={e => setForm(f => ({ ...f, mesa_id: e.target.value }))}
                style={{ fontFamily: SN, fontSize: 14, background: C.bone, border: `1px solid ${C.rule}`,
                  borderRadius: 4, padding: '8px 10px', color: C.ink, outline: 'none' }}>
                <option value="">Sin asignar</option>
                {mesasDisp.map(m => (
                  <option key={m.id} value={m.id}>{m.codigo}{m.nombre ? ` · ${m.nombre}` : ''} ({m.capacidad}p)</option>
                ))}
              </select>
            </div>
            <Field label="Notas (opcional)" value={form.notas}
              onChange={v => setForm(f => ({ ...f, notas: v }))} placeholder='ej. "Alérgica al gluten · mesa exterior"'/>
            {err && <div style={{ fontFamily: SM, fontSize: 11, color: C.red }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} disabled={saving}>
                <Icon d={ICONS.check} size={14}/>{saving ? 'Guardando...' : modal === 'create' ? 'Crear' : 'Guardar'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const GRUPOS = [
  {
    // Sala: supervisor primero (uso diario en servicio), luego setup de personal y espacio
    id: 'sala', label: 'Sala', icon: ICONS.users,
    tabs: [
      { id: 'supervisor', label: 'Supervisor',   icon: ICONS.clock  }, // diario durante servicio
      { id: 'camareros',  label: 'Camareros',    icon: ICONS.users  }, // semanal/mensual
      { id: 'mesas',      label: 'Mesas',        icon: ICONS.grid   }, // setup inicial, raro
    ]
  },
  {
    // Carta: productos primero (actualizar carta, precios, 86), secciones es setup
    id: 'carta', label: 'Carta', icon: ICONS.book,
    tabs: [
      { id: 'carta',     label: 'Productos', icon: ICONS.book    }, // frecuente
      { id: 'secciones', label: 'Secciones', icon: ICONS.sparkle }, // setup inicial
    ]
  },
  {
    // Servicio: operativo diario primero (turno y caja se abren/cierran cada servicio),
    // reservas antes del servicio, analytics consulta semanal, cubierto se configura una vez
    id: 'servicio', label: 'Servicio', icon: ICONS.chart,
    tabs: [
      { id: 'turno',     label: 'Turno',     icon: ICONS.clock    }, // diario x2 (abrir/cerrar)
      { id: 'caja',      label: 'Caja',      icon: ICONS.receipt  }, // diario durante servicio
      { id: 'reservas',  label: 'Reservas',  icon: ICONS.calendar }, // diario antes del servicio
      { id: 'analytics', label: 'Analytics', icon: ICONS.chart    }, // semanal
      { id: 'cubierto',  label: 'Cubierto',  icon: ICONS.receipt  }, // se configura una vez
    ]
  },
  {
    // Config: hardware primero (impresoras se consulta cuando algo falla),
    // flujos y QR son setup importantes, el resto es configuración que se toca raramente
    id: 'config', label: 'Config', icon: ICONS.shield,
    tabs: [
      { id: 'impresoras',     label: 'Impresoras',     icon: ICONS.printer       }, // se revisa si hay problemas
      { id: 'flujos',         label: 'Flujos',         icon: ICONS.wifi          }, // setup + ajustes puntuales
      { id: 'qr',             label: 'QR Mesa',        icon: ICONS.qr            }, // al habilitar/deshabilitar mesas
      { id: 'notificaciones', label: 'Notificaciones', icon: ICONS.alertTriangle }, // setup inicial
      { id: 'restaurante',    label: 'Restaurante',    icon: ICONS.shield        }, // setup inicial (NIF, logo)
      { id: 'suscripcion',    label: 'Suscripción',    icon: ICONS.receipt       }, // mensual / raramente
    ]
  },
  {
    // Auditoría: separado del resto porque es legal/fiscal — consulta periódica o ante incidencias
    id: 'auditoria', label: 'Auditoría', icon: ICONS.alertTriangle,
    tabs: [
      { id: 'facturas',       label: 'Facturas',       icon: ICONS.receipt       }, // consulta periódica (contabilidad)
      { id: 'modificaciones', label: 'Modificaciones', icon: ICONS.alertTriangle }, // ante incidencias / revisión
    ]
  },
]

function getGrupo(tabId: string) {
  return GRUPOS.find(g => g.tabs.some(t => t.id === tabId)) ?? GRUPOS[0]
}

// ─── Componente checklist de configuración ───────────────────────────────────
interface SetupStatus {
  tiene_camareros: boolean
  tiene_productos: boolean
  tiene_mesas: boolean
  turno_activo: boolean
}

function SetupChecklist({ status, setTab, onDismiss }: {
  status: SetupStatus
  setTab: (t: string) => void
  onDismiss: () => void
}) {
  const completados = Object.values(status).filter(Boolean).length
  const total = Object.values(status).length
  const todo_listo = completados === total

  if (todo_listo) return null

  const pasos = [
    {
      hecho: status.tiene_camareros,
      titulo: 'Crear al menos un camarero de sala',
      desc: 'Sin camarero no se puede tomar comandas por voz.',
      cta: 'Ir a Camareros →',
      accion: () => setTab('camareros'),
    },
    {
      hecho: status.tiene_productos,
      titulo: 'Añadir tu carta',
      desc: 'Sube tu carta manualmente o desde una foto con IA.',
      cta: 'Ir a Carta →',
      accion: () => setTab('carta'),
    },
    {
      hecho: status.tiene_mesas,
      titulo: 'Revisar tus mesas',
      desc: 'Ya tienes mesas creadas por defecto. Puedes añadir o renombrarlas.',
      cta: 'Ir a Mesas →',
      accion: () => setTab('mesas'),
    },
    {
      hecho: status.turno_activo,
      titulo: 'Abrir el primer turno',
      desc: 'El camarero abre el turno desde /edge antes de empezar el servicio.',
      cta: null,
      accion: null,
    },
  ]

  return (
    <div style={{
      margin: '16px 20px 0',
      background: C.paper,
      border: `1px solid ${C.rule}`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: C.paper2,
        borderBottom: `1px solid ${C.rule}`,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink }}>
            Configura tu restaurante
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
            {completados} de {total} pasos completados
          </div>
        </div>
        {/* Barra de progreso */}
        <div style={{ width: 80, height: 4, background: C.rule, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${(completados / total) * 100}%`, height: '100%', background: C.red, borderRadius: 2, transition: 'width .3s' }} />
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
      </div>

      {/* Pasos */}
      <div style={{ padding: '4px 0' }}>
        {pasos.map((paso, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 20px',
            borderBottom: i < pasos.length - 1 ? `1px solid ${C.rule}` : 'none',
            opacity: paso.hecho ? 0.5 : 1,
            transition: 'opacity .2s',
          }}>
            {/* Check */}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: paso.hecho ? '#3F7D44' : C.paper2,
              border: `2px solid ${paso.hecho ? '#3F7D44' : C.rule}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              {paso.hecho && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 12 10 18 20 6"/>
                </svg>
              )}
            </div>
            {/* Contenido */}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
                {paso.titulo}
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
                {paso.desc}
              </div>
            </div>
            {/* CTA */}
            {paso.cta && !paso.hecho && (
              <button onClick={paso.accion!} style={{
                flexShrink: 0,
                background: C.red, color: '#fff', border: 'none',
                borderRadius: 6, padding: '7px 12px',
                fontFamily: SN, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {paso.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer soporte */}
      <div style={{
        background: C.paper2,
        borderTop: `1px solid ${C.rule}`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
          ¿Necesitas ayuda para configurarlo?
        </div>
        <a
          href="https://wa.me/34637349990?text=Hola,%20acabo%20de%20registrarme%20en%20ia.rest%20y%20necesito%20ayuda%20para%20configurar%20mi%20restaurante"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#25D366', color: '#fff',
            textDecoration: 'none',
            borderRadius: 6, padding: '7px 12px',
            fontFamily: SN, fontSize: 11, fontWeight: 700,
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp
        </a>
      </div>
    </div>
  )
}


/* ─── Tab Suscripción ──────────────────────────────────────────────────────── */
/* ─── ContratoSection ─── */
function ContratoSection({ restauranteId }: { restauranteId: string }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [aceptacion, setAceptacion] = React.useState<{ accepted_at: string; contract_version: string; ip_address: string } | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch(`/api/owner/contrato?restaurante_id=${restauranteId}`, { headers: sh() })
      .then(r => r.json())
      .then(d => { setAceptacion(d.aceptacion ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [restauranteId])

  const fecha = aceptacion
    ? new Date(aceptacion.accepted_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ marginTop: 24, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 14 }}>
        Mi contrato
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: C.ink3 }}>Cargando...</div>
      ) : aceptacion ? (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 4 }}>
            <div>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>
                Contrato de Prestación de Servicios SaaS
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
                Versión {aceptacion.contract_version} · Aceptado el {fecha}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3F7D44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 12 10 18 20 6"/>
              </svg>
              <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, color: '#3F7D44' }}>ACEPTADO</span>
            </div>
          </div>
          <a
            href="/contrato-iarest-v1.pdf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 14px', textDecoration: 'none', color: C.ink2, fontFamily: SN, fontSize: 12, fontWeight: 600, alignSelf: 'flex-start' as const }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Descargar contrato (PDF)
          </a>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>
          No se encontró registro de aceptación. Si acabas de registrarte, puede tardar unos minutos en aparecer.{' '}
          <a href="/contrato-iarest-v1.pdf" target="_blank" rel="noopener noreferrer" style={{ color: C.red }}>
            Descargar contrato aquí.
          </a>
        </div>
      )}
    </div>
  )
}

function SuscripcionTab({ restauranteId, onSetupClick }: { restauranteId: string; onSetupClick: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [billing, setBilling] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [portalLoading, setPortalLoading] = React.useState(false)

  React.useEffect(() => {
    fetch(`/api/owner/billing?restaurante_id=${restauranteId}`, { headers: sh() })
      .then(r => r.json())
      .then(d => { setBilling(d.billing); setLoading(false) })
      .catch(() => setLoading(false))
  }, [restauranteId])

  async function abrirPortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/owner/portal-stripe', { method: 'POST', headers: sh() })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert('No se pudo abrir el portal. Contacta por WhatsApp.')
    } catch { alert('Error. Contacta por WhatsApp.') }
    finally { setPortalLoading(false) }
  }

  const STATUS_COLOR: Record<string, string> = {
    trial:   C.amber, active: '#3F7D44', expired: C.red,
    past_due: C.red, cancelled: C.ink3,
  }
  const STATUS_LABEL: Record<string, string> = {
    trial:    'En período de prueba', active:   'Suscripción activa',
    expired:  'Trial expirado',        past_due: 'Pago pendiente',
    cancelled:'Cancelado',
  }

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.08em' }}>CARGANDO...</div>
  )

  if (!billing) return (
    <div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: C.ink3 }}>No se pudo cargar la información.</div>
  )

  const status: string = billing.plan_status ?? 'trial'
  const diasTrial: number = billing.dias_trial ?? 0
  const precioMensual: number = billing.precio_mensual ?? 59
  const camActivos: number = billing.camareros_activos ?? 0
  const maxCam: number = billing.max_camareros ?? 1
  const trialEnd: string = billing.trial_end ? new Date(billing.trial_end).toLocaleDateString('es-ES') : ''

  return (
    <div style={{ padding: '24px 20px', maxWidth: 580 }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 24 }}>
        Tu suscripción
      </div>

      {/* Estado */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[status] ?? C.ink3, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
            {STATUS_LABEL[status] ?? status}
          </div>
          {status === 'trial' && (
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>
              {diasTrial > 0
                ? `Te quedan ${diasTrial} día${diasTrial !== 1 ? 's' : ''} de prueba gratuita`
                : `El trial ha expirado el ${trialEnd}`}
            </div>
          )}
          {status === 'active' && (
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Suscripción activa y al día</div>
          )}
        </div>
        {status === 'trial' && diasTrial > 0 && (
          <div style={{
            fontFamily: SM, fontSize: 28, fontWeight: 700, color: diasTrial <= 3 ? C.red : C.amber,
            letterSpacing: '-1px',
          }}>
            {diasTrial}d
          </div>
        )}
      </div>

      {/* Trial expirando pronto */}
      {status === 'trial' && diasTrial <= 3 && diasTrial > 0 && (
        <div style={{ background: 'rgba(217,68,43,.08)', border: `1px solid rgba(217,68,43,.3)`, borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
          <strong style={{ color: C.red }}>⚠ El trial expira pronto.</strong> Activa tu suscripción para no perder el acceso.
        </div>
      )}

      {/* Trial expirado */}
      {(status === 'expired' || (status === 'trial' && diasTrial <= 0)) && (
        <div style={{ background: 'rgba(217,68,43,.08)', border: `1px solid rgba(217,68,43,.3)`, borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
          <strong style={{ color: C.red }}>Trial expirado.</strong> Activa tu suscripción para seguir usando ia.rest.
        </div>
      )}

      {/* Precio */}
      <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>Plan actual</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 36, color: C.ink, lineHeight: 1 }}>{precioMensual}€</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 4 }}>/mes</div>
        </div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>
          {camActivos <= 1 && '59€ base · 1 usuario'}
          {camActivos > 1 && camActivos <= 6 && `59€ base + ${camActivos - 1} usuarios × 20€`}
          {camActivos > 6 && `59€ base + 5 usuarios × 20€ + ${camActivos - 6} usuarios × 15€`}
        </div>
        <div style={{ marginTop: 8, fontFamily: SN, fontSize: 12, color: C.ink3 }}>
          {camActivos} usuario{camActivos !== 1 ? 's' : ''} activo{camActivos !== 1 ? 's' : ''}
          {maxCam < 999 && ` · máx ${maxCam} contratados`}
        </div>
      </div>

      {/* CTA según estado */}
      {status === 'active' && billing.stripe_subscription_id && (
        <button
          onClick={abrirPortal}
          disabled={portalLoading}
          style={{ display: 'block', width: '100%', background: C.ink, color: C.paper, border: 'none', padding: '14px', borderRadius: 10, fontFamily: SN, fontSize: 14, fontWeight: 700, marginBottom: 12, cursor: portalLoading ? 'wait' : 'pointer' }}
        >
          {portalLoading ? 'Abriendo...' : 'Gestionar suscripción →'}
        </button>
      )}
      {(status === 'trial' || status === 'expired') && !billing.stripe_subscription_id && (
        <a
          href="https://wa.me/34637349990?text=Hola,%20quiero%20activar%20mi%20suscripci%C3%B3n%20de%20ia.rest"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', background: C.red, color: '#fff', textDecoration: 'none', textAlign: 'center', padding: '14px', borderRadius: 10, fontFamily: SN, fontSize: 14, fontWeight: 700, marginBottom: 12 }}
        >
          Activar suscripción →
        </a>
      )}
      {(status === 'trial' || status === 'expired') && billing.stripe_subscription_id && (
        <button
          onClick={abrirPortal}
          disabled={portalLoading}
          style={{ display: 'block', width: '100%', background: C.red, color: '#fff', border: 'none', padding: '14px', borderRadius: 10, fontFamily: SN, fontSize: 14, fontWeight: 700, marginBottom: 12, cursor: portalLoading ? 'wait' : 'pointer' }}
        >
          {portalLoading ? 'Abriendo...' : 'Añadir método de pago →'}
        </button>
      )}

      {/* Añadir usuarios */}
      {camActivos >= maxCam && maxCam < 999 && (
        <div style={{ background: 'rgba(232,163,59,.08)', border: `1px solid rgba(232,163,59,.3)`, borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: C.ink2 }}>
          Has llegado al límite de {maxCam} usuarios. Para añadir más,{' '}
          <a href="https://wa.me/34637349990?text=Quiero%20ampliar%20usuarios%20en%20ia.rest" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366' }}>
            escríbenos por WhatsApp
          </a>.
        </div>
      )}

      {/* Soporte */}
      <div style={{ marginTop: 8, fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.7 }}>
        ¿Tienes dudas sobre tu suscripción?{' '}
        <a href="https://wa.me/34637349990" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366' }}>
          WhatsApp +34 637 349 990
        </a>
      </div>

      {/* ─── Mi contrato ─── */}
      <ContratoSection restauranteId={restauranteId} />
    </div>
  )
}


export default function OwnerPage() {
  const { session, checking } = useAuth('owner')
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [tab, setTab] = useState('camareros')
  const [setupStatus, setSetupStatus] = useState<{ tiene_camareros:boolean; tiene_productos:boolean; tiene_mesas:boolean; turno_activo:boolean } | null>(null)
  const [showChecklist, setShowChecklist] = useState(true)

  useEffect(() => {
    if (!session) return
    const h = { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' }
    // Check onboarding status — redirect if not completed yet
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const skipOnboarding = params.get('onboarding') === 'done'
    if (!skipOnboarding) {
      fetch('/api/owner/restaurante', { headers: h })
        .then(r => r.json())
        .then(d => {
          if (d.restaurante && d.restaurante.onboarding_completado === false) {
            window.location.href = '/onboarding'
          }
        })
        .catch(() => {})
    }
    Promise.all([
      fetch('/api/owner/camareros', { headers: h }).then(r => r.json()),
      fetch('/api/owner/carta',     { headers: h }).then(r => r.json()),
      fetch('/api/owner/mesas',     { headers: h }).then(r => r.json()),
      fetch('/api/owner/turno',     { headers: h }).then(r => r.json()),
    ]).then(([cams, carta, mesas, turno]) => {
      const camarerosSala = (cams.camareros ?? []).filter((c: any) => c.rol === 'camarero' || c.rol === 'jefe_sala')
      setSetupStatus({
        tiene_camareros: camarerosSala.length > 0,
        tiene_productos: (carta.productos ?? []).length > 0,
        tiene_mesas:     (mesas.mesas ?? []).length > 0,
        turno_activo:    turno.turno?.estado === 'activo',
      })
    }).catch(() => {})
  }, [session])

  const logout = () => {
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  const [misRestaurantes, setMisRestaurantes] = useState<{id:string;nombre:string;ciudad:string}[]>([])
  const [switchingRest, setSwitchingRest] = useState(false)

  useEffect(() => {
    if (!session?.cuenta_id) return
    const h = { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' }
    fetch('/api/owner/mis-restaurantes', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.restaurantes?.length > 1) setMisRestaurantes(d.restaurantes) })
      .catch(() => {})
  }, [session?.cuenta_id])

  const cambiarRestaurante = async (restaurante_id: string) => {
    if (!session?.cuenta_id || restaurante_id === session.restaurante_id) return
    setSwitchingRest(true)
    try {
      const r = await fetch('/api/auth/seleccionar-restaurante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: session.cuenta_id, restaurante_id }),
      })
      const d = await r.json()
      if (d.session) {
        localStorage.setItem('ia_rest_session', JSON.stringify(d.session))
        window.location.reload()
      }
    } catch { setSwitchingRest(false) }
  }

  if (checking || !session) return (
    <div style={{ minHeight: '100dvh', background: C.paper }}/>
  )

  return (
    <div style={{ minHeight: '100dvh', background: C.paper, fontFamily: SN }}>
      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${C.red} !important; box-shadow: 0 0 0 3px rgba(217,68,43,.15); }
        button { font-family: ${SN}; }
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .owner-tabs { display:flex; gap:2px; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .owner-tabs::-webkit-scrollbar { display:none; }
        .owner-subtabs { overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .owner-subtabs::-webkit-scrollbar { display:none; }
        .owner-tab-lbl { display:inline; }
        .owner-wrap { max-width:960px; margin:0 auto; padding:24px 20px 80px; }
        @media (max-width:640px) {
          .owner-tab-lbl { display:none; }
          .owner-wrap { padding:14px 10px 80px; }
          .owner-hdr-name { display:none; }
          .carta-table-wrap { min-width: 0 !important; overflow-x: auto; }
          .carta-table-row { grid-template-columns: 1fr 80px 80px 60px !important; gap: 8px !important; }
          .carta-table-row .col-hide { display: none; }
          .owner-form-2col { grid-template-columns: 1fr !important; }
          .owner-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .owner-action-row { flex-wrap: wrap; gap: 8px !important; }
        }
        @media (max-width:420px) {
          .carta-table-row { grid-template-columns: 1fr 70px 56px !important; }
          .owner-stats-grid { grid-template-columns: 1fr !important; }
        }
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
          {misRestaurantes.length > 1 && (
            <div style={{ position: 'relative' }}>
              <select
                value={session.restaurante_id}
                disabled={switchingRest}
                onChange={e => cambiarRestaurante(e.target.value)}
                style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6,
                  padding: '5px 28px 5px 10px', fontFamily: SM, fontSize: 11, fontWeight: 600,
                  color: C.ink, cursor: 'pointer', outline: 'none', letterSpacing: '.02em',
                  appearance: 'none', WebkitAppearance: 'none', maxWidth: 160 }}>
                {misRestaurantes.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}{r.ciudad ? ` · ${r.ciudad}` : ''}</option>
                ))}
              </select>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
                <path d="M2 3.5L5 6.5L8 3.5" stroke={C.ink3} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          )}
          <div className="owner-hdr-name" style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>{session.nombre}</div>
          <button onClick={() => window.location.href = '/onboarding'}
            style={{ background: 'none', border: `1px solid ${C.rule}`, borderRadius: 4, padding: '6px 10px', cursor: 'pointer', color: C.ink3, display: 'flex', alignItems: 'center', gap: 6 }}
            title="Guía de inicio">
            <Icon d={ICONS.book} size={14}/>
            <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600 }}>Guía</span>
          </button>
          <SugerenciaButton session={session} tema="light" variant="inline" />
          <div style={{ position:'relative' }} onMouseLeave={e => { const m = e.currentTarget.querySelector('[data-manuales]') as HTMLElement; if(m) m.style.display='none' }}>
            <button
              onMouseEnter={e => { const m = e.currentTarget.nextElementSibling as HTMLElement; if(m) m.style.display='flex' }}
              style={{ background:'none', border:`1px solid ${C.rule}`, borderRadius:4, padding:'6px 10px', cursor:'pointer', color:C.ink3, display:'flex', alignItems:'center', gap:6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-8M9 13l3 3 3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              <span style={{ fontFamily:SN, fontSize:12, fontWeight:600 }}>Manuales</span>
            </button>
            <div data-manuales="true" style={{ display:'none', position:'absolute', top:'calc(100% + 6px)', right:0, flexDirection:'column', gap:2, background:'#fff', border:`1px solid ${C.rule}`, borderRadius:6, padding:4, boxShadow:'0 4px 16px rgba(0,0,0,.08)', zIndex:200, minWidth:140 }}>
              {[
                { href:'/manuals/manual_camarero.pdf', label:'Camarero' },
                { href:'/manuals/manual_cocina.pdf',   label:'Cocina'   },
                { href:'/manuals/manual_owner.pdf',    label:'Owner'    },
              ].map(m => (
                <a key={m.href} href={m.href} download
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:4, textDecoration:'none', color:C.ink2, fontFamily:SN, fontSize:12, fontWeight:500 }}
                  onMouseOver={e => (e.currentTarget.style.background=C.paper2)}
                  onMouseOut={e => (e.currentTarget.style.background='transparent')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-8M9 13l3 3 3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  Manual {m.label}
                </a>
              ))}
            </div>
          </div>
          <button onClick={logout} style={{ background: 'none', border: `1px solid ${C.rule}`,
            borderRadius: 4, padding: '6px 10px', cursor: 'pointer', color: C.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon d={ICONS.logout} size={14}/>
            <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600 }}>Salir</span>
          </button>
        </div>
      </header>

      {setupStatus && showChecklist && (
        <SetupChecklist
          status={setupStatus}
          setTab={setTab}
          onDismiss={() => setShowChecklist(false)}
        />
      )}

      <div className="owner-wrap">
        {/* ── Nav grupos (4 pills) ── */}
        <div className="owner-tabs" style={{ marginBottom:4, gap:4 }}>
          {GRUPOS.map(g => {
            const activo = getGrupo(tab).id === g.id
            return (
              <button key={g.id}
                onClick={() => setTab(g.tabs[0].id)}
                style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6,
                  padding:'9px 16px', borderRadius:6, border:'none', cursor:'pointer',
                  background: activo ? C.ink : C.paper2,
                  color: activo ? C.paper : C.ink3,
                  fontFamily:SN, fontSize:13, fontWeight:600,
                  transition:'all .15s', whiteSpace:'nowrap' }}>
                <Icon d={g.icon} size={15}/>
                <span className="owner-tab-lbl">{g.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── Sub-tabs del grupo activo ── */}
        {(() => {
          const grupo = getGrupo(tab)
          if (grupo.tabs.length <= 1) return null
          return (
            <div className="owner-subtabs" style={{ display:'flex', gap:2, marginBottom:20, borderBottom:`1px solid ${C.rule}`, paddingBottom:0 }}>
              {grupo.tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 14px',
                    background:'none', border:'none', borderBottom:`2px solid ${tab===t.id ? C.red : 'transparent'}`,
                    color: tab===t.id ? C.ink : C.ink3,
                    fontFamily:SN, fontSize:12, fontWeight:tab===t.id?600:500,
                    cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s', marginBottom:-1 }}>
                  <Icon d={t.icon} size={13}/>
                  {t.label}
                </button>
              ))}
            </div>
          )
        })()}

        {/* ── Contenido ── */}
        <div style={{ marginTop: getGrupo(tab).tabs.length <= 1 ? 20 : 0 }}>
          {tab === 'supervisor'     && <SupervisorTab rol={session.rol} restauranteId={session.restaurante_id} sh={sh} />}
          {tab === 'qr'             && <QRTabOwner restauranteId={session.restaurante_id} sh={sh} />}
          {tab === 'cubierto'       && <ServicioTab/>}
          {tab === 'reservas'       && <ReservasTab/>}
          {tab === 'camareros'      && <CamarerosTab/>}
          {tab === 'mesas'          && <MesasTab/>}
          {tab === 'secciones'      && <SeccionesTab/>}
          {tab === 'carta'          && <CartaTab restauranteId={session.restaurante_id}/>}
          {tab === 'turno'          && <TurnoTab/>}
          {tab === 'caja'           && <CajaTab/>}
          {tab === 'analytics'      && <Analytics compact />}
          {tab === 'facturas'       && <FacturasTab/>}
          {tab === 'impresoras'     && <ImpresorasTab/>}
          {tab === 'flujos'         && <FlujoTab/>}
          {tab === 'notificaciones' && <NotificacionesTab/>}
          {tab === 'modificaciones' && <ModificacionesTab restauranteId={session.restaurante_id}/>}
          {tab === 'restaurante'    && <RestauranteTab/>}
          {tab === 'suscripcion'    && <SuscripcionTab restauranteId={session.restaurante_id} onSetupClick={() => setTab('camareros')}/>}
        </div>
      </div>
    </div>
  )
}
