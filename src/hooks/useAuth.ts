'use client'
import { useEffect, useState } from 'react'
import type { TipoNegocio } from '@/lib/negocio'

export type Rol = 'super_admin' | 'owner' | 'jefe_sala' | 'camarero' | 'cocina' | 'running' | 'coordinador_eventos' | 'tienda'

export interface Session {
  id: string
  nombre: string
  rol: Rol
  restaurante_id: string
  local_id?: string          // canónico (rename expand-contract); = restaurante_id durante la migración
  restaurante_nombre: string
  cuenta_id?: string
  seccion_id?: string | null
  puede_comandar?: boolean
  modulos_gestion?: string[]
  tipo_negocio?: TipoNegocio   // vertical del local (motor de verticales); opcional hasta cablear auth
}

const REDIRECT: Record<Rol, string> = {
  super_admin:          '/super',
  owner:                '/owner',
  jefe_sala:            '/jefe',
  camarero:             '/edge',
  cocina:               '/kds',
  running:              '/running',
  coordinador_eventos:  '/eventos',
  tienda:               '/tienda',
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
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/login?return=${returnUrl}`
      return
    }

    if (requiredRoles) {
      const allowed: Rol[] = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]
      if (allowed.length > 0 && s.rol !== 'super_admin' && !allowed.includes(s.rol)) {
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
