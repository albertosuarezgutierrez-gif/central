'use client'
import { useEffect, useState } from 'react'

export type Rol = 'super_admin' | 'owner' | 'admin' | 'jefe_sala' | 'camarero' | 'cocina'

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
  admin:       '/hub',
  jefe_sala:   '/jefe',
  camarero:    '/edge',
  cocina:      '/kds',
}

// Acepta string (legacy) o array de roles
export function useAuth(requiredRoles?: Rol | Rol[]) {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem('ia_rest_session')
    if (!raw) {
      setChecking(false)
      window.location.href = '/login'
      return
    }
    try {
      const s: Session = JSON.parse(raw)

      if (requiredRoles) {
        const allowed: Rol[] = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]
        // super_admin siempre pasa
        if (s.rol !== 'super_admin' && !allowed.includes(s.rol)) {
          setChecking(false)
          window.location.href = REDIRECT[s.rol] ?? '/login'
          return
        }
      }

      setSession(s)
      setChecking(false)
    } catch {
      localStorage.removeItem('ia_rest_session')
      setChecking(false)
      window.location.href = '/login'
    }
  }, [])

  const logout = () => {
    localStorage.removeItem('ia_rest_session')
    localStorage.removeItem('ia_rest_restaurante')
    window.location.href = '/login'
  }

  return { session, checking, logout }
}

export function getStoredRestauranteCode(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('ia_rest_restaurante') ?? null
}

export function storeRestauranteCode(code: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem('ia_rest_restaurante', code)
}
