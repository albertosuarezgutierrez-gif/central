'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ESTADO_BADGE } from '../eventos-client'

type Material = { id: string; nombre: string }
type Espacio = { id: string; nombre: string }
export type Linea = {
  id: string
  materialNombre: string
  espacioNombre: string
  cantidad: number
  entregada: number
  devuelta: number
  danada: number
}
export type Evento = {
  id: string
  tipo: string
  titulo: string
  estado: string
}

export default function EventoDetalle({
  evento, lineas, materiales, espacios,
}: { evento: Evento; lineas: Linea[]; materiales: Material[]; espacios: Espacio[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nl, setNl] = useState({ materialId: materiales[0]?.id ?? '', espacioId: espacios[0]?.id ?? '', cantidad: '1' })
  const [dev, setDev] = useState<Record<string, { buenas: string; rotas: string }>>({})

  async function call(url: string, body?: unknown, method = 'POST') {
    setError(''); setSaving(true)
    try {
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Error'); return false }
      router.refresh()
      return true
    } finally { setSaving(false) }
  }

  const esPresupuesto = evento.estado === 'presupuesto'
  const esConfirmado = evento.estado === 'confirmado'
  const esEntregado = evento.estado === 'entregado'

  async function addLinea(e: React.FormEvent) {
    e.preventDefault()
    const c = parseInt(nl.cantidad, 10)
    if (!c || c <= 0) { setError('Cantidad no válida'); return }
    if (await call(`/api/eventos/${evento.id}/lineas`, { materialId: nl.materialId, espacioId: nl.espacioId, cantidad: c })) {
      setNl({ ...nl, cantidad: '1' })
    }
  }

  async function devolver() {
    const devoluciones = lineas
      .map((l) => ({ lineaId: l.id, buenas: parseInt(dev[l.id]?.buenas ?? '0', 10) || 0, rotas: parseInt(dev[l.id]?.rotas ?? '0', 10) || 0 }))
      .filter((d) => d.buenas + d.rotas > 0)
    if (devoluciones.length === 0) { setError('Indica qué se devuelve'); return }
    await call(`/api/eventos/${evento.id}/devolver`, { devoluciones })
  }

  return (
    <>
      <div className="card">
        <div className="ficha-head">
          <div className="card-title" style={{ margin: 0 }}>
            Estado: <span className={`badge ${ESTADO_BADGE[evento.estado] ?? ''}`}>{evento.estado}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {esPresupuesto && lineas.length > 0 && (
              <button className="btn btn-primary" style={{ minHeight: 36 }} disabled={saving} onClick={() => call(`/api/eventos/${evento.id}/confirmar`)}>Confirmar (reservar stock)</button>
            )}
            {esConfirmado && (
              <button className="btn btn-primary" style={{ minHeight: 36 }} disabled={saving} onClick={() => call(`/api/eventos/${evento.id}/entregar`)}>Entregar</button>
            )}
            {(esPresupuesto || esConfirmado) && (
              <button className="btn btn-ghost" style={{ minHeight: 36 }} disabled={saving} onClick={() => call(`/api/eventos/${evento.id}/cancelar`)}>Cancelar</button>
            )}
          </div>
        </div>
        {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {esPresupuesto && 'Añade material y pulsa «Confirmar» para reservar el stock (nadie más podrá tomarlo).'}
          {esConfirmado && 'Stock reservado. Pulsa «Entregar» cuando salga del almacén.'}
          {esEntregado && 'Material entregado. Registra la devolución (buenas + rotas) por línea.'}
          {(evento.estado === 'devuelto' || evento.estado === 'cerrado') && 'Evento cerrado: todo devuelto.'}
          {evento.estado === 'cancelado' && 'Evento cancelado.'}
        </div>
      </div>

      {esPresupuesto && (
        <div className="card">
          <div className="card-title">Añadir material</div>
          <form onSubmit={addLinea} className="form-bar">
            <div className="form-field grow">
              <label className="field-label">Material</label>
              <select value={nl.materialId} onChange={(e) => setNl({ ...nl, materialId: e.target.value })}>
                {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: '1 1 160px' }}>
              <label className="field-label">Almacén</label>
              <select value={nl.espacioId} onChange={(e) => setNl({ ...nl, espacioId: e.target.value })}>
                {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: '0 0 110px' }}>
              <label className="field-label">Cantidad</label>
              <input type="number" value={nl.cantidad} onChange={(e) => setNl({ ...nl, cantidad: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={saving || materiales.length === 0 || espacios.length === 0}>Añadir</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Material del evento ({lineas.length})</div>
        {lineas.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Sin material todavía.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th><th>Almacén</th><th className="num">Cant.</th>
                  <th className="num">Entregado</th><th className="num">Devuelto</th><th className="num">Roto</th>
                  {esEntregado && <th>Devolver (buenas / rotas)</th>}
                  {esPresupuesto && <th></th>}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const fuera = l.entregada - l.devuelta - l.danada
                  return (
                    <tr key={l.id}>
                      <td className="cell-strong">{l.materialNombre}</td>
                      <td className="muted">{l.espacioNombre}</td>
                      <td className="num">{l.cantidad}</td>
                      <td className="num">{l.entregada || '—'}</td>
                      <td className="num">{l.devuelta || '—'}</td>
                      <td className="num">{l.danada || '—'}</td>
                      {esEntregado && (
                        <td>
                          {fuera > 0 ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="number" placeholder="OK" style={{ width: 64 }} value={dev[l.id]?.buenas ?? ''} onChange={(e) => setDev({ ...dev, [l.id]: { ...(dev[l.id] ?? { buenas: '', rotas: '' }), buenas: e.target.value } })} />
                              <input type="number" placeholder="rotas" style={{ width: 64 }} value={dev[l.id]?.rotas ?? ''} onChange={(e) => setDev({ ...dev, [l.id]: { ...(dev[l.id] ?? { buenas: '', rotas: '' }), rotas: e.target.value } })} />
                              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>fuera: {fuera}</span>
                            </div>
                          ) : <span className="badge ok">devuelto</span>}
                        </td>
                      )}
                      {esPresupuesto && (
                        <td>
                          <button className="btn btn-ghost" style={{ minHeight: 32, padding: '4px 10px' }} disabled={saving} onClick={() => call(`/api/eventos/${evento.id}/lineas?lineaId=${l.id}`, undefined, 'DELETE')}>Quitar</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {esEntregado && lineas.some((l) => l.entregada - l.devuelta - l.danada > 0) && (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={saving} onClick={devolver}>Registrar devolución</button>
          </div>
        )}
      </div>
    </>
  )
}
