'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Espacio = { id: string; nombre: string }
type Accion = 'entrada' | 'salida' | 'ajuste' | 'rotura' | 'traspaso'

const NECESITA_MOTIVO: Accion[] = ['ajuste', 'rotura']
const LABEL: Record<Accion, string> = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', rotura: 'Rotura', traspaso: 'Traspaso',
}

export default function Acciones({ materialId, espacios }: { materialId: string; espacios: Espacio[] }) {
  const router = useRouter()
  const [accion, setAccion] = useState<Accion>('entrada')
  const [espacioId, setEspacioId] = useState(espacios[0]?.id ?? '')
  const [origenId, setOrigenId] = useState(espacios[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(espacios[1]?.id ?? '')
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError('')
    const n = parseInt(cantidad, 10)
    if (!Number.isFinite(n) || (accion !== 'ajuste' && n <= 0) || (accion === 'ajuste' && n === 0)) {
      setError('Cantidad no válida')
      return
    }
    if (NECESITA_MOTIVO.includes(accion) && !motivo.trim()) {
      setError('El motivo es obligatorio en ajustes y roturas')
      return
    }
    setSaving(true)
    try {
      let r: Response
      if (accion === 'traspaso') {
        if (origenId === destinoId) { setError('Origen y destino deben ser distintos'); setSaving(false); return }
        r = await fetch('/api/transferencias', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ materialId, cantidad: n, espacioOrigenId: origenId, espacioDestinoId: destinoId }),
        })
      } else {
        r = await fetch('/api/movimientos', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ materialId, tipo: accion, cantidad: n, espacioId, motivo: motivo || null }),
        })
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.error || 'No se pudo registrar')
        return
      }
      setCantidad('1'); setMotivo('')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const esTraspaso = accion === 'traspaso'

  return (
    <div className="card">
      <div className="card-title">Registrar movimiento</div>
      <form onSubmit={enviar} className="grid">
        <div className="chip-row">
          {(Object.keys(LABEL) as Accion[]).map((a) => (
            <button
              type="button"
              key={a}
              className={`chip${accion === a ? ' chip-active' : ''}`}
              onClick={() => { setAccion(a); setError('') }}
            >
              {LABEL[a]}
            </button>
          ))}
        </div>

        <div className="form-bar">
          {esTraspaso ? (
            <>
              <div className="form-field grow">
                <label className="field-label">Desde</label>
                <select value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
                  {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
              <div className="form-field grow">
                <label className="field-label">Hacia</label>
                <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                  {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="form-field grow">
              <label className="field-label">Almacén</label>
              <select value={espacioId} onChange={(e) => setEspacioId(e.target.value)}>
                {espacios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="form-field" style={{ flex: '0 0 120px' }}>
            <label className="field-label">Cantidad{accion === 'ajuste' ? ' (±)' : ''}</label>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
        </div>

        {NECESITA_MOTIVO.includes(accion) && (
          <div className="form-field">
            <label className="field-label">Motivo *</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={accion === 'rotura' ? 'p. ej. rotas en el evento' : 'p. ej. recuento físico'} />
          </div>
        )}

        {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
        <button className="btn btn-primary" disabled={saving || espacios.length === 0}>
          {saving ? 'Registrando…' : `Registrar ${LABEL[accion].toLowerCase()}`}
        </button>
        {espacios.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Crea un almacén primero.</div>}
      </form>
    </div>
  )
}
