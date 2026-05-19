// src/hooks/useModulo.ts
// Hook para comprobar si un módulo está activo en el restaurante.
// Por defecto todos los módulos están activos (para no romper instalaciones existentes).
// El dueño puede desactivar módulos desde /owner → Config → Módulos.
//
// Uso: const kdsActivo = useModulo('kds', session.restaurante_id)

import { useState, useEffect } from 'react'

// Caché en memoria para no repetir la misma query en el mismo render
const cacheModulos = new Map<string, string[]>()

export function useModulo(modulo: string, restauranteId: string): boolean {
  const [activo, setActivo] = useState(true) // por defecto activo

  useEffect(() => {
    if (!restauranteId) return

    // Usar caché si ya se cargó
    if (cacheModulos.has(restauranteId)) {
      const modulos = cacheModulos.get(restauranteId)!
      setActivo(modulos.includes(modulo))
      return
    }

    fetch(`/api/owner/modulos?restaurante_id=${restauranteId}`)
      .then(r => r.json())
      .then(d => {
        const modulos: string[] = d.modulos_activos ?? []
        cacheModulos.set(restauranteId, modulos)
        setActivo(modulos.includes(modulo))
      })
      .catch(() => setActivo(true)) // en caso de error, asumir activo
  }, [modulo, restauranteId])

  return activo
}

// Versión síncrona para server components o cuando ya tienes los módulos
export function moduloActivo(modulo: string, modulosActivos: string[]): boolean {
  return modulosActivos.includes(modulo)
}

// Limpiar caché (llamar tras actualizar módulos en /owner)
export function invalidarCacheModulos(restauranteId?: string) {
  if (restauranteId) cacheModulos.delete(restauranteId)
  else cacheModulos.clear()
}
