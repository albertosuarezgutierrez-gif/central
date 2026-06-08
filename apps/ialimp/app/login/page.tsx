'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al iniciar sesión'); return }
      router.push('/dashboard')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`        .login-root {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(16px, 5vw, 48px);
          font-family: 'Nunito', -apple-system, sans-serif;
          background: linear-gradient(145deg, #eef2ff 0%, #f1f5f9 55%, #e0e7ff 100%);
          position: relative;
          overflow: hidden;
        }
        .login-blob1 {
          position: absolute; pointer-events: none;
          width: min(500px, 80vw); height: min(500px, 80vw);
          background: radial-gradient(circle, rgba(99,102,241,.14) 0%, transparent 70%);
          top: -15%; right: -10%; border-radius: 50%;
        }
        .login-blob2 {
          position: absolute; pointer-events: none;
          width: min(300px, 60vw); height: min(300px, 60vw);
          background: radial-gradient(circle, rgba(139,92,246,.10) 0%, transparent 70%);
          bottom: 5%; left: -8%; border-radius: 50%;
        }
        .login-wrap {
          position: relative; z-index: 1;
          width: 100%; max-width: 420px;
        }
        
        .login-logo span { color: #6366f1; }
        .login-tagline {
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          letter-spacing: .1em;
          text-transform: uppercase;
          margin-bottom: clamp(28px, 5vw, 44px);
        }
        .login-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: clamp(24px, 5vw, 36px);
          box-shadow: 0 10px 40px rgba(79,70,229,.10);
        }
        .login-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: .08em;
          margin-bottom: 7px;
        }
        .login-input {
          width: 100%;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 13px 15px;
          color: #1e1b4b;
          font-family: inherit;
          font-size: 14px;
          outline: none;
          margin-bottom: 18px;
          transition: border-color .15s, background .15s;
        }
        .login-input:focus {
          border-color: #6366f1;
          background: #fff;
        }
        .login-input::placeholder { color: #94a3b8; }
        .login-btn {
          width: 100%;
          background: #4f46e5;
          border: none;
          border-radius: 12px;
          padding: 15px;
          color: white;
          font-family: inherit;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          margin-top: 4px;
          box-shadow: 0 4px 20px rgba(79,70,229,.3);
          transition: all .15s;
          letter-spacing: .01em;
        }
        .login-btn:hover:not(:disabled) {
          background: #3730a3;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(79,70,229,.4);
        }
        .login-btn:disabled { opacity: .55; cursor: not-allowed; }
        .login-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 13px;
          margin-bottom: 14px;
        }
        .login-footer {
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          margin-top: 20px;
        }
        .login-footer a {
          color: #4f46e5;
          font-weight: 700;
          text-decoration: none;
        }
        .login-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="login-root">
        <div className="login-blob1" />
        <div className="login-blob2" />

        <div className="login-wrap">
          <div style={{ textAlign:'center', marginBottom: 4 }}>
            <LogoIalimp size={28} color="#4f46e5" />
          </div>
          <div className="login-tagline">Gestión inteligente de limpiezas</div>

          <div className="login-card">
            <form onSubmit={handleSubmit}>
              <label className="login-label">Email de empresa</label>
              <input
                className="login-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="empresa@ejemplo.com"
                autoComplete="email"
                required
              />
              <label className="login-label">Contraseña</label>
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              {error && <div className="login-error">⚠ {error}</div>}
              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? 'Accediendo...' : 'Acceder al panel →'}
              </button>
            </form>
            <div className="login-footer">
              ¿Sin cuenta?{' '}
              <a href="/register">Registrar empresa</a>
            </div>
          </div>
          <div className="login-footer" style={{ marginTop: 14 }}>
            <a href="/legal/aviso-legal">Aviso legal</a>
            {' · '}
            <a href="/legal/privacidad">Privacidad</a>
            {' · '}
            <a href="/legal/cookies">Cookies</a>
          </div>
        </div>
      </div>
    </>
  )
}
