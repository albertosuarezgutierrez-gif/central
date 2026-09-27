'use client'
import { useState } from 'react'

/**
 * Copiar e imprimir la carta. Son las DOS únicas salidas: al portapapeles y a
 * la impresora del propio navegador. No hay «enviar» — la carta es de la
 * persona a su compañía, y sale por el canal que ella elija.
 */
export function AccionesCarta({ asunto, cuerpo }: { asunto: string; cuerpo: string }) {
  const [copiado, setCopiado] = useState<'no' | 'si' | 'error'>('no')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cuerpo)
      setCopiado('si')
    } catch {
      setCopiado('error')
    }
  }

  return (
    <div className="carta-acciones solo-pantalla">
      <button type="button" className="boton" onClick={() => void copiar()}>
        Copiar el texto
      </button>
      <button type="button" className="boton boton-secundario" onClick={() => window.print()}>
        Imprimir
      </button>
      <a
        className="boton boton-secundario"
        href={`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`}
      >
        Abrir en mi correo
      </a>
      <p className="tenue" aria-live="polite" style={{ flex: '1 1 100%', margin: '6px 0 0' }}>
        {copiado === 'si' && 'Copiado. Pégalo en tu correo o en el formulario de la compañía.'}
        {copiado === 'error' && 'No se ha podido copiar solo: selecciona el texto y cópialo a mano.'}
        {copiado === 'no' && '«Abrir en mi correo» prepara el mensaje en tu programa de correo sin destinatario: pon tú la dirección oficial de tu compañía.'}
      </p>
    </div>
  )
}
