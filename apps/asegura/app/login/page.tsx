'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudo iniciar sesión')
        return
      }
      router.replace('/dashboard')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 16 }}>
      <form onSubmit={onSubmit} className="card" style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ color: 'var(--brand)' }}>Grupo Asegura</h1>
        <p className="muted" style={{ marginTop: -2 }}>Correduría de seguros</p>
        <div className="grid" style={{ marginTop: 14 }}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="err">{error}</div>}
          <button className="primary" disabled={loading}>
            {loading ? '…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  )
}
