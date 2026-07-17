'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Espacio = { id: string; nombre: string }
type Empleado = { id: string; nombre: string }
export type InventarioRow = {
  id: string
  espacioNombre: string
  empleadoNombre: string | null
  estado: string
  ciego: boolean
  createdAt: string
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function InventariosClient({
  inventarios, espacios, empleados,
}: { inventarios: InventarioRow[]; espacios: Espacio[]; empleados: Empleado[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(inventarios.length === 0)
  const [f, setF] = useState({ espacioId: espacios[0]?.id ?? '', empleadoId: '', ciego: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.espacioId) { setError('Elige un almacén'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/inventarios', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ espacioId: f.espacioId, empleadoId: f.empleadoId || null, ciego: f.ciego }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Error'); return }
      router.push(`/inventarios/${j.inventario.id}`)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="card">
        <button className="card-collapse" onClick={() => setAbierto((v) => !v)}>
          <span className="card-title" style={{ margin: 0 }}>Nuevo inventario</span>
          <span className="muted">{abierto ? '−' : '+'}</span>
        </button>
        {abierto && (
          <form onSubmit={crear} className="grid" style={{ marginTop: 12 }}>
            <div className="form-bar">
              <div className="form-field grow">
                <label className="field-label">Almacén a contar</label>
                <select value={f.espacioId} onChange={(e) => setF({ ...f, espacioId: e.target.value })}>
                  {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
              <div className="form-field grow">
                <label className="field-label">Asignar a empleado</label>
                <select value={f.empleadoId} onChange={(e) => setF({ ...f, empleadoId: e.target.value })}>
                  <option value="">(sin asignar)</option>
                  {empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={f.ciego} onChange={(e) => setF({ ...f, ciego: e.target.checked })} />
              <span>Conteo ciego (quien cuenta no ve la cifra del sistema)</span>
            </label>
            {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
            <button className="btn btn-primary" disabled={saving || espacios.length === 0}>
              {saving ? 'Creando…' : 'Crear inventario'}
            </button>
            {espacios.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Crea un almacén primero.</div>}
          </form>
        )}
      </div>

      {inventarios.length === 0 ? (
        <div className="card empty">
          <span className="emoji">📋</span>
          <div className="title">Aún no hay inventarios</div>
          <div>Crea uno para que un empleado cuente un almacén.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Almacén</th><th>Asignado</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {inventarios.map((i) => (
                  <tr key={i.id}>
                    <td className="cell-strong"><Link href={`/inventarios/${i.id}`} style={{ color: 'inherit' }}>{i.espacioNombre}</Link></td>
                    <td className="muted">{i.empleadoNombre ?? '—'}</td>
                    <td className="muted">{i.ciego ? 'ciego' : 'abierto'}</td>
                    <td><span className={`badge ${i.estado === 'cerrado' ? 'ok' : 'warn'}`}>{i.estado}</span></td>
                    <td className="muted">{fmt(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
