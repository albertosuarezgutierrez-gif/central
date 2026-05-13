'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const waitingRef = useRef<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const handleWaiting = (sw: ServiceWorker) => {
      waitingRef.current = sw
      setUpdateAvailable(true)
    }

    navigator.serviceWorker.ready.then(reg => {
      // Comprobar inmediatamente al entrar a la app
      reg.update()
      if (reg.waiting) handleWaiting(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            handleWaiting(newSW)
          }
        })
      })
    })

    // Recomprobar cada 2 minutos
    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then(reg => reg.update())
    }, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  const applyUpdate = useCallback(() => {
    if (!waitingRef.current) { window.location.reload(); return }
    waitingRef.current.postMessage({ type: 'SKIP_WAITING' })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    }, { once: true })
  }, [])

  return { updateAvailable, applyUpdate }
}
