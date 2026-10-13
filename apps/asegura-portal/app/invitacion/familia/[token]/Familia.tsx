'use client'
import { useEffect } from 'react'

/**
 * Con sesión recién abierta por el enlace: avisa al servidor UNA vez (el servidor decide si cuenta: enlace
 * vivo, identidad nueva, no propio). Un POST y no el render, para que un escáner que precarga la URL no
 * registre entradas. Sin salida visible: el resultado es el mismo para todos.
 */
export function RegistrarEntradaFamilia({ token }: { token: string }) {
  useEffect(() => {
    void fetch('/api/invitaciones/familia/usar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => undefined)
  }, [token])
  return null
}
