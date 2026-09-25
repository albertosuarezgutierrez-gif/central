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
        <>
          <PreferenciasAvisos />
          <button type="button" className="campana-reintentar" onClick={desactivar}>
            Desactivar avisos por notificación
          </button>
        </>
      ) : (
        <button type="button" className="campana-reintentar" onClick={activar} disabled={estado === 'trabajando'}>
          {estado === 'error' ? 'No se ha podido activar — reintentar' : 'Avisarme también con una notificación'}
        </button>
      )}
    </div>
  )
}

const TIPOS: { tipo: string; texto: string }[] = [
  { tipo: 'recibo_devuelto', texto: 'Recibo devuelto' },
  { tipo: 'recibo_nuevo', texto: 'Recibo nuevo al cobro' },
  { tipo: 'siniestro', texto: 'Novedades de un siniestro' },
]

/**
 * Qué novedades de la compañía (llegan por CIMA) avisa la notificación. Solo se pinta con el push
 * activo: sin él no hay nada que elegir. Si no se pueden leer se DICE — unas casillas pintadas por
 * defecto mentirían sobre lo que de verdad está guardado.
 */
function PreferenciasAvisos() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null | 'error'>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    void fetch('/api/push/preferencias')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { preferencias: Record<string, boolean> }) => setPrefs(d.preferencias))
      .catch(() => setPrefs('error'))
  }, [])

  if (prefs === null) return null
  if (prefs === 'error') return <p className="campana-prefs-error">No hemos podido leer qué avisos tienes activados.</p>

  const cambiar = async (tipo: string, activo: boolean) => {
    const antes = prefs
    setFallo(false)
    setPrefs({ ...prefs, [tipo]: activo })
    const r = await fetch('/api/push/preferencias', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, activo }),
    }).catch(() => null)
    if (!r?.ok) {
      setPrefs(antes)
      setFallo(true)
    }
  }

  return (
    <fieldset className="campana-prefs">
      <legend>Avisarme de</legend>
      {TIPOS.map(({ tipo, texto }) => (
        <label key={tipo}>
          <input type="checkbox" checked={prefs[tipo] ?? true} onChange={(e) => void cambiar(tipo, e.target.checked)} />
          {texto}
        </label>
      ))}
      {fallo && <p className="campana-prefs-error">No se ha podido guardar el cambio. Inténtalo de nuevo.</p>}
    </fieldset>
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
