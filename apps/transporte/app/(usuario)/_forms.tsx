'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }

function useCreate(endpoint: string) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(body: unknown) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
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

export function NuevoVehiculo() {
  const c = useCreate('/api/vehiculos')
  const [f, setF] = useState({ nombre: '', matricula: '', tipo: 'camion', capacidadKg: '', tarifaKm: '', tarifaFija: '', esPropio: true })
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)}>+ Nuevo vehículo</button>
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF({ nombre: '', matricula: '', tipo: 'camion', capacidadKg: '', tarifaKm: '', tarifaFija: '', esPropio: true }) }}
      style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}
    >
      <div style={inputRow}>
        <input placeholder="Nombre" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} required />
        <input placeholder="Matrícula" value={f.matricula} onChange={(e) => set('matricula', e.target.value)} />
        <input placeholder="Tipo (camion/furgon/frigorifico)" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} />
        <input placeholder="Capacidad kg" value={f.capacidadKg} onChange={(e) => set('capacidadKg', e.target.value)} />
        <input placeholder="Tarifa €/km" value={f.tarifaKm} onChange={(e) => set('tarifaKm', e.target.value)} />
        <input placeholder="Tarifa fija €" value={f.tarifaFija} onChange={(e) => set('tarifaFija', e.target.value)} />
      </div>
      {c.error && <div className="badge danger" style={{ marginTop: 8 }}>{c.error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} disabled={c.saving}>{c.saving ? '…' : 'Guardar'}</button>
        <a className="muted" style={{ cursor: 'pointer', alignSelf: 'center' }} onClick={() => c.setOpen(false)}>Cancelar</a>
      </div>
    </form>
  )
}

export function NuevoServicio() {
  const c = useCreate('/api/servicios')
  const hoy = new Date().toISOString().slice(0, 10)
  const init = { clienteNombre: '', aTerceros: true, origen: '', destino: '', fecha: hoy, estado: 'planificado', importe: '' }
  const [f, setF] = useState(init)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)}>+ Nuevo servicio</button>
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(init) }}
      style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}
    >
      <div style={inputRow}>
        <input placeholder="Cliente" value={f.clienteNombre} onChange={(e) => set('clienteNombre', e.target.value)} />
        <input placeholder="Origen" value={f.origen} onChange={(e) => set('origen', e.target.value)} />
        <input placeholder="Destino" value={f.destino} onChange={(e) => set('destino', e.target.value)} />
        <input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
        <input placeholder="Importe €" value={f.importe} onChange={(e) => set('importe', e.target.value)} />
        <select value={f.estado} onChange={(e) => set('estado', e.target.value)}>
          {['presupuestado', 'planificado', 'en_curso', 'entregado', 'facturado'].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={f.aTerceros} onChange={(e) => set('aTerceros', e.target.checked)} /> a terceros
        </label>
      </div>
      {c.error && <div className="badge danger" style={{ marginTop: 8 }}>{c.error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} disabled={c.saving}>{c.saving ? '…' : 'Guardar'}</button>
        <a className="muted" style={{ cursor: 'pointer', alignSelf: 'center' }} onClick={() => c.setOpen(false)}>Cancelar</a>
      </div>
    </form>
  )
}

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
