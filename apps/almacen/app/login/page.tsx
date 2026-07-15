'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Brand } from '@/app/brand'

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
      router.replace('/materiales')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form onSubmit={onSubmit} className="card login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            JJ
          </span>
          <span className="brand-name" style={{ alignItems: 'center' }}>
            <span className="top">Joaquín Jaén</span>
            <span className="bottom">Almacén</span>
          </span>
        </div>
        <p className="login-sub">Acceso del holding</p>
        <div className="grid" style={{ textAlign: 'left' }}>
          <div className="form-field">
            <label className="field-label">Email</label>
            <input
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="form-field">
            <label className="field-label">Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="badge danger" style={{ padding: '8px 12px' }}>{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  )
}
