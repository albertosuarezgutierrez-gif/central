'use client'
import { useState } from 'react'

/** Copiar el texto del pedido al portapapeles o imprimirlo: el dueño lo manda él (la app no envía nada). */
export function CopiarImprimir({ texto }: { texto: string }) {
  const [msg, setMsg] = useState('')
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setMsg('Copiado') } catch { setMsg('No se pudo copiar: selecciona el texto a mano') }
  }
  return (
    <div className="fila no-imprimir">
      <button type="button" className="btn" onClick={copiar}>Copiar pedido</button>
      <button type="button" className="btn btn-sec" onClick={() => window.print()}>Imprimir</button>
      {msg && <span className="tenue" role="status">{msg}</span>}
    </div>
  )
}
