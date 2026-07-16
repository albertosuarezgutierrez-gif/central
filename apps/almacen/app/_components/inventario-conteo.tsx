'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type LineaConteo = {
  id: string
  materialNombre: string
  cantidadSistema: number
  cantidadContada: number | null
}
export type InvInfo = { id: string; estado: string; ciego: boolean; espacioNombre: string }

const PAGE = 50

export default function InventarioConteo({
  inventario, lineas, canClose, volverHref,
}: { inventario: InvInfo; lineas: LineaConteo[]; canClose: boolean; volverHref: string }) {
  const router = useRouter()
  const cerrado = inventario.estado === 'cerrado'
  const mostrarSistema = cerrado || !inventario.ciego
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  // valores locales editables
  const [val, setVal] = useState<Record<string, string>>(
    Object.fromEntries(lineas.map((l) => [l.id, l.cantidadContada != null ? String(l.cantidadContada) : ''])),
  )
  const [guardando, setGuardando] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [error, setError] = useState('')

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? lineas.filter((l) => l.materialNombre.toLowerCase().includes(t)) : lineas
  }, [q, lineas])
  const shown = filtradas.slice(0, limit)
  const contadas = Object.values(val).filter((v) => v.trim() !== '').length

  async function guardar(lineaId: string) {
    if (cerrado) return
    const raw = val[lineaId]?.trim()
    const contada = raw === '' || raw == null ? null : parseInt(raw, 10)
    if (contada != null && (!Number.isFinite(contada) || contada < 0)) { setError('Cantidad no válida'); return }
    setGuardando(lineaId); setError('')
    try {
      await fetch(`/api/inventarios/${inventario.id}/conteo`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lineaId, contada }),
      })
    } finally { setGuardando(null) }
  }

  async function cerrar() {
    if (!confirm('Al cerrar se aplicarán los ajustes de las diferencias contadas. ¿Continuar?')) return
    setCerrando(true); setError('')
    try {
      const r = await fetch(`/api/inventarios/${inventario.id}/cerrar`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Error'); return }
      router.refresh()
    } finally { setCerrando(false) }
  }

  return (
    <div className="card">
      <div className="toolbar">
        <input className="search-input" placeholder="Buscar material…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{contadas}/{lineas.length} contados</span>
        {canClose && !cerrado && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto', minHeight: 38 }} disabled={cerrando} onClick={cerrar}>
            {cerrando ? 'Cerrando…' : 'Cerrar y aplicar ajustes'}
          </button>
        )}
      </div>
      {error && <div className="badge danger" style={{ padding: '8px 12px', marginBottom: 10 }}>{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Material</th>
              {mostrarSistema && <th className="num">Sistema</th>}
              <th className="num">Contado</th>
              {cerrado && <th className="num">Diferencia</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const raw = val[l.id]?.trim()
              const contada = raw === '' || raw == null ? null : parseInt(raw, 10)
              const dif = cerrado && contada != null ? contada - l.cantidadSistema : null
              return (
                <tr key={l.id}>
                  <td className="cell-strong">{l.materialNombre}</td>
                  {mostrarSistema && <td className="num">{l.cantidadSistema}</td>}
                  <td className="num" style={{ width: 110 }}>
                    {cerrado ? (contada ?? '—') : (
                      <input
                        type="number" inputMode="numeric" style={{ width: 90, textAlign: 'right' }}
                        value={val[l.id] ?? ''}
                        disabled={guardando === l.id}
                        onChange={(e) => setVal({ ...val, [l.id]: e.target.value })}
                        onBlur={() => guardar(l.id)}
                      />
                    )}
                  </td>
                  {cerrado && (
                    <td className="num">
                      {dif == null ? '—' : dif === 0 ? <span className="badge ok">0</span> : (
                        <span className={`badge ${dif > 0 ? 'warn' : 'danger'}`}>{dif > 0 ? '+' : ''}{dif}</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {shown.length < filtradas.length && (
        <div className="load-more">
          <button className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>Ver más ({filtradas.length - shown.length})</button>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Link href={volverHref} className="btn btn-ghost">Volver</Link>
      </div>
    </div>
  )
}
