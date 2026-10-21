'use client'
import { useEffect, useState } from 'react'

import { leerInterruptorItv } from '@/lib/carnets-vista'

/**
 * «Avisarme cuando toque la ITV de mi vehículo» (21/10/2026). Encendido por defecto; apagarlo guarda una fila en
 * `portal_aviso_silenciado` (tipo `vencimiento_itv`) por la MISMA ruta que el del carné
 * (`/api/push/preferencias`). Lo respeta la campana. Si no se puede leer se DICE, y si no se puede guardar vuelve
 * a lo que de verdad está guardado.
 */
export function InterruptorAvisoItv() {
  const [activo, setActivo] = useState<boolean | null | 'error'>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    void fetch('/api/push/preferencias')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: unknown) => {
        const v = leerInterruptorItv(d)
        setActivo(v === null ? 'error' : v)
      })
      .catch(() => setActivo('error'))
  }, [])

  if (activo === null) return null
  if (activo === 'error') return <p className="campana-prefs-error">No hemos podido leer si tienes activado el aviso de la ITV.</p>

  const cambiar = async (nuevo: boolean) => {
    const antes = activo
    setFallo(false)
    setActivo(nuevo)
    const r = await fetch('/api/push/preferencias', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'vencimiento_itv', activo: nuevo }),
    }).catch(() => null)
    if (!r?.ok) {
      setActivo(antes)
      setFallo(true)
    }
  }

  return (
    <div className="campana-prefs" style={{ minWidth: 0 }}>
      <label>
        <input type="checkbox" checked={activo} onChange={(e) => void cambiar(e.target.checked)} />
        Avisarme cuando toque la ITV de mi vehículo
      </label>
      {fallo && <p className="campana-prefs-error">No se ha podido guardar el cambio. Inténtalo de nuevo.</p>}
    </div>
  )
}
