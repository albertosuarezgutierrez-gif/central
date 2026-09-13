'use client'
import { useEffect, useState } from 'react'

/**
 * Interruptor de avisos por notificación push (12/09/2026), dentro del panel de la campana: es el
 * sitio natural — «avisos» es justo lo que esto añade como canal.
 *
 * 🚨 Sin `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (o sin soporte del navegador) el interruptor NO SE PINTA:
 * un botón que falla al pulsarlo es peor que no ofrecerlo. `RegistrarSW` ya registró el service
 * worker en el layout raíz; aquí solo se pide permiso y se suscribe sobre él.
 */
export function ActivarPush() {
  const [estado, setEstado] = useState<'cargando' | 'sin_soporte' | 'activo' | 'inactivo' | 'trabajando' | 'error'>(
    'cargando',
  )

  useEffect(() => {
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setEstado('sin_soporte')
        return
      }
      try {
        const registro = await navigator.serviceWorker.ready
        const sub = await registro.pushManager.getSubscription()
        setEstado(sub ? 'activo' : 'inactivo')
      } catch {
        setEstado('error')
      }
    })()
  }, [])

  if (estado === 'cargando' || estado === 'sin_soporte') return null

  const activar = async () => {
    setEstado('trabajando')
    try {
      if (Notification.permission === 'denied') {
        setEstado('error')
        return
      }
      const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado('inactivo')
        return
      }
      const registro = await navigator.serviceWorker.ready
      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const r = await fetch('/api/push/suscribir', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!r.ok) throw new Error(String(r.status))
      setEstado('activo')
    } catch {
      setEstado('error')
    }
  }

  const desactivar = async () => {
    setEstado('trabajando')
    try {
      const registro = await navigator.serviceWorker.ready
      const sub = await registro.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/desuscribir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEstado('inactivo')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="campana-push">
      {estado === 'activo' ? (
        <button type="button" className="campana-reintentar" onClick={desactivar}>
          Desactivar avisos por notificación
        </button>
      ) : (
        <button type="button" className="campana-reintentar" onClick={activar} disabled={estado === 'trabajando'}>
          {estado === 'error' ? 'No se ha podido activar — reintentar' : 'Avisarme también con una notificación'}
        </button>
      )}
    </div>
  )
}

/** VAPID exige la clave pública como `Uint8Array`, y el navegador la da en base64url. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const salida = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) salida[i] = raw.charCodeAt(i)
  return salida
}
