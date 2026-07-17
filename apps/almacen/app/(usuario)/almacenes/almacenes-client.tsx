'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type EspacioRow = {
  id: string
  nombre: string
  tipo: string
  direccion: string | null
  personaContacto: string | null
  telefono: string | null
}

const TIPO_LABEL: Record<string, string> = { central: 'Central', hacienda: 'Hacienda', otro: 'Otro' }

export default function AlmacenesClient({ espacios }: { espacios: EspacioRow[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(espacios.length === 0)
  const empty = { nombre: '', tipo: 'hacienda', direccion: '', personaContacto: '', telefono: '', email: '', notas: '' }
  const [f, setF] = useState(empty)
  const [saving, setSaving] = useState(false)

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nombre.trim() || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/espacios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(f),
      })
      if (r.ok) {
        setF(empty)
        setAbierto(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="card">
        <button className="card-collapse" onClick={() => setAbierto((v) => !v)}>
          <span className="card-title" style={{ margin: 0 }}>Nuevo almacén</span>
          <span className="muted">{abierto ? '−' : '+'}</span>
        </button>
        {abierto && (
          <form onSubmit={crear} className="grid" style={{ marginTop: 12 }}>
            <div className="form-bar">
              <div className="form-field grow">
                <label className="field-label">Nombre *</label>
                <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Hacienda El Rocío" />
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
              <input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} placeholder="Calle, población, provincia, CP" />
            </div>
            <div className="form-bar">
              <div className="form-field grow">
                <label className="field-label">Persona de contacto</label>
                <input value={f.personaContacto} onChange={(e) => setF({ ...f, personaContacto: e.target.value })} />
              </div>
              <div className="form-field" style={{ flex: '1 1 160px' }}>
                <label className="field-label">Teléfono</label>
                <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
              </div>
              <div className="form-field" style={{ flex: '1 1 200px' }}>
                <label className="field-label">Email</label>
                <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>
            </div>
            <div className="form-field">
              <label className="field-label">Notas</label>
              <input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Acceso, horario…" />
            </div>
            <button className="btn btn-primary" disabled={saving || !f.nombre.trim()}>
              {saving ? 'Creando…' : 'Crear almacén'}
            </button>
          </form>
        )}
      </div>

      {espacios.length === 0 ? (
        <div className="card empty">
          <span className="emoji">🏬</span>
          <div className="title">Aún no hay almacenes</div>
          <div>Crea el primero (Central, haciendas…) con el formulario de arriba.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {espacios.map((e) => (
            <Link key={e.id} href={`/almacenes/${e.id}`} className="card almacen-card">
              <div className="almacen-head">
                <span className="almacen-nombre">{e.nombre}</span>
                <span className={`badge${e.tipo === 'central' ? ' ok' : ''}`}>{TIPO_LABEL[e.tipo] ?? e.tipo}</span>
              </div>
              {e.direccion && <div className="muted almacen-dir">📍 {e.direccion}</div>}
              {e.personaContacto && <div className="muted">👤 {e.personaContacto}{e.telefono ? ` · ${e.telefono}` : ''}</div>}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
