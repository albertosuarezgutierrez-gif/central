'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Auto-login por "enlace mágico": la limpiadora toca el enlace y entra directa
// a /l, sin teclear PIN ni correo. Ruta exenta en middleware (empieza por /l/).
export default function AccesoLimpiadoraPage() {
  const params = useParams()
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = String(params?.token || '')
    if (!token) { setError('Enlace incompleto'); return }
    let cancel = false
    ;(async () => {
      try {
        const res = await fetch('/api/l/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancel) return
        if (!res.ok) { setError(data.error || 'Enlace de acceso no válido'); return }
        router.replace('/l')
      } catch {
        if (!cancel) setError('Error de conexión')
      }
    })()
    return () => { cancel = true }
  }, [params, router])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      padding: 'clamp(24px, 6vw, 60px) clamp(16px, 4vw, 40px)',
      fontFamily: "'Nunito', -apple-system, sans-serif",
      background: 'linear-gradient(160deg, #eef2ff 0%, #f1f5f9 60%, #e0e7ff 100%)',
      textAlign: 'center',
    }}>
      <LogoIalimp size={28} color="#4f46e5" />
      {error ? (
        <>
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
            padding: '14px 18px', color: '#dc2626', fontSize: 14, fontWeight: 700,
            maxWidth: 360, width: '100%',
          }}>⚠ {error}</div>
          <a href="/l/login" style={{ color: '#4f46e5', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Entrar con mi PIN →
          </a>
        </>
      ) : (
        <div style={{ color: '#64748b', fontSize: 15, fontWeight: 700 }}>Entrando…</div>
      )}
    </div>
  )
}
