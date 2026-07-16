'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type EmpleadoRow = { id: string; nombre: string; usuario: string; telefono: string | null }

export default function EmpleadosClient({ empleados }: { empleados: EmpleadoRow[] }) {
  const router = useRouter()
  const empty = { nombre: '', usuario: '', password: '', telefono: '' }
  const [f, setF] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!f.nombre.trim() || !f.usuario.trim() || f.password.length < 6) { setError('Nombre, usuario (email) y contraseña de 6+ caracteres'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Error'); return }
      setOk(`Empleado "${f.nombre}" creado. Ya puede entrar con su usuario y contraseña.`)
      setF(empty); router.refresh()
    } finally { setSaving(false) }
  }

  async function resetPass(id: string, nombre: string) {
    const pass = prompt(`Nueva contraseña para ${nombre} (mínimo 6 caracteres):`)
    if (!pass) return
    const r = await fetch('/api/empleados', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, password: pass }) })
    if (r.ok) setOk(`Contraseña de ${nombre} actualizada.`)
    else { const j = await r.json().catch(() => ({})); setError(j.error || 'Error') }
  }

  async function desactivar(id: string, nombre: string) {
    if (!confirm(`¿Dar de baja a ${nombre}? No podrá acceder.`)) return
    await fetch(`/api/empleados?id=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Nuevo empleado</div>
        <form onSubmit={crear} className="grid">
          <div className="form-bar">
            <div className="form-field grow">
              <label className="field-label">Nombre *</label>
              <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            </div>
            <div className="form-field grow">
              <label className="field-label">Usuario (email) *</label>
              <input type="email" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} autoComplete="off" />
            </div>
          </div>
          <div className="form-bar">
            <div className="form-field grow">
              <label className="field-label">Contraseña *</label>
              <input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="mínimo 6 caracteres" autoComplete="off" />
            </div>
            <div className="form-field" style={{ flex: '1 1 160px' }}>
              <label className="field-label">Teléfono</label>
              <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            </div>
          </div>
          {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
          {ok && <div className="badge ok" style={{ padding: '8px 12px' }}>{ok}</div>}
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear empleado'}</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Empleados ({empleados.length})</div>
        {empleados.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Aún no hay empleados. Crea el primero arriba.</div>
        ) : (
          <ul className="rows">
            {empleados.map((e) => (
              <li key={e.id} className="row" style={{ flexWrap: 'wrap' }}>
                <span className="cell-strong">{e.nombre}</span>
                <span className="muted">{e.usuario}{e.telefono ? ` · ${e.telefono}` : ''}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => resetPass(e.id, e.nombre)}>Contraseña</button>
                  <button className="btn btn-ghost" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => desactivar(e.id, e.nombre)}>Baja</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
