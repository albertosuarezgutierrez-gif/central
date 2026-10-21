'use client'
import { useEffect, useState } from 'react'

import { leerInterruptorCarnet } from '@/lib/carnets-vista'

/**
 * «Avisarme cuando vaya a caducar mi carné de conducir» (21/10/2026). Encendido por defecto; apagarlo guarda
 * una fila en `portal_aviso_silenciado` (tipo `vencimiento_carnet`) por la MISMA ruta que el resto de
 * interruptores (`/api/push/preferencias`). Un solo origen de verdad: este componente sale en «Mis carnés» y
 * en «Configuración → Avisos», y los dos leen y escriben lo mismo. Lo respetan la campana y el correo.
 *
 * Si no se puede leer se DICE (no se pinta «encendido» por defecto sobre un dato que no se ha mirado), y si
 * no se puede guardar vuelve a lo que de verdad está guardado.
 */
export function InterruptorAvisoCarnet() {
  const [activo, setActivo] = useState<boolean | null | 'error'>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    void fetch('/api/push/preferencias')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: unknown) => {
        const v = leerInterruptorCarnet(d)
        setActivo(v === null ? 'error' : v)
      })
      .catch(() => setActivo('error'))
  }, [])

  if (activo === null) return null
  if (activo === 'error') return <p className="campana-prefs-error">No hemos podido leer si tienes activado el aviso de caducidad del carné.</p>

  const cambiar = async (nuevo: boolean) => {
    const antes = activo
    setFallo(false)
    setActivo(nuevo)
    const r = await fetch('/api/push/preferencias', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'vencimiento_carnet', activo: nuevo }),
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
        Avisarme cuando vaya a caducar mi carné de conducir
      </label>
      {fallo && <p className="campana-prefs-error">No se ha podido guardar el cambio. Inténtalo de nuevo.</p>}
    </div>
  )
}
