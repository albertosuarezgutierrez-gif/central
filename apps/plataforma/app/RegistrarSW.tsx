'use client'
import { useEffect } from 'react'

/** Registra el service worker (requisito de Chrome para ofrecer instalar). No cachea nada: ver `public/sw.js`. */
export function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
