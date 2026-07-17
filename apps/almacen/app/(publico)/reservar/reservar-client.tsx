'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { eur } from '@/lib/format'
import type { ItemCatalogo } from '@/lib/publico'

type Linea = { materialId: string; cantidad: number }

export default function ReservarClient({
  items,
  preseleccion,
}: {
  items: ItemCatalogo[]
  preseleccion: string | null
}) {
  const porId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [lugar, setLugar] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<Linea[]>(
    preseleccion && porId.has(preseleccion) ? [{ materialId: preseleccion, cantidad: 1 }] : [],
  )
  const [sel, setSel] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [okId, setOkId] = useState<string | null>(null)

  function addLinea() {
    if (!sel) return
    if (lineas.some((l) => l.materialId === sel)) return
    setLineas((ls) => [...ls, { materialId: sel, cantidad: 1 }])
    setSel('')
  }

  function setCantidad(materialId: string, cantidad: number) {
    setLineas((ls) => ls.map((l) => (l.materialId === materialId ? { ...l, cantidad } : l)))
  }

  function quitar(materialId: string) {
    setLineas((ls) => ls.filter((l) => l.materialId !== materialId))
  }

  const total = lineas.reduce((acc, l) => {
    const it = porId.get(l.materialId)
    return acc + (it ? it.precioAlquiler * l.cantidad : 0)
  }, 0)

  const noElegidos = items.filter((it) => !lineas.some((l) => l.materialId === it.id))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (lineas.length === 0) {
      setError('Añade al menos un material.')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/publico/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNombre: nombre,
          clienteContacto: contacto,
          lugar: lugar || null,
          fechaInicio,
          fechaFin,
          notas: notas || null,
          lineas,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo enviar la solicitud.')
        return
      }
      setOkId(j.id)
    } finally {
      setEnviando(false)
    }
  }

  if (okId) {
    return (
      <div className="card pub-ok">
        <span className="emoji">✅</span>
        <h2>¡Solicitud recibida!</h2>
        <p>
          Gracias, {nombre.split(' ')[0]}. Hemos registrado tu petición y nuestro equipo la revisará para
          confirmarte disponibilidad y precio final. Te contactaremos en <strong>{contacto}</strong>.
        </p>
        <Link href="/catalogo" className="btn btn-primary">Volver al catálogo</Link>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="pub-reservar">
      <div className="card">
        <h2 className="card-title">Tus datos</h2>
        <div className="grid pub-form-grid">
          <div className="form-field">
            <label className="field-label">Nombre *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" required />
          </div>
          <div className="form-field">
            <label className="field-label">Email o teléfono *</label>
            <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="tu@correo.com / 600…" required />
          </div>
          <div className="form-field">
            <label className="field-label">Fecha inicio *</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="field-label">Fecha fin *</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} required />
          </div>
          <div className="form-field pub-span2">
            <label className="field-label">Lugar del evento</label>
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Hacienda, salón, dirección…" />
          </div>
          <div className="form-field pub-span2">
            <label className="field-label">Notas</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nº de comensales, detalles…" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Material</h2>
        <div className="pub-add-linea">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Elige un material…</option>
            {noElegidos.map((it) => (
              <option key={it.id} value={it.id}>
                {it.nombre} — {eur(it.precioAlquiler)} ({it.disponible} disp.)
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={addLinea} disabled={!sel}>
            Añadir
          </button>
        </div>

        {lineas.length === 0 ? (
          <div className="muted pub-nolineas">Aún no has añadido material.</div>
        ) : (
          <ul className="pub-lineas">
            {lineas.map((l) => {
              const it = porId.get(l.materialId)
              if (!it) return null
              return (
                <li key={l.materialId} className="pub-linea">
                  <div className="pub-linea-nombre">
                    <span>{it.nombre}</span>
                    <span className="muted">{eur(it.precioAlquiler)} / ud · {it.disponible} disp.</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={it.disponible}
                    value={l.cantidad}
                    onChange={(e) => setCantidad(l.materialId, Math.max(1, Math.min(it.disponible, Number(e.target.value) || 1)))}
                    className="pub-linea-cant"
                  />
                  <span className="pub-linea-sub">{eur(it.precioAlquiler * l.cantidad)}</span>
                  <button type="button" className="pub-linea-x" onClick={() => quitar(l.materialId)} aria-label="Quitar">
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {lineas.length > 0 && (
          <div className="pub-total">
            <span className="muted">Estimado (sin IVA ni fianza)</span>
            <strong>{eur(total)}</strong>
          </div>
        )}
      </div>

      {error && <div className="badge danger pub-error">{error}</div>}

      <div className="pub-enviar">
        <button className="btn btn-primary btn-block" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
        <p className="muted pub-enviar-nota">
          El importe es orientativo. La reserva se confirma cuando nuestro equipo valida disponibilidad.
        </p>
      </div>
    </form>
  )
}
