'use client'
import { useState, useEffect } from 'react'

const C = { bg:'#14110E', e1:'#1F1A15', fg:'#F6F1E7', fg3:'#8D8270', rule:'#2F2820', rS:'#4A3F33', red:'#D9442B' }
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-submit when exactly 4 digits
  useEffect(() => {
    if (pin.length === 4) doLogin(pin)
  }, [pin])

  const doLogin = async (p: string) => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      })
      const d = await r.json()
      if (d.camarero) {
        localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
        const rol = d.camarero.rol
        window.location.href = rol === 'admin' ? '/hub' : rol === 'owner' ? '/owner' : '/edge'
      } else {
        setError('PIN incorrecto')
        setPin('')
        setLoading(false)
      }
    } catch {
      setError('Error de conexión')
      setPin('')
      setLoading(false)
    }
  }

  // Single handler — onPointerDown fires once for both mouse and touch
  const tap = (k: string) => {
    if (loading) return
    if (k === 'del') {
      setPin(p => p.slice(0, -1))
      setError('')
      return
    }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del']

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 24px 48px', userSelect: 'none',
    }}>
      <style>{`
        .pk {
          width: 76px; height: 76px; border-radius: 999px;
          background: #1F1A15; border: 1px solid #2F2820;
          color: #F6F1E7;
          font-family: 'Inter Tight', system-ui, sans-serif;
          font-size: 24px; font-weight: 500;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: background 0.1s, transform 0.08s;
        }
        .pk:active { background: #2A241D; transform: scale(0.9); }
        @media (max-height: 700px) { .pk { width: 64px; height: 64px; font-size: 20px; } }
      `}</style>

      {/* Logo */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, marginBottom:32 }}>
        <svg width="52" height="52" viewBox="0 0 56 56">
          <rect width="56" height="56" rx="8" fill="#1F1A15"/>
          <g transform="translate(11,14)">
            <rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/>
            <rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/>
            <rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/>
            <rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/>
            <rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/>
            <rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/>
          </g>
        </svg>
        <div style={{ fontFamily:SE, fontSize:26, color:C.fg, fontWeight:500 }}>
          ia<span style={{ color:C.red }}>.</span>rest
        </div>
        <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, letterSpacing:'.12em' }}>
          INTRODUCE TU PIN
        </div>
      </div>

      {/* 4 dots */}
      <div style={{ display:'flex', gap:16, marginBottom:6, height:20, alignItems:'center' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 999,
            background: loading ? C.red : i < pin.length ? C.red : C.rS,
            transition: 'background 0.12s, transform 0.1s',
            transform: i < pin.length ? 'scale(1.2)' : 'scale(1)',
          }}/>
        ))}
      </div>

      {/* Error / loading */}
      <div style={{ height:20, marginBottom:20, fontFamily:SN, fontSize:12, color:C.red, textAlign:'center' }}>
        {loading ? '' : error}
      </div>
      {loading && (
        <div style={{ fontFamily:SM, fontSize:11, color:C.red, letterSpacing:'.1em', marginBottom:20 }}>
          VERIFICANDO...
        </div>
      )}

      {/* Keypad — onPointerDown only (no double-fire on mobile) */}
      {!loading && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 76px)', gap:12 }}>
          {keys.map((k, i) => {
            if (k === '') return <div key={i}/>
            return (
              <button
                key={i}
                className="pk"
                onPointerDown={e => { e.preventDefault(); tap(k) }}
                style={k === 'del' ? { fontSize: 18 } : {}}
              >
                {k === 'del' ? '⌫' : k}
              </button>
            )
          })}
        </div>
      )}

      {/* Hint */}
      <div style={{ marginTop:32, fontFamily:SM, fontSize:9, color:'#4A3F33', textAlign:'center', lineHeight:2, letterSpacing:'.08em' }}>
        ADMIN · 0000 &nbsp;|&nbsp; DUEÑO · 2026 &nbsp;|&nbsp; CAMARERO · 1234
      </div>
    </div>
  )
}
