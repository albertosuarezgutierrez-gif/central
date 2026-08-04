'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FamiliaForm() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/familias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      setNombre('')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={crear} className="form-bar">
      <div className="form-field grow">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="p. ej. Vajilla, Cristalería, Mantelería…"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving || !nombre.trim()}>
        {saving ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}

export function MaterialForm({ familias }: { familias: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const empty = { nombre: '', familiaId: '', cantidadTotal: '0', unidadesPorBandeja: '1', costeReposicion: '0' }
  const [f, setF] = useState(empty)
  const [saving, setSaving] = useState(false)
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nombre.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/materiales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: f.nombre,
          familiaId: f.familiaId || null,
          cantidadTotal: Number(f.cantidadTotal) || 0,
          unidadesPorBandeja: Number(f.unidadesPorBandeja) || 1,
          costeReposicion: Number(f.costeReposicion) || 0,
        }),
      })
      setF(empty)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={crear} className="form-bar">
      <div className="form-field grow">
        <label className="field-label">Material</label>
        <input placeholder="p. ej. Plato llano" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      </div>
      <div className="form-field" style={{ flex: '1 1 160px', minWidth: 0 }}>
        <label className="field-label">Familia</label>
        <select value={f.familiaId} onChange={(e) => setF({ ...f, familiaId: e.target.value })}>
          <option value="">(sin familia)</option>
          {familias.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field" style={{ width: 90 }}>
        <label className="field-label">Total</label>
        <input type="number" min={0} value={f.cantidadTotal} onChange={(e) => setF({ ...f, cantidadTotal: e.target.value })} />
      </div>
      <div className="form-field" style={{ width: 110 }}>
        <label className="field-label">Ud/bandeja</label>
        <input type="number" min={1} value={f.unidadesPorBandeja} onChange={(e) => setF({ ...f, unidadesPorBandeja: e.target.value })} />
      </div>
      <div className="form-field" style={{ width: 110 }}>
        <label className="field-label">Coste rep.</label>
        <input type="number" min={0} step="0.01" value={f.costeReposicion} onChange={(e) => setF({ ...f, costeReposicion: e.target.value })} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving || !f.nombre.trim()}>
        {saving ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}
