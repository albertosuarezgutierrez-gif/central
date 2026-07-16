'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type Espacio = {
  id: string
  nombre: string
  tipo: string
  direccion: string | null
  personaContacto: string | null
  telefono: string | null
  email: string | null
  notas: string | null
}

export default function EditarFicha({ espacio }: { espacio: Espacio }) {
  const router = useRouter()
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(espacio)
  const [saving, setSaving] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/espacios', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: espacio.id, nombre: f.nombre, tipo: f.tipo, direccion: f.direccion,
          personaContacto: f.personaContacto, telefono: f.telefono, email: f.email, notas: f.notas,
        }),
      })
      if (r.ok) {
        setEdit(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!edit) {
    return (
      <div className="card">
        <div className="ficha-head">
          <div className="card-title" style={{ margin: 0 }}>Ficha del almacén</div>
          <button className="btn btn-ghost" style={{ minHeight: 34, padding: '6px 12px' }} onClick={() => setEdit(true)}>Editar</button>
        </div>
        <dl className="ficha">
          {espacio.direccion && <><dt>Dirección</dt><dd>{espacio.direccion}</dd></>}
          {espacio.personaContacto && <><dt>Contacto</dt><dd>{espacio.personaContacto}</dd></>}
          {espacio.telefono && <><dt>Teléfono</dt><dd>{espacio.telefono}</dd></>}
          {espacio.email && <><dt>Email</dt><dd>{espacio.email}</dd></>}
          {espacio.notas && <><dt>Notas</dt><dd>{espacio.notas}</dd></>}
          {!espacio.direccion && !espacio.personaContacto && !espacio.telefono && !espacio.email && !espacio.notas && (
            <dd className="muted">Sin datos de contacto. Pulsa «Editar» para completarlos.</dd>
          )}
        </dl>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">Editar ficha</div>
      <form onSubmit={guardar} className="grid">
        <div className="form-bar">
          <div className="form-field grow">
            <label className="field-label">Nombre</label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div className="form-field" style={{ flex: '0 0 150px' }}>
            <label className="field-label">Tipo</label>
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="central">Central</option>
              <option value="hacienda">Hacienda</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div className="form-field">
          <label className="field-label">Dirección</label>
          <input value={f.direccion ?? ''} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </div>
        <div className="form-bar">
          <div className="form-field grow">
            <label className="field-label">Persona de contacto</label>
            <input value={f.personaContacto ?? ''} onChange={(e) => setF({ ...f, personaContacto: e.target.value })} />
          </div>
          <div className="form-field" style={{ flex: '1 1 160px' }}>
            <label className="field-label">Teléfono</label>
            <input value={f.telefono ?? ''} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </div>
          <div className="form-field" style={{ flex: '1 1 200px' }}>
            <label className="field-label">Email</label>
            <input value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
        </div>
        <div className="form-field">
          <label className="field-label">Notas</label>
          <input value={f.notas ?? ''} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </div>
        <div className="form-bar">
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setF(espacio); setEdit(false) }}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
