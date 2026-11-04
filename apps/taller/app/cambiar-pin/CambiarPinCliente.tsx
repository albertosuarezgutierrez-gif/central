'use client'
import { useState, useTransition } from 'react'
import { cambiarPinAccion } from './acciones'

export function CambiarPinCliente({ obligatorio }: { obligatorio: boolean }) {
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [pend, iniciar] = useTransition()
  const valido = /^\d{4}$/.test(pin) && pin === pin2
  return (
    <form className="formulario" onSubmit={(e) => {
      e.preventDefault()
      setError('')
      iniciar(async () => {
        const r = await cambiarPinAccion(pin)
        if (!r.ok) return setError(r.errores.join(' · '))
        window.location.href = '/'
      })
    }}>
      {obligatorio && <p className="aviso-error" role="status">Tu PIN es temporal. Elige uno propio para seguir.</p>}
      <label className="campo">PIN nuevo (4 dígitos)
        <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label className="campo">Repite el PIN
        <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
      </label>
      {pin2.length === 4 && pin !== pin2 && <p className="error" role="alert">Los dos PIN no coinciden</p>}
      {error && <p className="aviso-error" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={pend || !valido}>{pend ? 'Guardando…' : 'Guardar mi PIN'}</button>
    </form>
  )
}
