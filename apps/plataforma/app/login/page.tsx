'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al iniciar sesión')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px', background: 'var(--surface)',
        borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)', padding: '40px 32px',
      }}>
        {/* Logo placeholder */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '22px', fontWeight: 800, color: 'var(--primary)',
          }}>
            <span style={{
              background: 'var(--primary)', color: '#fff',
              borderRadius: '6px', padding: '2px 8px', fontSize: '18px',
            }}>ia</span>
            <span style={{ color: 'var(--text)' }}>plataforma</span>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '8px', fontSize: '14px' }}>
            Cuadro de mando consolidado
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" autoFocus
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '15px', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Contraseña
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '15px', outline: 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#dc2626', fontSize: '14px', background: '#fef2f2', padding: '10px 12px', borderRadius: '8px' }}>
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              background: 'var(--primary)', color: '#fff', padding: '11px',
              borderRadius: '8px', fontSize: '15px', fontWeight: 600,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
