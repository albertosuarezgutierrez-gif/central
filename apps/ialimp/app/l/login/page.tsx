'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LLoginPage() {
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length < 4) { setError('El PIN debe tener al menos 4 dígitos'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/l/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'PIN incorrecto'); return }
      router.push('/l')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  function pressDigit(d: string) {
    if (pin.length < 6) setPin(p => p + d)
  }
  function backspace() { setPin(p => p.slice(0, -1)) }

  const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <>
      <style>{`
        .ll-root {
          min-height: 100dvh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: clamp(24px, 6vw, 60px) clamp(16px, 4vw, 40px);
          font-family: 'Nunito', -apple-system, sans-serif;
          background: linear-gradient(160deg, #eef2ff 0%, #f1f5f9 60%, #e0e7ff 100%);
          position: relative; overflow: hidden;
        }
        .ll-blob {
          position: absolute; pointer-events: none; border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,.12) 0%, transparent 70%);
          width: min(420px, 90vw); height: min(420px, 90vw);
          top: -15%; right: -15%;
        }
        .ll-wrap {
          position: relative; z-index: 1;
          width: 100%; max-width: 360px;
          display: flex; flex-direction: column; align-items: center;
        }
        
        
        .ll-title {
          font-size: clamp(18px, 5vw, 22px); font-weight: 900;
          color: #1e1b4b; margin-top: 14px;
        }
        .ll-sub {
          font-size: 13px; color: #64748b; font-weight: 600;
          margin-top: 4px;
          margin-bottom: clamp(28px, 6vw, 44px);
        }
        .ll-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: clamp(20px, 5vw, 32px);
          width: 100%;
          box-shadow: 0 10px 40px rgba(79,70,229,.10);
        }
        .ll-label {
          text-align: center;
          font-size: 12px; font-weight: 700;
          color: #64748b;
          text-transform: uppercase; letter-spacing: .1em;
          margin-bottom: 18px;
        }
        /* PIN dots */
        .ll-dots {
          display: flex; justify-content: center; gap: 12px; margin-bottom: 28px;
        }
        .ll-dot {
          width: clamp(14px, 4vw, 18px);
          height: clamp(14px, 4vw, 18px);
          border-radius: 50%;
          border: 2px solid #cbd5e1;
          background: transparent;
          transition: all .15s;
        }
        .ll-dot.filled {
          background: #4f46e5;
          border-color: #4f46e5;
          box-shadow: 0 0 8px rgba(79,70,229,.4);
        }
        /* Teclado */
        .ll-keypad {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: clamp(8px, 2vw, 12px);
          margin-bottom: 16px;
        }
        .ll-key {
          aspect-ratio: 1.4;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #1e1b4b;
          font-family: inherit;
          font-size: clamp(18px, 4.5vw, 22px);
          font-weight: 700;
          cursor: pointer;
          transition: all .12s;
          display: flex; align-items: center; justify-content: center;
        }
        .ll-key:hover:not(:disabled) { background: #eef2ff; }
        .ll-key:active:not(:disabled) { transform: scale(.94); }
        .ll-key.empty { background: transparent; border: none; cursor: default; }
        .ll-key.back { font-size: clamp(16px, 4vw, 20px); }
        .ll-btn {
          width: 100%;
          background: #4f46e5; border: none;
          border-radius: 12px; padding: 14px;
          color: white; font-family: inherit;
          font-size: 15px; font-weight: 800;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(79,70,229,.3);
          transition: all .15s;
        }
        .ll-btn:hover:not(:disabled) { background: #3730a3; transform: translateY(-1px); }
        .ll-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .ll-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px; padding: 10px 14px;
          color: #dc2626; font-size: 13px;
          text-align: center; margin-top: 12px;
        }
        .ll-back-link {
          margin-top: 20px;
          font-size: 12px; color: #94a3b8;
          text-align: center;
        }
        .ll-back-link a {
          color: #4f46e5; font-weight: 700; text-decoration: none;
        }
      `}</style>

      <div className="ll-root">
        <div className="ll-blob" />
        <div className="ll-wrap">
          <LogoIalimp size={28} color="#4f46e5" />
          <div className="ll-title">App de limpiadoras</div>
          <div className="ll-sub">Entra solo con tu PIN</div>

          <div className="ll-card">
            <form onSubmit={handleSubmit}>
              <div className="ll-label">Introduce tu PIN</div>

              {/* Dots */}
              <div className="ll-dots">
                {Array.from({length: 4}).map((_, i) => (
                  <div key={i} className={`ll-dot ${i < pin.length ? 'filled' : ''}`} />
                ))}
              </div>

              {/* Teclado numérico */}
              <div className="ll-keypad">
                {DIGITS.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`ll-key ${d === '' ? 'empty' : d === '⌫' ? 'back' : ''}`}
                    onClick={() => d === '⌫' ? backspace() : d !== '' ? pressDigit(d) : undefined}
                    disabled={d === '' || loading}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button className="ll-btn" type="submit" disabled={loading || pin.length < 4}>
                {loading ? 'Verificando...' : 'Entrar →'}
              </button>
            </form>

            {error && <div className="ll-error">⚠ {error}</div>}

            <div style={{ marginTop: 14, fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
              ¿Primera vez o cambiaste de móvil?<br/>Pide tu <strong style={{ color: '#4f46e5' }}>enlace de acceso</strong> a tu coordinadora.
            </div>
          </div>

          <div className="ll-back-link">
            ¿Eres la empresa? <a href="/login">Acceso admin</a>
          </div>
        </div>
      </div>
    </>
  )
}
