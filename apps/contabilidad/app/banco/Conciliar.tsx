'use client'
import { useState } from 'react'

export type OpcionPartida = { id: string; documento: string; cuenta: string; etiqueta: string }
type Props = {
  movimientoId: string
  /** Partidas del mismo sentido que el movimiento. */
  opciones: OpcionPartida[]
  /** Partida preseleccionada SOLO si la propuesta es única y exacta. */
  propuesta: string | null
  /** Regla de concepto que casa, si no hay partida. */
  regla: { id: string; texto: string } | null
  ambigua: string | null
}

/** Una fila por conciliar: muestra lo que propone el sistema y espera la CONFIRMACIÓN de la persona. Nada se asienta sin pulsar. */
export function Conciliar({ movimientoId, opciones, propuesta, regla, ambigua }: Props) {
  const [eleccion, setEleccion] = useState(propuesta ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function confirmar(cuerpo: Record<string, unknown>) {
    setEnviando(true); setMsg(null)
    const r = await fetch('/api/banco/conciliar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ movimientoId, ...cuerpo }) })
    const j = (await r.json().catch(() => ({}))) as { errores?: string[]; error?: string }
    setEnviando(false)
    if (!r.ok) { setMsg((j.errores ?? [j.error ?? 'No se pudo conciliar']).join(' · ')); return }
    window.location.reload()
  }

  const op = opciones.find((o) => o.id === eleccion)
  return (
    <div className="conciliar">
      {ambigua && <p className="tenue">{ambigua} — elige tú cuál es.</p>}
      {regla && !propuesta && <p className="tenue">Regla de concepto: {regla.texto}</p>}
      {opciones.length > 0 && (
        <label className="campo">{propuesta ? 'Propuesta' : 'Casar con'}
          <select value={eleccion} onChange={(e) => setEleccion(e.target.value)}>
            <option value="">— elige una partida —</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
          </select>
        </label>
      )}
      <div className="fila">
        {op && <button type="button" className="btn" disabled={enviando} onClick={() => void confirmar({ modo: 'partida', documento: op.documento, cuenta: op.cuenta })}>{propuesta === op.id ? 'Confirmar propuesta' : 'Conciliar con esta'}</button>}
        {regla && <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => void confirmar({ modo: 'regla', reglaId: regla.id })}>Asentar por regla</button>}
      </div>
      {!op && !regla && opciones.length === 0 && <p className="tenue">Sin partida pendiente que case. Crea una regla por concepto o registra antes la factura.</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </div>
  )
}
