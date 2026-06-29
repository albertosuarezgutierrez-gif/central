'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RLoginPage() {
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length < 4) { setError('El PIN debe tener al menos 4 dígitos'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/r/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'PIN incorrecto'); return }
      router.push('/r')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  function pressDigit(d: string) { if (pin.length < 6) setPin(p => p + d) }
  function backspace() { setPin(p => p.slice(0, -1)) }

  const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <>
      <style>{`
        .rl-root {
          min-height: 100dvh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: clamp(24px,6vw,60px) clamp(16px,4vw,40px);
          font-family: 'Nunito',-apple-system,sans-serif;
          background: linear-gradient(160deg,#f0fdf4 0%,#f1f5f9 60%,#dcfce7 100%);
        }
        .rl-card {
          width:100%; max-width:360px;
          background:white; border-radius:24px;
          padding: clamp(28px,6vw,40px) clamp(24px,6vw,36px);
          box-shadow: 0 8px 40px rgba(0,0,0,.10);
          display:flex; flex-direction:column; align-items:center; gap:24px;
        }
        .rl-dots { display:flex; gap:14px; height:18px; align-items:center; }
        .rl-dot {
          width:14px; height:14px; border-radius:50%;
          background:#e2e8f0; transition:background .15s,transform .15s;
        }
        .rl-dot.filled { background:#16a34a; transform:scale(1.15); }
        .rl-pad { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; width:100%; }
        .rl-key {
          aspect-ratio:1; border-radius:16px;
          background:#f8fafc; border:2px solid #e2e8f0;
          font-size:clamp(20px,5vw,26px); font-weight:700;
          color:#1e293b; cursor:pointer; font-family:inherit;
          display:flex; align-items:center; justify-content:center;
          transition:background .1s,transform .1s; min-height:60px;
          -webkit-tap-highlight-color:transparent;
        }
        .rl-key:active { background:#dcfce7; border-color:#86efac; transform:scale(.94); }
        .rl-key.empty { cursor:default; background:transparent; border-color:transparent; }
        .rl-key.back { color:#64748b; font-size:22px; }
        .rl-btn {
          width:100%; padding:15px; border-radius:14px;
          background:linear-gradient(135deg,#16a34a,#15803d);
          color:white; font-size:16px; font-weight:800;
          border:none; cursor:pointer; font-family:inherit;
          transition:opacity .15s; min-height:52px;
        }
        .rl-btn:disabled { opacity:.5; cursor:not-allowed; }
        .rl-err { color:#dc2626; font-size:13px; font-weight:600; text-align:center; }
      `}</style>
      <div className="rl-root">
        <div className="rl-card">
          <LogoIalimp nombre="" logoUrl={null} size={48} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#15803d' }}>App Repartidor</div>
            <div style={{ fontSize:13, color:'#64748b', marginTop:4 }}>Introduce tu PIN de acceso</div>
          </div>

          <div className="rl-dots">
            {[0,1,2,3,4,5].slice(0,Math.max(4,pin.length)).map(i=>(
              <div key={i} className={`rl-dot${i<pin.length?' filled':''}`} />
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ width:'100%', display:'flex', flexDirection:'column', gap:16 }}>
            <div className="rl-pad">
              {DIGITS.map((d,i) => {
                if (d==='') return <div key={i} className="rl-key empty" />
                if (d==='⌫') return <button key={i} type="button" className="rl-key back" onClick={backspace}>{d}</button>
                return <button key={i} type="button" className="rl-key" onClick={()=>pressDigit(d)}>{d}</button>
              })}
            </div>
            {error && <p className="rl-err">{error}</p>}
            <button type="submit" className="rl-btn" disabled={pin.length<4||loading}>
              {loading ? 'Entrando…' : 'Entrar →'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
