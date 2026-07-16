'use client'

import { useMemo, useState } from 'react'
import { eur } from '@/lib/format'

export type MaterialRow = {
  id: string
  nombre: string
  familia: string
  imagenUrl: string | null
  capacidad: string | null
  cantidadTotal: number
  cantidadDisponible: number
  unidadesPorBandeja: number
  precioAlquiler: number | null
  coste: number
}

const PAGE = 50

export default function MaterialesTable({ rows }: { rows: MaterialRow[] }) {
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(
      (r) => r.nombre.toLowerCase().includes(t) || r.familia.toLowerCase().includes(t),
    )
  }, [q, rows])

  const shown = filtered.slice(0, limit)

  if (rows.length === 0) {
    return (
      <div className="empty">
        <span className="emoji">📦</span>
        <div className="title">Aún no hay materiales</div>
        <div>Da de alta el primero con el formulario de arriba (cantidad y bandejas «RAKI»).</div>
      </div>
    )
  }

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Buscar material o familia…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
        />
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          {filtered.length} de {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="title">Sin resultados</div>
          <div>Prueba con otro término.</div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Material</th>
                  <th>Familia</th>
                  <th>Capacidad</th>
                  <th className="num">Total</th>
                  <th className="num">Disp.</th>
                  <th className="num">Alquiler</th>
                  <th className="num">Reposición</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id}>
                    <td className="thumb-cell">
                      {m.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imagenUrl} alt="" className="thumb" loading="lazy" />
                      ) : (
                        <span className="thumb thumb-empty">📦</span>
                      )}
                    </td>
                    <td className="cell-strong">{m.nombre}</td>
                    <td>{m.familia || '—'}</td>
                    <td className="muted">{m.capacidad || '—'}</td>
                    <td className="num">{m.cantidadTotal}</td>
                    <td className="num">{m.cantidadDisponible}</td>
                    <td className="num">{m.precioAlquiler != null ? eur(m.precioAlquiler) : '—'}</td>
                    <td className="num">{eur(m.coste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length < filtered.length && (
            <div className="load-more">
              <button className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
                Ver más ({filtered.length - shown.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
