'use client'

import { useState } from 'react'
import { Sello } from '../_sello'

const LONGITUD = 4
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export function LoginCliente({ logoUrl, nombre, conFichaje = false }: { logoUrl: string; nombre: string; conFichaje?: boolean }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  // null = entrar al taller; 'entrada'/'salida' = el PIN sirve para fichar (no abre sesión).
  const [fichando, setFichando] = useState<null | 'entrada' | 'salida'>(null)
  const [fichado, setFichado] = useState('')

  async function enviar(valor: string) {
    setEnviando(true)
    setError('')
    try {
      const res = await fetch(fichando ? '/api/fichar' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fichando ? { pin: valor, accion: fichando } : { pin: valor }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo entrar')
        setPin('')
        return
      }
      if (fichando) {
        // Solo se muestra «hecho» cuando rrhh lo ha registrado (ok de la API); cualquier fallo salió arriba.
        setFichado(`${fichando === 'entrada' ? 'Entrada' : 'Salida'} registrada${j.nombre ? `: ${j.nombre}` : ''}`)
        setFichando(null)
        setPin('')
        return
      }
      window.location.href = '/'
    } catch {
      setError('Sin conexión. Inténtalo de nuevo')
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  function pulsar(d: string) {
    if (enviando || pin.length >= LONGITUD) return
    const nuevo = pin + d
    setPin(nuevo)
    if (nuevo.length === LONGITUD) void enviar(nuevo)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={nombre} className="login-logo" />
        <Sello />
        <p className="tenue">{fichando ? `Introduce tu PIN para fichar la ${fichando}` : 'Introduce tu PIN'}</p>
        {fichado && <p className="ok" role="status">{fichado}</p>}
        <div className="pin-puntos" aria-label={`${pin.length} de ${LONGITUD} dígitos`}>
          {Array.from({ length: LONGITUD }, (_, i) => (
            <span key={i} className={i < pin.length ? 'punto lleno' : 'punto'} />
          ))}
        </div>
        <div className="error" role="alert">{error}</div>
        <div className="pad">
          {TECLAS.map(d => (
            <button key={d} type="button" className="tecla" onClick={() => pulsar(d)} disabled={enviando}>{d}</button>
          ))}
          <button type="button" className="tecla tecla-sec" onClick={() => setPin('')} disabled={enviando} aria-label="Borrar todo">C</button>
          <button type="button" className="tecla" onClick={() => pulsar('0')} disabled={enviando}>0</button>
          <button type="button" className="tecla tecla-sec" onClick={() => setPin(pin.slice(0, -1))} disabled={enviando} aria-label="Borrar último">⌫</button>
        </div>
        {conFichaje && (
          <div className="fila" style={{ marginTop: 12 }}>
            {fichando ? (
              <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => { setFichando(null); setPin(''); setError('') }}>Cancelar fichaje</button>
            ) : (
              <>
                <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => { setFichando('entrada'); setFichado(''); setPin(''); setError('') }}>Fichar entrada</button>
                <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => { setFichando('salida'); setFichado(''); setPin(''); setError('') }}>Fichar salida</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
