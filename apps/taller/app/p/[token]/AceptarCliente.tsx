'use client'
import { useState, useTransition } from 'react'
import { aceptarPublico, rechazarPublico } from './acciones'

export function AceptarCliente({ token, textoAsegura, textoTaller }: { token: string; textoAsegura: string | null; textoTaller: string | null }) {
  // Casillas SIN MARCAR; aceptar el presupuesto no depende de ellas.
  const [asegura, setAsegura] = useState(false)
  const [taller, setTaller] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [pend, iniciar] = useTransition()
  if (msg?.ok) return <p className="ok" role="status">{msg.t}</p>
  return (
    <div className="formulario">
      {(textoAsegura || textoTaller) && (
        <fieldset>
          <legend>Comunicaciones (opcional)</legend>
          {textoAsegura && <label className="casilla"><input type="checkbox" checked={asegura} onChange={(e) => setAsegura(e.target.checked)} /><span>{textoAsegura}</span></label>}
          {textoTaller && <label className="casilla"><input type="checkbox" checked={taller} onChange={(e) => setTaller(e.target.checked)} /><span>{textoTaller}</span></label>}
          <p className="tenue">Puedes aceptar el presupuesto sin marcar ninguna.</p>
        </fieldset>
      )}
      {msg && !msg.ok && <p className="aviso-error" role="alert">{msg.t}</p>}
      <div className="fila">
        <button className="btn" type="button" disabled={pend} onClick={() => iniciar(async () => {
          const r = await aceptarPublico(token, { asegura, taller })
          setMsg(r.ok ? { ok: true, t: 'Presupuesto aceptado. El taller ya lo tiene.' } : { ok: false, t: r.mensaje })
        })}>Acepto el presupuesto</button>
        <button className="btn btn-sec" type="button" disabled={pend} onClick={() => iniciar(async () => {
          const r = await rechazarPublico(token)
          setMsg(r.ok ? { ok: true, t: 'Hemos anotado que no lo aceptas.' } : { ok: false, t: r.mensaje })
        })}>No lo acepto</button>
      </div>
    </div>
  )
}
