'use client'
import { useEffect } from 'react'

/**
 * Registra el service worker. Silencioso si el navegador no lo soporta.
 *
 * Es el requisito que Chrome pone —además del manifiesto— para ofrecer instalar
 * la app. El de aquí no cachea nada a propósito: ver `public/sw.js`.
 */
export function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
