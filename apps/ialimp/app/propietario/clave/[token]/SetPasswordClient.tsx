'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState } from 'react'

// Requisitos visibles de la contraseña (deben coincidir con validatePasswordStrength)
const reglas = [
  { test: (p: string) => p.length >= 8,        label: 'Al menos 8 caracteres' },
  { test: (p: string) => /[A-Z]/.test(p),      label: 'Una mayúscula' },
  { test: (p: string) => /[a-z]/.test(p),      label: 'Una minúscula' },
  { test: (p: string) => /[0-9]/.test(p),      label: 'Un número' },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'Un símbolo (! @ # . -)' },
]

export default function SetPasswordClient({ token }: { token: string }) {
  const [pw, setPw]         = useState('')
  const [pw2, setPw2]       = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const todasOk = reglas.every(r => r.test(pw))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!todasOk) { setError('La contraseña no cumple todos los requisitos'); return }
    if (pw !== pw2) { setError('Las dos contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/propietario/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'No se pudo guardar la contraseña'); return }
      window.location.href = '/propietario'   // ya queda con sesión iniciada
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .sp-root { min-height:100dvh; display:flex; align-items:center; justify-content:center;
          padding:clamp(16px,5vw,48px); font-family:'Nunito',-apple-system,sans-serif;
          background:linear-gradient(145deg,#eef2ff 0%,#f1f5f9 55%,#e0e7ff 100%); color:#1e1b4b; }
        .sp-wrap { width:100%; max-width:420px; }
        .sp-card { background:#fff; border:1px solid #e2e8f0; border-radius:24px;
          padding:clamp(22px,5vw,34px); box-shadow:0 10px 40px rgba(79,70,229,.10); }
        .sp-title { font-size:18px; font-weight:900; margin:0 0 4px; }
        .sp-sub { font-size:13px; color:#64748b; margin:0 0 20px; line-height:1.5; }
        .sp-label { display:block; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;
          letter-spacing:.08em; margin-bottom:7px; }
        .sp-input { width:100%; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:13px 15px;
          color:#1e1b4b; font-family:inherit; font-size:14px; outline:none; margin-bottom:16px; }
        .sp-input:focus { border-color:#6366f1; background:#fff; }
        .sp-rules { list-style:none; padding:0; margin:0 0 18px; display:grid; gap:6px; }
        .sp-rules li { font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:8px; }
        .sp-rules li.ok { color:#15803d; }
        .sp-btn { width:100%; background:#4f46e5; border:none; border-radius:12px; padding:15px; color:#fff;
          font-family:inherit; font-size:15px; font-weight:800; cursor:pointer;
          box-shadow:0 4px 20px rgba(79,70,229,.3); transition:all .15s; }
        .sp-btn:hover:not(:disabled) { background:#3730a3; transform:translateY(-1px); }
        .sp-btn:disabled { opacity:.55; cursor:not-allowed; }
        .sp-error { background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:10px 14px;
          color:#dc2626; font-size:13px; margin-bottom:14px; }
      `}</style>

      <div className="sp-root">
        <div className="sp-wrap">
          <div style={{ textAlign:'center', marginBottom: 18 }}>
            <LogoIalimp size={26} color="#4f46e5" />
          </div>
          <div className="sp-card">
            <h1 className="sp-title">Crea tu contraseña</h1>
            <p className="sp-sub">Con ella entrarás a tu portal desde <strong>app.ialimp.es/propietario</strong>.</p>

            {error && <div className="sp-error">⚠ {error}</div>}

            <form onSubmit={guardar}>
              <label className="sp-label">Nueva contraseña</label>
              <input className="sp-input" type="password" value={pw}
                onChange={e => setPw(e.target.value)} placeholder="••••••••"
                autoComplete="new-password" required />

              <ul className="sp-rules">
                {reglas.map((r, i) => (
                  <li key={i} className={r.test(pw) ? 'ok' : ''}>
                    {r.test(pw) ? '✓' : '○'} {r.label}
                  </li>
                ))}
              </ul>

              <label className="sp-label">Repite la contraseña</label>
              <input className="sp-input" type="password" value={pw2}
                onChange={e => setPw2(e.target.value)} placeholder="••••••••"
                autoComplete="new-password" required />

              <button className="sp-btn" type="submit" disabled={loading || !todasOk}>
                {loading ? 'Guardando…' : 'Guardar y entrar →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
