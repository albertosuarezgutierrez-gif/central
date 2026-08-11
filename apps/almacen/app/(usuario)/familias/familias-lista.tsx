'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type FamiliaRow = { id: string; nombre: string }

export default function FamiliasLista({ familias }: { familias: FamiliaRow[] }) {
  const router = useRouter()
  const [editId, setEditId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  function empezarEdicion(f: FamiliaRow) {
    setError(''); setEditId(f.id); setNombre(f.nombre)
  }

  async function guardar(id: string) {
    const n = nombre.trim()
    if (!n) { setError('El nombre no puede estar vacío'); return }
    setBusy(id); setError('')
    try {
      const r = await fetch('/api/familias', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, nombre: n }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'No se pudo guardar'); return }
      setEditId(null); router.refresh()
    } finally { setBusy(null) }
  }

  async function borrar(f: FamiliaRow) {
    if (!confirm(`¿Borrar la familia "${f.nombre}"? Los materiales que la tuvieran quedarán sin familia.`)) return
    setBusy(f.id); setError('')
    try {
      const r = await fetch(`/api/familias?id=${f.id}`, { method: 'DELETE' })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'No se pudo borrar'); return }
      router.refresh()
    } finally { setBusy(null) }
  }

  if (familias.length === 0) {
    return (
      <div className="empty">
        <span className="emoji">🗂️</span>
        <div className="title">Aún no hay familias</div>
        <div>Crea la primera arriba para empezar a organizar el material.</div>
      </div>
    )
  }

  return (
    <>
      {error && <div className="badge danger" style={{ padding: '8px 12px', marginBottom: 10 }}>{error}</div>}
      <ul className="rows">
        {familias.map((f) => (
          <li key={f.id} className="row" style={{ gap: 10 }}>
            {editId === f.id ? (
              <>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') guardar(f.id); if (e.key === 'Escape') setEditId(null) }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button className="btn btn-primary" style={{ minHeight: 34, padding: '6px 12px' }} disabled={busy === f.id} onClick={() => guardar(f.id)}>Guardar</button>
                <button className="btn btn-ghost" style={{ minHeight: 34, padding: '6px 12px' }} onClick={() => setEditId(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="row-name" style={{ flex: 1, minWidth: 0 }}>{f.nombre}</span>
                <button className="btn btn-ghost" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => empezarEdicion(f)}>Editar</button>
                <button className="btn btn-ghost btn-danger" style={{ minHeight: 32, padding: '4px 10px' }} disabled={busy === f.id} onClick={() => borrar(f)}>Borrar</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
