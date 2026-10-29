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
    // Al abrir la app, el contador del icono (avisos pendientes) se limpia.
    try {
      void (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.()?.catch?.(() => {})
    } catch {
      // sin soporte de Badging API
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
