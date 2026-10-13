'use client'
import { VERSION_TEXTO_AVISOS } from '@central/module-seguros-portal'

import type { PermisoNotificaciones } from '@/lib/push-estado'

/**
 * Lo que hacen en el NAVEGADOR la bienvenida de avisos (`BienvenidaAvisos.tsx`) y el interruptor de
 * «Configuración» (`ActivarPush.tsx`): leer el estado de ESTE dispositivo, pedir permiso y
 * suscribirse, o darse de baja. Un solo sitio para que las dos pantallas no diverjan.
 *
 * 🚨 `activarEnEsteDispositivo` manda `VERSION_TEXTO_AVISOS` a `/api/push/suscribir`: es la
 * declaración de que la pantalla ENSEÑÓ `TEXTO_CONSENTIMIENTO_AVISOS` junto al botón. Quien la llame
 * tiene que pintar ese texto.
 */
export const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export interface LecturaDispositivo {
  serviceWorker: boolean
  pushManager: boolean
  notificaciones: boolean
  permiso: PermisoNotificaciones | null
  suscripcionLocal: boolean
  /** No se pudo leer la suscripción (el SW no respondió). */
  fallo: boolean
}

export function leerPermiso(): PermisoNotificaciones | null {
  try {
    return typeof Notification === 'undefined' ? null : Notification.permission
  } catch {
    return null
  }
}

export async function leerDispositivo(): Promise<LecturaDispositivo> {
  const base = {
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notificaciones: 'Notification' in window,
    permiso: leerPermiso(),
  }
  if (!base.serviceWorker || !base.pushManager || !base.notificaciones) return { ...base, suscripcionLocal: false, fallo: false }
  try {
    const registro = await navigator.serviceWorker.ready
    const sub = await registro.pushManager.getSubscription()
    return { ...base, suscripcionLocal: sub !== null, fallo: false }
  } catch {
    return { ...base, suscripcionLocal: false, fallo: true }
  }
}

/**
 * Pide permiso (solo si no está ya concedido) y suscribe.
 *  · `activadas`: permiso concedido y suscripción guardada en el servidor (con su consentimiento).
 *  · `denegado`: la persona dijo que no en el diálogo del navegador (ya no se puede volver a pedir).
 *  · `sin_elegir`: cerró el diálogo sin elegir.
 *  · `error`: algo falló por el camino.
 */
export async function activarEnEsteDispositivo(): Promise<'activadas' | 'denegado' | 'sin_elegir' | 'error'> {
  try {
    const permiso = leerPermiso() === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permiso === 'denied') return 'denegado'
    if (permiso !== 'granted') return 'sin_elegir'
    const registro = await navigator.serviceWorker.ready
    const sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CLAVE_PUBLICA!),
    })
    const r = await fetch('/api/push/suscribir', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...sub.toJSON(), consentimiento: VERSION_TEXTO_AVISOS }),
    })
    if (!r.ok) {
      // El servidor no la guardó: no se deja una suscripción local que haría pintar «activados»
      // sin que ningún cron pueda mandar nada.
      await sub.unsubscribe().catch(() => {})
      return 'error'
    }
    return 'activadas'
  } catch {
    return 'error'
  }
}

/** Baja de ESTE dispositivo. Lanza si no se pudo (la pantalla sigue diciendo «activados»). */
export async function desactivarEnEsteDispositivo(): Promise<void> {
  const registro = await navigator.serviceWorker.ready
  const sub = await registro.pushManager.getSubscription()
  if (!sub) return
  const r = await fetch('/api/push/desuscribir', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  if (!r.ok) throw new Error(String(r.status))
  await sub.unsubscribe()
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
