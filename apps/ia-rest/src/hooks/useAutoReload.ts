'use client'
import { useEffect, useRef } from 'react'

/**
 * Auto-recarga la página cuando el usuario vuelve al tab/app
 * tras haber estado ausente más de `minAwayMs`.
 *
 * UMBRAL RECOMENDADO: 30 minutos (no menos).
 * Razón: 5 min es demasiado agresivo — un camarero puede bloquear el móvil
 * mientras atiende a un cliente 6 min y volver con una comanda a medias en memoria.
 * 30 min garantiza que el camarero está fuera de servicio activo.
 *
 * Convive con useServiceWorkerUpdate (banner manual vermilion):
 * - Banner SW → notifica cuando hay versión nueva disponible (controlado por el camarero)
 * - useAutoReload → recarga silenciosa tras pausa larga (cierre, entre turnos, madrugada)
 *
 * Estado seguro: Supabase conserva todo. Solo se pierde estado React local
 * (ej: comanda dictada pero NO enviada aún). Con 30 min esto es imposible mid-service.
 *
 * Casos cubiertos:
 * - Camarero bloquea pantalla entre turnos (>30 min) → recarga al volver ✅
 * - Cierre nocturno → vuelve al día siguiente → versión nueva ✅
 * - Mid-service (bloqueo <30 min) → NO recarga ✅
 */
export function useAutoReload(minAwayMs: number = 30 * 60 * 1000) {
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
      } else {
        if (hiddenAt.current !== null) {
          const awayMs = Date.now() - hiddenAt.current
          if (awayMs >= minAwayMs) {
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
