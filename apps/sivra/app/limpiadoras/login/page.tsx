'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LimpiadoarasLogin() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handlePin(digit: string) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    setError('')
    if (newPin.length === 4) {
      setLoading(true)
      const r = await fetch('/api/limpiadoras/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      })
      const d = await r.json()
      if (d.ok) {
        router.push('/limpiadoras')
      } else {
        setError('PIN incorrecto')
        setPin('')
      }
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f1a14', padding: '24px',
    }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🧹</div>
        <div style={{ color: '#BBFF44', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          HouseSevillana
        </div>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 500 }}>Introduce tu PIN</div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{error}</div>}
      </div>

      {/* PIN dots */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 40 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < pin.length ? '#BBFF44' : 'rgba(255,255,255,0.2)',
            transition: 'background 0.15s',
          }} />
        ))}
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: 240 }}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button
            key={i}
            disabled={loading || d === ''}
            onClick={() => d === '⌫' ? setPin(p => p.slice(0,-1)) : handlePin(d)}
            style={{
              height: 64, borderRadius: 12, border: 'none', fontSize: d === '⌫' ? 20 : 24,
              fontWeight: 400, cursor: d === '' ? 'default' : 'pointer',
              background: d === '' ? 'transparent' : 'rgba(255,255,255,0.08)',
              color: d === '⌫' ? '#9898A8' : '#fff',
              transition: 'background 0.1s',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading && d === pin[pin.length-1] ? '···' : d}
          </button>
        ))}
      </div>

      <a href="/login" style={{ marginTop: 24, color: 'rgba(255,255,255,.6)', fontSize: 13, textDecoration: 'underline' }}>
        ¿Eres administrador? Entrar aquí
      </a>
    </div>
  )
}
