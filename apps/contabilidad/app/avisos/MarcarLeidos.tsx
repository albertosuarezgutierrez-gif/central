'use client'
import { useState } from 'react'

export function MarcarLeidos() {
  const [hecho, setHecho] = useState(false)
  return (
    <p className="no-imprimir">
      <button type="button" className="btn btn-sec" disabled={hecho} onClick={async () => { const r = await fetch('/api/avisos/leer', { method: 'POST' }); if (r.ok) { setHecho(true); window.location.reload() } }}>
        Marcar todos como leídos
      </button>
    </p>
  )
}
