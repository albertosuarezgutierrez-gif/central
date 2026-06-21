'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password }),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al registrarse')
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
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '22px', fontWeight: 800,
          }}>
            <span style={{
              background: 'var(--primary)', color: '#fff',
              borderRadius: '6px', padding: '2px 8px', fontSize: '18px',
            }}>ia</span>
            <span style={{ color: 'var(--text)' }}>plataforma</span>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '8px', fontSize: '14px' }}>
            Crear cuenta nueva
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Nombre</label>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              required autoFocus
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Contraseña <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(mín. 8 caracteres)</span>
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="new-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#dc2626', fontSize: '14px', background: '#fef2f2', padding: '10px 12px', borderRadius: '8px' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--muted)' }}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box',
}
const btnStyle: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', padding: '11px', border: 'none',
  borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
}
