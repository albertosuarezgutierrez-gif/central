'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Espacio = { id: string; nombre: string }
type Material = { id: string; nombre: string }
export type TransferRow = {
  id: string
  materialNombre: string
  origen: string
  destino: string
  cantidad: number
  estado: string
  createdAt: string
}

const ESTADO_BADGE: Record<string, string> = { pendiente: 'warn', recibida: 'ok', parcial: '', cancelada: 'danger' }
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function TransferenciasClient({
  transferencias, espacios, materiales,
}: { transferencias: TransferRow[]; espacios: Espacio[]; materiales: Material[] }) {
  const router = useRouter()
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [f, setF] = useState({ materialId: materiales[0]?.id ?? '', cantidad: '1', origenId: espacios[0]?.id ?? '', destinoId: espacios[1]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [recibidas, setRecibidas] = useState('0')
  const [rotas, setRotas] = useState('0')

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = parseInt(f.cantidad, 10)
    if (!Number.isFinite(n) || n <= 0) { setError('Cantidad no válida'); return }
    if (f.origenId === f.destinoId) { setError('Origen y destino deben ser distintos'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/transferencias', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ materialId: f.materialId, cantidad: n, espacioOrigenId: f.origenId, espacioDestinoId: f.destinoId }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'Error'); return }
      setF({ ...f, cantidad: '1' }); setNuevoAbierto(false); router.refresh()
    } finally { setSaving(false) }
  }

  function abrirConfirmar(t: TransferRow) {
    setConfirmando(t.id); setRecibidas(String(t.cantidad)); setRotas('0'); setError('')
  }

  async function confirmar(t: TransferRow) {
    const rec = parseInt(recibidas, 10) || 0
    const rot = parseInt(rotas, 10) || 0
    if (rec + rot === 0) { setError('Indica al menos una recibida o rota'); return }
    if (rec + rot > t.cantidad) { setError('Recibidas + rotas no puede superar lo enviado'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/transferencias/${t.id}/confirmar`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recibidas: rec, rotas: rot }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'Error'); return }
      setConfirmando(null); router.refresh()
    } finally { setSaving(false) }
  }

  async function cancelar(t: TransferRow) {
    setSaving(true)
    try {
      const r = await fetch(`/api/transferencias/${t.id}/cancelar`, { method: 'POST' })
      if (r.ok) router.refresh()
    } finally { setSaving(false) }
  }

  const pendientes = transferencias.filter((t) => t.estado === 'pendiente' || t.estado === 'parcial')
  const cerradas = transferencias.filter((t) => t.estado === 'recibida' || t.estado === 'cancelada')

  return (
    <>
      <div className="card">
        <button className="card-collapse" onClick={() => setNuevoAbierto((v) => !v)}>
          <span className="card-title" style={{ margin: 0 }}>Nuevo traspaso</span>
          <span className="muted">{nuevoAbierto ? '−' : '+'}</span>
        </button>
        {nuevoAbierto && (
          <form onSubmit={crear} className="grid" style={{ marginTop: 12 }}>
            <div className="form-field">
              <label className="field-label">Material</label>
              <select value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
                {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="form-bar">
              <div className="form-field grow">
                <label className="field-label">Desde</label>
                <select value={f.origenId} onChange={(e) => setF({ ...f, origenId: e.target.value })}>
                  {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
              <div className="form-field grow">
                <label className="field-label">Hacia</label>
                <select value={f.destinoId} onChange={(e) => setF({ ...f, destinoId: e.target.value })}>
                  {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
              <div className="form-field" style={{ flex: '0 0 110px' }}>
                <label className="field-label">Cantidad</label>
                <input type="number" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
              </div>
            </div>
            {error && !confirmando && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
            <button className="btn btn-primary" disabled={saving || espacios.length < 2 || materiales.length === 0}>
              {saving ? 'Creando…' : 'Crear traspaso'}
            </button>
            {espacios.length < 2 && <div className="muted" style={{ fontSize: 13 }}>Necesitas al menos 2 almacenes.</div>}
          </form>
        )}
      </div>

      <div className="card">
        <div className="card-title">Pendientes de recibir ({pendientes.length})</div>
        {pendientes.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No hay traspasos en tránsito.</div>
        ) : (
          <ul className="rows">
            {pendientes.map((t) => (
              <li key={t.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="cell-strong">{t.materialNombre}</span>
                  <span className="badge">{t.cantidad} uds</span>
                  <span className="muted">{t.origen} → {t.destino}</span>
                  <span className={`badge ${ESTADO_BADGE[t.estado] ?? ''}`} style={{ marginLeft: 'auto' }}>{t.estado}</span>
                </div>
                {confirmando === t.id ? (
                  <div className="form-bar" style={{ alignItems: 'flex-end' }}>
                    <div className="form-field" style={{ flex: '1 1 120px' }}>
                      <label className="field-label">Recibidas OK</label>
                      <input type="number" value={recibidas} onChange={(e) => setRecibidas(e.target.value)} />
                    </div>
                    <div className="form-field" style={{ flex: '1 1 120px' }}>
                      <label className="field-label">Rotas</label>
                      <input type="number" value={rotas} onChange={(e) => setRotas(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" disabled={saving} onClick={() => confirmar(t)}>Confirmar</button>
                    <button className="btn btn-ghost" onClick={() => setConfirmando(null)}>Cerrar</button>
                    {error && <div className="badge danger" style={{ padding: '8px 12px', width: '100%' }}>{error}</div>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ minHeight: 36 }} onClick={() => abrirConfirmar(t)}>Confirmar recepción</button>
                    {t.estado === 'pendiente' && (
                      <button className="btn btn-ghost" style={{ minHeight: 36 }} disabled={saving} onClick={() => cancelar(t)}>Cancelar</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {cerradas.length > 0 && (
        <div className="card">
          <div className="card-title">Historial de traspasos</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Material</th><th>Ruta</th><th className="num">Uds</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {cerradas.slice(0, 50).map((t) => (
                  <tr key={t.id}>
                    <td className="cell-strong">{t.materialNombre}</td>
                    <td className="muted">{t.origen} → {t.destino}</td>
                    <td className="num">{t.cantidad}</td>
                    <td><span className={`badge ${ESTADO_BADGE[t.estado] ?? ''}`}>{t.estado}</span></td>
                    <td className="muted">{fmt(t.createdAt)}</td>
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
