'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type MaterialEditable = {
  id: string
  nombre: string
  familiaId: string | null
  categoria: string
  capacidad: string | null
  precioAlquiler: number | null
  costeReposicion: number
  unidadesPorBandeja: number
  stockMinimo: number | null
}

export default function EditarMaterial({
  material, familias,
}: { material: MaterialEditable; familias: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState({
    nombre: material.nombre,
    familiaId: material.familiaId ?? '',
    categoria: material.categoria ?? '',
    capacidad: material.capacidad ?? '',
    precioAlquiler: material.precioAlquiler != null ? String(material.precioAlquiler) : '',
    costeReposicion: String(material.costeReposicion ?? 0),
    unidadesPorBandeja: String(material.unidadesPorBandeja ?? 1),
    stockMinimo: material.stockMinimo != null ? String(material.stockMinimo) : '',
  })

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!f.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/materiales', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: material.id,
          nombre: f.nombre.trim(),
          familiaId: f.familiaId || null,
          categoria: f.categoria.trim() || undefined,
          capacidad: f.capacidad.trim() || null,
          precioAlquiler: f.precioAlquiler.trim() === '' ? null : Number(f.precioAlquiler),
          costeReposicion: Number(f.costeReposicion) || 0,
          unidadesPorBandeja: Number(f.unidadesPorBandeja) || 1,
          stockMinimo: f.stockMinimo.trim() === '' ? null : Number(f.stockMinimo),
        }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'No se pudo guardar'); return }
      setEdit(false); router.refresh()
    } finally { setSaving(false) }
  }

  async function borrar() {
    if (!confirm(`¿Borrar el material "${material.nombre}"? Dejará de aparecer en el maestro y el catálogo. El historial se conserva.`)) return
    setSaving(true); setError('')
    try {
      const r = await fetch(`/api/materiales?id=${material.id}`, { method: 'DELETE' })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'No se pudo borrar'); setSaving(false); return }
      router.push('/materiales'); router.refresh()
    } catch {
      setSaving(false)
    }
  }

  if (!edit) {
    return (
      <div className="card">
        <div className="ficha-head">
          <div className="card-title" style={{ margin: 0 }}>Ficha del material</div>
          <button className="btn btn-ghost" style={{ minHeight: 34, padding: '6px 12px' }} onClick={() => { setError(''); setEdit(true) }}>Editar</button>
        </div>
        <dl className="ficha">
          <dt>Familia</dt><dd>{familias.find((x) => x.id === material.familiaId)?.nombre ?? '—'}</dd>
          <dt>Categoría</dt><dd>{material.categoria || '—'}</dd>
          {material.capacidad && <><dt>Capacidad</dt><dd>{material.capacidad}</dd></>}
          <dt>Alquiler</dt><dd>{material.precioAlquiler != null ? `${material.precioAlquiler}` : '—'}</dd>
          <dt>Ud/bandeja</dt><dd>{material.unidadesPorBandeja}</dd>
          {material.stockMinimo != null && <><dt>Stock mínimo</dt><dd>{material.stockMinimo}</dd></>}
        </dl>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">Editar material</div>
      <form onSubmit={guardar} className="grid">
        <div className="form-field">
          <label className="field-label">Nombre *</label>
          <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </div>
        <div className="form-bar">
          <div className="form-field grow">
            <label className="field-label">Familia</label>
            <select value={f.familiaId} onChange={(e) => setF({ ...f, familiaId: e.target.value })}>
              <option value="">(sin familia)</option>
              {familias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
          <div className="form-field grow">
            <label className="field-label">Categoría</label>
            <input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="p. ej. cristalería" />
          </div>
        </div>
        <div className="form-field">
          <label className="field-label">Capacidad / medidas</label>
          <input value={f.capacidad} onChange={(e) => setF({ ...f, capacidad: e.target.value })} placeholder="p. ej. 56 cl · Ø 30 cm" />
        </div>
        <div className="form-bar">
          <div className="form-field" style={{ flex: '1 1 130px' }}>
            <label className="field-label">Precio alquiler (€)</label>
            <input type="number" min={0} step="0.01" value={f.precioAlquiler} onChange={(e) => setF({ ...f, precioAlquiler: e.target.value })} placeholder="—" />
          </div>
          <div className="form-field" style={{ flex: '1 1 130px' }}>
            <label className="field-label">Coste reposición (€)</label>
            <input type="number" min={0} step="0.01" value={f.costeReposicion} onChange={(e) => setF({ ...f, costeReposicion: e.target.value })} />
          </div>
          <div className="form-field" style={{ flex: '1 1 110px' }}>
            <label className="field-label">Ud/bandeja</label>
            <input type="number" min={1} value={f.unidadesPorBandeja} onChange={(e) => setF({ ...f, unidadesPorBandeja: e.target.value })} />
          </div>
          <div className="form-field" style={{ flex: '1 1 110px' }}>
            <label className="field-label">Stock mínimo</label>
            <input type="number" min={0} value={f.stockMinimo} onChange={(e) => setF({ ...f, stockMinimo: e.target.value })} placeholder="—" />
          </div>
        </div>
        {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
        <div className="form-bar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>Cancelar</button>
          </div>
          <button type="button" className="btn btn-ghost btn-danger" disabled={saving} onClick={borrar}>Borrar material</button>
        </div>
      </form>
    </div>
  )
}
