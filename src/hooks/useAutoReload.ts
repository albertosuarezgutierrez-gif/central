'use client'
import { useEffect, useRef } from 'react'

/**
 * Auto-recarga la página cuando el usuario vuelve al tab/app
 * tras haber estado ausente más de `minAwayMs` (defecto: 5 min).
 *
 * Comportamiento:
 * - Registra el momento en que la app pasa a segundo plano (hidden)
 * - Al volver (visible), si han pasado ≥ minAwayMs → window.location.reload()
 * - Si vuelve antes del umbral, no hace nada → sin interrupciones durante servicio
 *
 * Casos cubiertos:
 * - Camarero bloquea pantalla y vuelve
 * - Camarero cambia a otra app y regresa
 * - Tab en segundo plano en browser desktop
 */
export function useAutoReload(minAwayMs: number = 5 * 60 * 1000) {
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibility = () => {
      if (document.hidden) {
        // App pasa a segundo plano → guardar timestamp
        hiddenAt.current = Date.now()
      } else {
        // App vuelve al frente
        if (hiddenAt.current !== null) {
          const awayMs = Date.now() - hiddenAt.current
          if (awayMs >= minAwayMs) {
            // Ausente suficiente tiempo → recargar para aplicar updates
            window.location.reload()
          }
        }
        hiddenAt.current = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [minAwayMs])
}
