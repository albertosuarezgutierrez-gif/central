'use client'
import { useState } from 'react'

function base64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** Botón para activar las notificaciones push. `endpoint` = ruta de suscripción del lado actual. */
export default function ActivarPush({ endpoint }: { endpoint: string }) {
  const [estado, setEstado] = useState('')
  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  async function activar() {
    setEstado('')
    if (!clave) { setEstado('Push no configurado'); return }
    try {
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setEstado('Permiso denegado'); return }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(clave) as BufferSource })
      const j = sub.toJSON()
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }),
      })
      setEstado(r.ok ? '✅ Notificaciones activadas' : 'Error al guardar')
    } catch { setEstado('No se pudo activar') }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={activar} className="bg-paper-2 text-ink-2 hover:bg-line">Activar notificaciones</button>
      {estado && <span className="text-ink-3 text-sm">{estado}</span>}
    </span>
  )
}
