'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

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
type Camarero = { id: string; nombre: string; pin: string; rol: string; activo: boolean }
type Mesa = { id: string; codigo: string; zona: string; capacidad: number; estado: string }
type Turno = { id: string; nombre: string; estado: string; created_at: string; fecha: string }
type TurnoStats = { total_comandas: number; avg_latencia_ms: number | null; mesas_activas: { codigo: string; count: number }[] }

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
}

const ZONA_LABEL: Record<string, string> = { salon: 'Salón', terraza: 'Terraza', barra: 'Barra' }
const ROL_LABEL: Record<string, string> = { camarero: 'Camarero', admin: 'Admin' }

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
function CamarerosTab() {
  const [camareros, setCamareros] = useState<Camarero[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Camarero } | { del: Camarero }>(null)
  const [form, setForm] = useState({ nombre: '', pin: '', rol: 'camarero', activo: true })
  const [showPins, setShowPins] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/camareros')
    const d = await r.json()
    setCamareros(d.camareros || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ nombre: '', pin: '', rol: 'camarero', activo: true }); setErr(''); setModal('create') }
  const openEdit = (c: Camarero) => { setForm({ nombre: c.nombre, pin: c.pin, rol: c.rol, activo: c.activo }); setErr(''); setModal({ edit: c }) }
  const openDel = (c: Camarero) => { setModal({ del: c }) }

  const save = async () => {
    setErr('')
    if (!form.nombre.trim()) return setErr('Nombre requerido')
    if (!/^\d{4}$/.test(form.pin)) return setErr('PIN debe ser 4 dígitos')

    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const url = '/api/owner/camareros'
    const body = isEdit
      ? { id: (modal as { edit: Camarero }).edit.id, ...form }
      : form

    const r = await fetch(url, { method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/camareros', { method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: (modal as { del: Camarero }).del.id }) })
    await load(); setModal(null)
  }

  const toggleActivo = async (c: Camarero) => {
    await fetch('/api/owner/camareros', { method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, activo: !c.activo }) })
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
          <span>Nombre</span><span>Rol</span><span>PIN</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>

        {camareros.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: C.ink4, fontFamily: SN, fontSize: 14 }}>
            No hay camareros aún.
          </div>
        )}

        {camareros.map((c, i) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 100px',
            padding: '14px 20px', alignItems: 'center',
            borderBottom: i < camareros.length - 1 ? `1px solid ${C.rule}` : 'none',
            background: !c.activo ? C.paper : 'transparent' }}>
            <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: c.activo ? C.ink : C.ink4 }}>{c.nombre}</span>
            <span><Badge color={c.rol === 'admin' ? C.redS : C.paper2}>{ROL_LABEL[c.rol] || c.rol}</Badge></span>
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
            <Select label="Rol" value={form.rol} onChange={v => setForm(f => ({ ...f, rol: v }))}
              options={[{ value: 'camarero', label: 'Camarero' }, { value: 'admin', label: 'Admin' }]}/>
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
function MesasTab() {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | { edit: Mesa } | { del: Mesa }>(null)
  const [form, setForm] = useState({ codigo: '', zona: 'salon', capacidad: '4' })
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/mesas')
    const d = await r.json()
    setMesas(d.mesas || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ codigo: '', zona: 'salon', capacidad: '4' }); setErr(''); setModal('create') }
  const openEdit = (m: Mesa) => { setForm({ codigo: m.codigo, zona: m.zona, capacidad: String(m.capacidad) }); setErr(''); setModal({ edit: m }) }
  const openDel = (m: Mesa) => setModal({ del: m })

  const save = async () => {
    setErr('')
    if (!form.codigo.trim()) return setErr('Código requerido')
    const isEdit = modal && typeof modal === 'object' && 'edit' in modal
    const body = isEdit
      ? { id: (modal as { edit: Mesa }).edit.id, ...form, capacidad: parseInt(form.capacidad) || 4 }
      : { ...form, capacidad: parseInt(form.capacidad) || 4 }

    const r = await fetch('/api/owner/mesas', { method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error || 'Error')
    await load(); setModal(null)
  }

  const del = async () => {
    if (!modal || typeof modal !== 'object' || !('del' in modal)) return
    await fetch('/api/owner/mesas', { method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: (modal as { del: Mesa }).del.id }) })
    await load(); setModal(null)
  }

  const byZona = (zona: string) => mesas.filter(m => m.zona === zona)
  const ZONAS = ['salon', 'barra', 'terraza']

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SM, fontSize: 12 }}>CARGANDO...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink3, textTransform: 'uppercase' }}>Espacio</div>
          <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>Mesas</div>
        </div>
        <Btn variant="primary" onClick={openCreate}><Icon d={ICONS.plus} size={15}/>Añadir mesa</Btn>
      </div>

      {ZONAS.map(zona => {
        const ms = byZona(zona)
        if (ms.length === 0 && zona !== 'salon') return null
        return (
          <div key={zona} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.red,
              textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              {ZONA_LABEL[zona]}
              <span style={{ color: C.ink4 }}>· {ms.length} mesas</span>
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

      {modal && (modal === 'create' || (typeof modal === 'object' && 'edit' in modal)) && (
        <Modal title={modal === 'create' ? 'Nueva mesa' : 'Editar mesa'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Código (ej. T05, B02)" value={form.codigo} onChange={v => setForm(f => ({ ...f, codigo: v.toUpperCase() }))} placeholder="T05"/>
            <Select label="Zona" value={form.zona} onChange={v => setForm(f => ({ ...f, zona: v }))}
              options={ZONAS.map(z => ({ value: z, label: ZONA_LABEL[z] }))}/>
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

/* ─── Tab: Turno ─── */
function TurnoTab() {
  const [activo, setActivo] = useState<Turno | null>(null)
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [acting, setActing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/owner/turno')
    const d = await r.json()
    setActivo(d.activo)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrir = async () => {
    setActing(true)
    const r = await fetch('/api/owner/turno', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) })
    if (r.ok) { setNombre(''); await load() }
    setActing(false)
  }

  const cerrar = async () => {
    setActing(true)
    await fetch('/api/owner/turno', { method: 'DELETE' })
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
  const [data, setData] = useState<{ ultimo: Turno | null; stats: TurnoStats | null }>({ ultimo: null, stats: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/owner/turno').then(r => r.json()).then(d => {
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

/* ─── Main Page ─── */
const TABS = [
  { id: 'camareros', label: 'Camareros', icon: ICONS.users },
  { id: 'mesas',     label: 'Mesas',     icon: ICONS.grid  },
  { id: 'turno',     label: 'Turno',     icon: ICONS.clock },
  { id: 'resumen',   label: 'Resumen',   icon: ICONS.chart },
]

export default function OwnerPage() {
  const { session, checking } = useAuth('owner')
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
        {tab === 'camareros' && <CamarerosTab/>}
        {tab === 'mesas'     && <MesasTab/>}
        {tab === 'turno'     && <TurnoTab/>}
        {tab === 'resumen'   && <ResumenTab/>}
      </div>
    </div>
  )
}
