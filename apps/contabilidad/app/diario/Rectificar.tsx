'use client'
import { useState } from 'react'

/** Contraasiento de un asiento (el original no se toca). Pide la fecha; por defecto, hoy. */
export function Rectificar({ id, numero }: { id: string; numero: number }) {
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    setEnviando(true); setError('')
    const r = await fetch(`/api/asientos/${id}/rectificar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fecha }) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError((j.errores ?? [j.error ?? 'No se pudo rectificar']).join('. ')); return }
    window.location.reload()
  }
  if (!abierto) return <button type="button" className="btn btn-sec" onClick={() => setAbierto(true)}>Rectificar</button>
  return (
    <div className="fila">
      <label className="campo">Fecha del contraasiento del nº {numero}
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <button type="button" className="btn" onClick={enviar} disabled={enviando}>{enviando ? 'Rectificando…' : 'Confirmar contraasiento'}</button>
      <button type="button" className="btn btn-sec" onClick={() => setAbierto(false)}>Cancelar</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
