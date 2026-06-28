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

export function NuevoMaterial() {
  const c = useCreate('/api/materiales')
  const init = { nombre: '', categoria: '', stockTotal: '', tarifaDia: '', fianzaUnit: '' }
  const [f, setF] = useState(init)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)}>+ Nuevo material</button>
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(init) }}
      style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}
    >
      <div style={inputRow}>
        <input placeholder="Nombre" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} required />
        <input placeholder="Categoría" value={f.categoria} onChange={(e) => set('categoria', e.target.value)} />
        <input placeholder="Stock" value={f.stockTotal} onChange={(e) => set('stockTotal', e.target.value)} />
        <input placeholder="Tarifa €/día" value={f.tarifaDia} onChange={(e) => set('tarifaDia', e.target.value)} />
        <input placeholder="Fianza €/ud" value={f.fianzaUnit} onChange={(e) => set('fianzaUnit', e.target.value)} />
      </div>
      {c.error && <div className="badge danger" style={{ marginTop: 8 }}>{c.error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} disabled={c.saving}>{c.saving ? '…' : 'Guardar'}</button>
        <a className="muted" style={{ cursor: 'pointer', alignSelf: 'center' }} onClick={() => c.setOpen(false)}>Cancelar</a>
      </div>
    </form>
  )
}

export function NuevoAlquiler({ materiales }: { materiales: { id: string; nombre: string }[] }) {
  const c = useCreate('/api/alquileres')
  const hoy = new Date().toISOString().slice(0, 10)
  const init = { clienteNombre: '', aTerceros: true, fechaInicio: hoy, fechaFin: hoy, estado: 'reservado', fianza: '', materialId: materiales[0]?.id ?? '', cantidad: '1' }
  const [f, setF] = useState(init)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)} disabled={materiales.length === 0}>+ Nuevo alquiler</button>
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(init) }}
      style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}
    >
      <div style={inputRow}>
        <input placeholder="Cliente" value={f.clienteNombre} onChange={(e) => set('clienteNombre', e.target.value)} />
        <input type="date" value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} />
        <input type="date" value={f.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} />
        <select value={f.materialId} onChange={(e) => set('materialId', e.target.value)}>
          {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <input placeholder="Cantidad" value={f.cantidad} onChange={(e) => set('cantidad', e.target.value)} />
        <input placeholder="Fianza €" value={f.fianza} onChange={(e) => set('fianza', e.target.value)} />
        <select value={f.estado} onChange={(e) => set('estado', e.target.value)}>
          {['reservado', 'entregado', 'devuelto'].map((x) => <option key={x} value={x}>{x}</option>)}
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
  return <a onClick={del} className="muted" style={{ cursor: 'pointer' }} title="Borrar">{busy ? '…' : '🗑'}</a>
}
