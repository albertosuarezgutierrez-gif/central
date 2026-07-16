'use client'

import { useMemo, useState } from 'react'

export type MovRow = {
  id: string
  materialNombre: string
  tipo: string
  cantidad: number
  origen: string | null
  destino: string | null
  motivo: string | null
  realizadoPor: string | null
  fecha: string
}

const TIPOS = ['entrada', 'salida', 'devolucion', 'rotura', 'ajuste', 'transferencia']
const TIPO_BADGE: Record<string, string> = { entrada: 'ok', devolucion: 'ok', salida: 'warn', ajuste: '', rotura: 'danger', transferencia: '' }
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const PAGE = 50

export default function MovimientosClient({ movimientos }: { movimientos: MovRow[] }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return movimientos.filter((m) => {
      if (tipo && m.tipo !== tipo) return false
      if (t && !m.materialNombre.toLowerCase().includes(t)) return false
      return true
    })
  }, [q, tipo, movimientos])

  const shown = filtrados.slice(0, limit)

  return (
    <div className="card">
      <div className="toolbar">
        <input className="search-input" placeholder="Buscar material…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setLimit(PAGE) }} style={{ maxWidth: 180 }}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{filtrados.length} movimientos</span>
      </div>

      {filtrados.length === 0 ? (
        <div className="empty"><div className="title">Sin movimientos</div><div>Prueba con otro filtro.</div></div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Material</th><th>Tipo</th><th className="num">Cant.</th><th>Ruta</th><th>Motivo</th><th>Quién</th></tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmt(m.fecha)}</td>
                    <td className="cell-strong">{m.materialNombre}</td>
                    <td><span className={`badge ${TIPO_BADGE[m.tipo] ?? ''}`}>{m.tipo}</span></td>
                    <td className="num">{m.cantidad > 0 ? '+' : ''}{m.cantidad}</td>
                    <td className="muted">{m.origen && m.destino ? `${m.origen} → ${m.destino}` : m.destino ? `→ ${m.destino}` : m.origen ? `${m.origen} →` : '—'}</td>
                    <td className="muted">{m.motivo ?? '—'}</td>
                    <td className="muted">{m.realizadoPor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length < filtrados.length && (
            <div className="load-more">
              <button className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
                Ver más ({filtrados.length - shown.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
