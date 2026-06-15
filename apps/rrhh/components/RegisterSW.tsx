'use client'
import { useEffect } from 'react'

/** Registra el service worker en cliente (PWA). Silencioso si el navegador no lo soporta. */
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
