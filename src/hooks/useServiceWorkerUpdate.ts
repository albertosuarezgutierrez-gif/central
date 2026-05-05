'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const waitingRef = useRef<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const handleUpdate = (reg: ServiceWorkerRegistration) => {
      if (!reg.waiting) return
      waitingRef.current = reg.waiting
      setUpdateAvailable(true)
    }

    navigator.serviceWorker.ready.then(reg => {
      if (reg.waiting) handleUpdate(reg)
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            waitingRef.current = newSW
            setUpdateAvailable(true)
          }
        })
      })
    })

    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then(reg => reg.update())
    }, 30 * 60 * 1000)
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
