'use client'
import { useEffect, useState } from 'react'

interface Session {
  id: string
  nombre: string
  rol: 'admin' | 'camarero' | 'owner'
}

export function useAuth(requiredRole?: 'admin' | 'camarero' | 'owner') {
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

      if (requiredRole === 'admin' && s.rol !== 'admin') {
        setChecking(false)
        if (s.rol === 'owner') window.location.href = '/owner'
        else window.location.href = '/edge'
        return
      }

      if (requiredRole === 'owner' && s.rol !== 'owner') {
        setChecking(false)
        if (s.rol === 'admin') window.location.href = '/hub'
        else window.location.href = '/edge'
        return
      }

      setSession(s)
      setChecking(false)
    } catch {
      localStorage.removeItem('ia_rest_session')
      setChecking(false)
      window.location.href = '/login'
    }
  }, [])

  return { session, checking }
}
