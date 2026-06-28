'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }
const formBox: React.CSSProperties = { marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }

function useSubmit(endpoint: string, method: 'POST' | 'PATCH' = 'POST') {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(body: unknown, query = '') {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(endpoint + query, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Error al guardar')
        return false
      }
      setOpen(false)
      router.refresh()
      return true
    } finally {
      setSaving(false)
    }
  }
  return { open, setOpen, saving, error, submit }
}

function Actions({ c }: { c: ReturnType<typeof useSubmit> }) {
  return (
    <>
      {c.error && <div className="badge danger" style={{ marginTop: 8 }}>{c.error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} disabled={c.saving}>{c.saving ? '…' : 'Guardar'}</button>
        <a className="muted" style={{ cursor: 'pointer', alignSelf: 'center' }} onClick={() => c.setOpen(false)}>Cancelar</a>
      </div>
    </>
  )
}

function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 50, overflow: 'auto' }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(680px,100%)', marginTop: 32 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function EditIcon({ onClick }: { onClick: () => void }) {
  return <a onClick={onClick} className="muted" style={{ cursor: 'pointer', marginRight: 10 }} title="Editar">✏️</a>
}

// ─── Vehículo ────────────────────────────────────────────────────────────────
type VForm = { nombre: string; matricula: string; tipo: string; capacidadKg: string; tarifaKm: string; tarifaFija: string; esPropio: boolean }
const vehiculoVacio: VForm = { nombre: '', matricula: '', tipo: 'camion', capacidadKg: '', tarifaKm: '', tarifaFija: '', esPropio: true }

function VehiculoFields({ f, set }: { f: VForm; set: (k: string, v: unknown) => void }) {
  return (
    <div style={inputRow}>
      <input placeholder="Nombre" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} required />
      <input placeholder="Matrícula" value={f.matricula} onChange={(e) => set('matricula', e.target.value)} />
      <input placeholder="Tipo (camion/furgon/frigorifico)" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} />
      <input placeholder="Capacidad kg" value={f.capacidadKg} onChange={(e) => set('capacidadKg', e.target.value)} />
      <input placeholder="Tarifa €/km" value={f.tarifaKm} onChange={(e) => set('tarifaKm', e.target.value)} />
      <input placeholder="Tarifa fija €" value={f.tarifaFija} onChange={(e) => set('tarifaFija', e.target.value)} />
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.esPropio} onChange={(e) => set('esPropio', e.target.checked)} /> propio
      </label>
    </div>
  )
}

export function NuevoVehiculo() {
  const c = useSubmit('/api/vehiculos')
  const [f, setF] = useState<VForm>(vehiculoVacio)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)}>+ Nuevo vehículo</button>
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(vehiculoVacio) }} style={formBox}>
      <VehiculoFields f={f} set={set} />
      <Actions c={c} />
    </form>
  )
}

export function EditVehiculo({ v }: { v: { id: string; nombre: string; matricula?: string | null; tipo: string; capacidadKg?: number | null; tarifaKm?: number | null; tarifaFija?: number | null; esPropio: boolean } }) {
  const c = useSubmit('/api/vehiculos', 'PATCH')
  const init = (): VForm => ({ nombre: v.nombre, matricula: v.matricula ?? '', tipo: v.tipo, capacidadKg: v.capacidadKg?.toString() ?? '', tarifaKm: v.tarifaKm?.toString() ?? '', tarifaFija: v.tarifaFija?.toString() ?? '', esPropio: v.esPropio })
  const [f, setF] = useState<VForm>(init)
  const set = (k: string, val: unknown) => setF((p) => ({ ...p, [k]: val }))
  return (
    <>
      <EditIcon onClick={() => { setF(init()); c.setOpen(true) }} />
      {c.open && (
        <Overlay title="Editar vehículo" onClose={() => c.setOpen(false)}>
          <form onSubmit={async (e) => { e.preventDefault(); await c.submit(f, `?id=${v.id}`) }}>
            <VehiculoFields f={f} set={set} />
            <Actions c={c} />
          </form>
        </Overlay>
      )}
    </>
  )
}

// ─── Servicio ────────────────────────────────────────────────────────────────
type SForm = { clienteNombre: string; aTerceros: boolean; origen: string; destino: string; fecha: string; estado: string; importe: string }
const estadosServicio = ['presupuestado', 'planificado', 'en_curso', 'entregado', 'facturado', 'cancelado']

function ServicioFields({ f, set }: { f: SForm; set: (k: string, v: unknown) => void }) {
  return (
    <div style={inputRow}>
      <input placeholder="Cliente" value={f.clienteNombre} onChange={(e) => set('clienteNombre', e.target.value)} />
      <input placeholder="Origen" value={f.origen} onChange={(e) => set('origen', e.target.value)} />
      <input placeholder="Destino" value={f.destino} onChange={(e) => set('destino', e.target.value)} />
      <input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
      <input placeholder="Importe €" value={f.importe} onChange={(e) => set('importe', e.target.value)} />
      <select value={f.estado} onChange={(e) => set('estado', e.target.value)}>
        {estadosServicio.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.aTerceros} onChange={(e) => set('aTerceros', e.target.checked)} /> a terceros
      </label>
    </div>
  )
}

export function NuevoServicio() {
  const c = useSubmit('/api/servicios')
  const hoy = new Date().toISOString().slice(0, 10)
  const init: SForm = { clienteNombre: '', aTerceros: true, origen: '', destino: '', fecha: hoy, estado: 'planificado', importe: '' }
  const [f, setF] = useState<SForm>(init)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)}>+ Nuevo servicio</button>
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(init) }} style={formBox}>
      <ServicioFields f={f} set={set} />
      <Actions c={c} />
    </form>
  )
}

export function EditServicio({ s }: { s: { id: string; clienteNombre?: string | null; aTerceros: boolean; origen?: string | null; destino?: string | null; fecha: string; estado: string; importe?: number | null } }) {
  const c = useSubmit('/api/servicios', 'PATCH')
  const init = (): SForm => ({ clienteNombre: s.clienteNombre ?? '', aTerceros: s.aTerceros, origen: s.origen ?? '', destino: s.destino ?? '', fecha: s.fecha, estado: s.estado, importe: s.importe?.toString() ?? '' })
  const [f, setF] = useState<SForm>(init)
  const set = (k: string, val: unknown) => setF((p) => ({ ...p, [k]: val }))
  return (
    <>
      <EditIcon onClick={() => { setF(init()); c.setOpen(true) }} />
      {c.open && (
        <Overlay title="Editar servicio" onClose={() => c.setOpen(false)}>
          <form onSubmit={async (e) => { e.preventDefault(); await c.submit(f, `?id=${s.id}`) }}>
            <ServicioFields f={f} set={set} />
            <Actions c={c} />
          </form>
        </Overlay>
      )}
    </>
  )
}

// ─── Borrado ─────────────────────────────────────────────────────────────────
export function DeleteButton({ endpoint, id }: { endpoint: string; id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!confirm('¿Borrar este registro?')) return
    setBusy(true)
    const res = await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error || 'No se pudo borrar')
      return
    }
    router.refresh()
  }
  return (
    <a onClick={del} className="muted" style={{ cursor: 'pointer' }} title="Borrar">{busy ? '…' : '🗑'}</a>
  )
}
