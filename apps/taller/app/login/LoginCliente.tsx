'use client'

import { useState } from 'react'
import { Sello } from '../_sello'

const LONGITUD = 4
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export function LoginCliente({ logoUrl, nombre }: { logoUrl: string; nombre: string }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(valor: string) {
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: valor }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo entrar')
        setPin('')
        return
      }
      window.location.href = '/'
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
        <p className="tenue">Introduce tu PIN</p>
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
      </div>
    </div>
  )
}
