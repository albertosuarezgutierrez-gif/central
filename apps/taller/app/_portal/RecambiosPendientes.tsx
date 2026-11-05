'use client'
import { useState, useTransition } from 'react'
import { aceptarRecambioAccion } from './acciones'

/** «Recambios pendientes de aceptar» en la OT: aceptar DESPUÉS un recambio añadido sin la aceptación del cliente. */
export function RecambiosPendientes({ otId, lineas }: { otId: string; lineas: { id: string; texto: string }[] }) {
  const [hechas, setHechas] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  const vivas = lineas.filter((l) => !hechas.includes(l.id))
  if (vivas.length === 0) return null
  return (
    <div className="ficha">
      <h2>Recambios pendientes de aceptar</h2>
      <p className="tenue">No entran en la factura ni salen del stock hasta que el cliente los acepte.</p>
      <ul>
        {vivas.map((l) => (
          <li key={l.id} className="fila">
            <span>{l.texto}</span>
            <button className="btn btn-sec" type="button" disabled={pend} onClick={() => iniciar(async () => {
              setError(null)
              const r = await aceptarRecambioAccion(otId, l.id)
              if (r.ok) setHechas((h) => [...h, l.id]); else setError(r.mensaje)
            })}>El cliente lo acepta</button>
          </li>
        ))}
      </ul>
      {error && <p className="aviso-error" role="alert">{error}</p>}
    </div>
  )
}
