'use client'
import { useEffect } from 'react'

// Guard global de sesión: si CUALQUIER llamada a /api/admin/* responde como
// "sesión cerrada" (401, o cuerpo {error:'No autenticado'} aunque sea 500),
// lleva al usuario a /login en vez de dejar errores confusos por la app
// (como el "este cliente no tiene propiedades" de antes). Parchea window.fetch
// una sola vez. No actúa sobre /api/auth ni sobre la app de limpiadora (/api/l).
export default function SessionGuard() {
  useEffect(() => {
    const w = window as any
    if (w.__ialimpSessionGuard) return
    w.__ialimpSessionGuard = true
    const orig = window.fetch.bind(window)

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await orig(...args)
      try {
        const input = args[0] as any
        const url: string = typeof input === 'string' ? input : (input?.url || '')
        if (!res.ok && url.includes('/api/admin/')) {
          let expirada = res.status === 401
          if (!expirada) {
            // 500 con cuerpo "No autenticado" (rutas aún no migradas a 401)
            try {
              const j = await res.clone().json()
              expirada = j?.error === 'No autenticado'
            } catch { /* respuesta no-JSON: ignorar */ }
          }
          if (expirada && !location.pathname.startsWith('/login')) {
            location.href = '/login'
          }
        }
      } catch { /* nunca romper la petición original */ }
      return res
    }

    return () => { window.fetch = orig; w.__ialimpSessionGuard = false }
  }, [])

  return null
}
