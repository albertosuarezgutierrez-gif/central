'use client'
import { useEffect, useState } from 'react'

export type Rol = 'super_admin' | 'owner' | 'jefe_sala' | 'camarero' | 'cocina'

export interface Session {
  id: string
  nombre: string
  rol: Rol
  restaurante_id: string
  restaurante_nombre: string
  seccion_id?: string | null
}

const REDIRECT: Record<Rol, string> = {
  super_admin: '/super',
  owner:       '/owner',
  jefe_sala:   '/jefe',
  camarero:    '/edge',
  cocina:      '/kds',
}

// Lee sesión de localStorage de forma síncrona (sin flicker)
function readSession(): Session | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('ia_rest_session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function useAuth(requiredRoles?: Rol | Rol[]) {
  // Inicialización síncrona → elimina el parpadeo blanco inicial
  const [session, setSession] = useState<Session | null>(() => readSession())
  const [checking, setChecking] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return !localStorage.getItem('ia_rest_session')
  })

  useEffect(() => {
    const s = readSession()

    if (!s) {
      window.location.href = '/login'
      return
    }

    if (requiredRoles) {
      const allowed: Rol[] = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]
      if (s.rol !== 'super_admin' && !allowed.includes(s.rol)) {
        window.location.href = REDIRECT[s.rol] ?? '/login'
        return
      }
    }

    setSession(s)
    setChecking(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { session, checking }
}

export function storeRestauranteCode(code: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ia_rest_restaurante', code.toUpperCase())
  }
}
