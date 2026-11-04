'use client'
import { useState, useTransition } from 'react'
import { generarEnlaceAccion } from '../acciones'

export function EnlaceCliente({ presupuestoId, yaGenerado }: { presupuestoId: string; yaGenerado: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  return (
    <div className="ficha">
      {url ? (
        <>
          <p className="ok">Enlace para el cliente (solo se muestra ahora; si lo pierdes, genera otro):</p>
          <p className="enlace-copia">{url}</p>
          <button className="btn btn-sec" type="button" onClick={() => void navigator.clipboard?.writeText(url)}>Copiar enlace</button>
        </>
      ) : (
        <button className="btn" type="button" disabled={pend} onClick={() => iniciar(async () => {
          setError(null)
          const r = await generarEnlaceAccion(presupuestoId)
          if (r.ok) setUrl(`${location.origin}${r.ruta}`)
          else setError(r.errores.join(' '))
        })}>{yaGenerado ? 'Generar un enlace nuevo (anula el anterior)' : 'Generar enlace para el cliente'}</button>
      )}
      {error && <p className="aviso-error" role="alert">{error}</p>}
      <p className="tenue">No se envía ningún correo desde aquí: copia el enlace y mándalo tú.</p>
    </div>
  )
}
