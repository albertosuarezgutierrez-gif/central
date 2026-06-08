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

    // Si el controller cambia externamente (otra pestaña aplicó el update),
    // ocultar el banner — ya no hay nada que actualizar en esta pestaña.
    const onControllerChange = () => {
      waitingRef.current = null
      setUpdateAvailable(false)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

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

    return () => {
      clearInterval(interval)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    // 1. Ocultar el banner inmediatamente — el camarero ve que la acción se procesó
    setUpdateAvailable(false)

    if (!waitingRef.current) {
      window.location.reload()
      return
    }

    // 2. Timeout de seguridad: si controllerchange no dispara en 2s (Android/iOS WebView),
    //    recargar igualmente para no quedar en estado inconsistente.
    const reloadTimer = setTimeout(() => {
      window.location.reload()
    }, 2000)

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      clearTimeout(reloadTimer)
      window.location.reload()
    }, { once: true })

    waitingRef.current.postMessage({ type: 'SKIP_WAITING' })
    waitingRef.current = null
  }, [])

  return { updateAvailable, applyUpdate }
}
