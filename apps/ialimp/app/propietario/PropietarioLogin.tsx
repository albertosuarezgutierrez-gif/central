'use client'
import LogoIalimp from '@/components/LogoIalimp'
import TurnstileWidget from '@/components/TurnstileWidget'
import { useState } from 'react'

type Modo = 'login' | 'recuperar'

export default function PropietarioLogin() {
  const [modo, setModo]         = useState<Modo>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha]   = useState('')
  const [error, setError]       = useState('')
  const [ok, setOk]             = useState('')
  const [loading, setLoading]   = useState(false)

  function cambiar(m: Modo) { setModo(m); setError(''); setOk('') }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setOk('')
    try {
      const res = await fetch('/api/propietario/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstileToken: captcha }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'No se pudo iniciar sesión'); return }
      window.location.href = '/propietario'   // recarga → el servidor pinta el portal
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  async function recuperar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setOk('')
    try {
      const res = await fetch('/api/propietario/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken: captcha }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'No se pudo enviar el correo'); return }
      setOk(data.message || 'Si tu cuenta está activada, te hemos enviado un enlace. Revisa tu bandeja y la carpeta de spam.')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .pl-root {
          min-height: 100dvh; display: flex; align-items: center; justify-content: center;
          padding: clamp(16px, 5vw, 48px); font-family: 'Nunito', -apple-system, sans-serif;
          background: linear-gradient(145deg, #eef2ff 0%, #f1f5f9 55%, #e0e7ff 100%);
          position: relative; overflow: hidden; color: #1e1b4b;
        }
        .pl-blob1 { position:absolute; pointer-events:none; width:min(500px,80vw); height:min(500px,80vw);
          background: radial-gradient(circle, rgba(99,102,241,.14) 0%, transparent 70%); top:-15%; right:-10%; border-radius:50%; }
        .pl-blob2 { position:absolute; pointer-events:none; width:min(300px,60vw); height:min(300px,60vw);
          background: radial-gradient(circle, rgba(139,92,246,.10) 0%, transparent 70%); bottom:5%; left:-8%; border-radius:50%; }
        .pl-wrap { position:relative; z-index:1; width:100%; max-width:420px; }
        .pl-tagline { text-align:center; font-size:11px; color:#94a3b8; letter-spacing:.1em;
          text-transform:uppercase; margin: 6px 0 clamp(22px,5vw,36px); }
        .pl-card { background:#fff; border:1px solid #e2e8f0; border-radius:24px;
          padding: clamp(22px,5vw,34px); box-shadow:0 10px 40px rgba(79,70,229,.10); }
        .pl-title { font-size:18px; font-weight:900; margin:0 0 18px; text-align:center; }
        .pl-label { display:block; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;
          letter-spacing:.08em; margin-bottom:7px; }
        .pl-input { width:100%; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:13px 15px;
          color:#1e1b4b; font-family:inherit; font-size:14px; outline:none; margin-bottom:16px;
          transition:border-color .15s, background .15s; }
        .pl-input:focus { border-color:#6366f1; background:#fff; }
        .pl-input::placeholder { color:#94a3b8; }
        .pl-btn { width:100%; background:#4f46e5; border:none; border-radius:12px; padding:15px; color:#fff;
          font-family:inherit; font-size:15px; font-weight:800; cursor:pointer; margin-top:2px;
          box-shadow:0 4px 20px rgba(79,70,229,.3); transition:all .15s; }
        .pl-btn:hover:not(:disabled) { background:#3730a3; transform:translateY(-1px); }
        .pl-btn:disabled { opacity:.55; cursor:not-allowed; }
        .pl-error { background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:10px 14px;
          color:#dc2626; font-size:13px; margin-bottom:14px; }
        .pl-ok { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px;
          color:#15803d; font-size:13px; line-height:1.5; margin-bottom:14px; }
        .pl-hint { font-size:12px; color:#94a3b8; line-height:1.5; margin-bottom:16px; }
        .pl-link { text-align:center; font-size:12px; color:#94a3b8; margin-top:18px; line-height:1.6; }
        .pl-link a { color:#4f46e5; font-weight:700; text-decoration:none; cursor:pointer; }
        .pl-link a:hover { text-decoration:underline; }
        .pl-foot { text-align:center; font-size:11.5px; color:#94a3b8; margin-top:14px; line-height:1.5;
          border-top:1px solid #eef2ff; padding-top:14px; }
      `}</style>

      <div className="pl-root">
        <div className="pl-blob1" />
        <div className="pl-blob2" />

        <div className="pl-wrap">
          <div style={{ textAlign:'center', marginBottom: 2 }}>
            <LogoIalimp size={28} color="#4f46e5" />
          </div>
          <div className="pl-tagline">Acceso para propietarios</div>

          <div className="pl-card">
            {error && <div className="pl-error">⚠ {error}</div>}
            {ok    && <div className="pl-ok">✅ {ok}</div>}

            {modo === 'login' ? (
              <form onSubmit={entrar}>
                <div className="pl-title">Entra en tu portal</div>
                <label className="pl-label">Tu email</label>
                <input className="pl-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com"
                  autoComplete="email" required />
                <label className="pl-label">Contraseña</label>
                <input className="pl-input" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  autoComplete="current-password" required />
                <TurnstileWidget onToken={setCaptcha} />
                <button className="pl-btn" type="submit" disabled={loading}>
                  {loading ? 'Accediendo…' : 'Entrar →'}
                </button>
                <div className="pl-link">
                  <a onClick={() => cambiar('recuperar')}>¿Olvidaste tu contraseña?</a>
                </div>
                <div className="pl-foot">
                  ¿Aún no tienes acceso? Tu empresa de limpieza te enviará una invitación por email para crear tu contraseña.
                </div>
              </form>
            ) : (
              <form onSubmit={recuperar}>
                <div className="pl-title">Recuperar contraseña</div>
                <p className="pl-hint">
                  Escribe tu email y te enviaremos un enlace para elegir una nueva contraseña.
                  (Solo funciona si tu cuenta ya está activada.)
                </p>
                <label className="pl-label">Tu email</label>
                <input className="pl-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com"
                  autoComplete="email" required />
                <TurnstileWidget onToken={setCaptcha} />
                <button className="pl-btn" type="submit" disabled={loading}>
                  {loading ? 'Enviando…' : 'Enviarme el enlace →'}
                </button>
                <div className="pl-link">
                  <a onClick={() => cambiar('login')}>← Volver a iniciar sesión</a>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
