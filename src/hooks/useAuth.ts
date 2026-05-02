'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Session {
  id: string
  nombre: string
  rol: 'admin' | 'camarero'
}

export function useAuth(requiredRole?: 'admin' | 'camarero') {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const raw = localStorage.getItem('ia_rest_session')
    if (!raw) {
      router.replace('/login')
      return
    }
    try {
      const s: Session = JSON.parse(raw)
      // Camarero trying to access admin page
      if (requiredRole === 'admin' && s.rol !== 'admin') {
        router.replace('/edge')
        return
      }
      setSession(s)
    } catch {
      localStorage.removeItem('ia_rest_session')
      router.replace('/login')
    } finally {
      setChecking(false)
    }
  }, [])

  return { session, checking }
}
