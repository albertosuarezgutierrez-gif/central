'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type EventoRow = {
  id: string
  tipo: string
  titulo: string
  clienteNombre: string | null
  lugar: string | null
  fechaInicio: string
  fechaFin: string
  estado: string
}

export const ESTADO_BADGE: Record<string, string> = {
  presupuesto: '', confirmado: 'warn', entregado: 'ok', devuelto: 'ok', cerrado: '', cancelado: 'danger',
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function EventosClient({ eventos }: { eventos: EventoRow[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const hoy = new Date().toISOString().slice(0, 10)
  const empty = { tipo: 'evento', titulo: '', clienteNombre: '', lugar: '', fechaInicio: hoy, fechaFin: hoy, notas: '' }
  const [f, setF] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.titulo.trim()) { setError('Pon un título'); return }
    if (f.fechaFin < f.fechaInicio) { setError('La fecha fin no puede ser anterior al inicio'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/eventos', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Error'); return }
      router.push(`/eventos/${j.evento.id}`)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="card">
        <button className="card-collapse" onClick={() => setAbierto((v) => !v)}>
          <span className="card-title" style={{ margin: 0 }}>Nuevo evento / alquiler</span>
          <span className="muted">{abierto ? '−' : '+'}</span>
        </button>
        {abierto && (
          <form onSubmit={crear} className="grid" style={{ marginTop: 12 }}>
            <div className="form-bar">
              <div className="form-field" style={{ flex: '0 0 150px' }}>
                <label className="field-label">Tipo</label>
                <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                  <option value="evento">Evento</option>
                  <option value="alquiler">Alquiler</option>
                </select>
              </div>
              <div className="form-field grow">
                <label className="field-label">Título *</label>
                <input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Boda García · 150 pax" />
              </div>
            </div>
            <div className="form-bar">
              <div className="form-field grow">
                <label className="field-label">Cliente</label>
                <input value={f.clienteNombre} onChange={(e) => setF({ ...f, clienteNombre: e.target.value })} />
              </div>
              <div className="form-field grow">
                <label className="field-label">Lugar</label>
                <input value={f.lugar} onChange={(e) => setF({ ...f, lugar: e.target.value })} placeholder="Hacienda El Rocío" />
              </div>
            </div>
            <div className="form-bar">
              <div className="form-field" style={{ flex: '1 1 150px' }}>
                <label className="field-label">Desde</label>
                <input type="date" value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} />
              </div>
              <div className="form-field" style={{ flex: '1 1 150px' }}>
                <label className="field-label">Hasta</label>
                <input type="date" value={f.fechaFin} onChange={(e) => setF({ ...f, fechaFin: e.target.value })} />
              </div>
            </div>
            {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
            <button className="btn btn-primary" disabled={saving || !f.titulo.trim()}>
              {saving ? 'Creando…' : 'Crear y añadir material'}
            </button>
          </form>
        )}
      </div>

      {eventos.length === 0 ? (
        <div className="card empty">
          <span className="emoji">🎉</span>
          <div className="title">Aún no hay eventos</div>
          <div>Crea el primer evento o alquiler con el formulario de arriba.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Título</th><th>Tipo</th><th>Cliente</th><th>Fechas</th><th>Estado</th></tr></thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-strong"><Link href={`/eventos/${e.id}`} style={{ color: 'inherit' }}>{e.titulo}</Link></td>
                    <td className="muted">{e.tipo}</td>
                    <td className="muted">{e.clienteNombre || '—'}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmt(e.fechaInicio)}–{fmt(e.fechaFin)}</td>
                    <td><span className={`badge ${ESTADO_BADGE[e.estado] ?? ''}`}>{e.estado}</span></td>
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
