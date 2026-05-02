'use client'
import { useState, useEffect } from 'react'
import { storeRestauranteCode } from '@/hooks/useAuth'

const C = { bg:'#14110E', e1:'#1F1A15', fg:'#F6F1E7', fg3:'#8D8270', rule:'#2F2820', rS:'#4A3F33', red:'#D9442B' }
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

// Detecta restaurante SOLO desde subdominio *.ia.rest o ?r= param
// No intenta parsear dominios de Vercel/localhost
function detectRestauranteCode(): string | null {
  if (typeof window === 'undefined') return null

  // 1. Param ?r=CODIGO o ?restaurante=CODIGO — mayor prioridad
  const params = new URLSearchParams(window.location.search)
  const fromParam = params.get('r') ?? params.get('restaurante')
  if (fromParam) {
    storeRestauranteCode(fromParam.toUpperCase())
    return fromParam.toUpperCase()
  }

  // 2. Subdominio — SOLO para *.ia.rest (producción real)
  const host = window.location.hostname
  if (host.endsWith('.ia.rest') && !host.startsWith('www.')) {
    const slug = host.replace(/\.ia\.rest$/, '')
    if (slug && slug !== 'ia') {
      storeRestauranteCode(slug)
      return slug
    }
  }

  // 3. Guardado previamente de una sesión anterior
  const stored = localStorage.getItem('ia_rest_restaurante')
  if (stored && stored !== 'ia-rest') return stored  // filtrar slugs de Vercel

  return null  // sin código → fallback demo en la API
}

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [restauranteCode, setRestauranteCode] = useState<string | null>(null)
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [codeInput, setCodeInput] = useState('')

  useEffect(() => {
    const code = detectRestauranteCode()
    setRestauranteCode(code)
    // NO mostrar input por defecto — el fallback demo en la API lo cubre
  }, [])

  // Auto-submit al completar 4 dígitos
  useEffect(() => {
    if (pin.length === 4 && !showCodeInput) doLogin(pin)
  }, [pin, showCodeInput])

  const doLogin = async (p: string) => {
    setLoading(true)
    setError('')
    try {
      const body: Record<string, string> = { pin: p }
      if (restauranteCode) body.restaurante_code = restauranteCode
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.camarero) {
        localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
        const rol = d.camarero.rol
        const dest: Record<string, string> = {
          super_admin: '/super', owner: '/owner',
          admin: '/hub', camarero: '/edge', cocina: '/kds'
        }
        window.location.href = dest[rol] ?? '/edge'
      } else {
        setError(d.error ?? 'PIN incorrecto')
        setPin('')
        setLoading(false)
      }
    } catch {
      setError('Error de conexión')
      setPin('')
      setLoading(false)
    }
  }

  const tap = (k: string) => {
    if (loading) return
    if (k === 'del') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  const confirmCode = () => {
    const code = codeInput.trim().toUpperCase()
    if (code.length < 2) return
    storeRestauranteCode(code)
    setRestauranteCode(code)
    setShowCodeInput(false)
    setPin('')
    setError('')
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
        {restauranteCode && (
          <div style={{ fontFamily:SM, fontSize:9, color:C.fg3, letterSpacing:'.1em' }}>
            {restauranteCode}
          </div>
        )}
      </div>

      {showCodeInput ? (
        /* Pantalla de código de restaurante */
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, width:'100%', maxWidth:260 }}>
          <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, letterSpacing:'.12em' }}>
            CÓDIGO DE RESTAURANTE
          </div>
          <input
            autoFocus
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && confirmCode()}
            placeholder="DEMO"
            style={{
              width:'100%', padding:'12px 16px',
              background:C.e1, border:`1px solid ${C.rule}`, borderRadius:4,
              color:C.fg, fontFamily:SM, fontSize:16, letterSpacing:'.08em',
              outline:'none', textAlign:'center',
              WebkitAppearance:'none',
              boxSizing:'border-box',
            }}
          />
          <button
            onPointerDown={confirmCode}
            style={{
              width:'100%', padding:'12px', background:C.red, border:'none',
              borderRadius:4, color:C.fg, fontFamily:SN, fontSize:14,
              fontWeight:600, cursor:'pointer',
            }}
          >
            Continuar
          </button>
          <button
            onPointerDown={() => setShowCodeInput(false)}
            style={{
              background:'none', border:'none', fontFamily:SM,
              fontSize:9, color:C.rS, letterSpacing:'.08em',
              cursor:'pointer', marginTop:4,
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        /* Pantalla PIN normal */
        <>
          <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, letterSpacing:'.12em', marginBottom:20 }}>
            INTRODUCE TU PIN
          </div>

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

          <div style={{ height:20, marginBottom:20, fontFamily:SN, fontSize:12, color:C.red, textAlign:'center' }}>
            {loading ? '' : error}
          </div>
          {loading && (
            <div style={{ fontFamily:SM, fontSize:11, color:C.red, letterSpacing:'.1em', marginBottom:20 }}>
              VERIFICANDO...
            </div>
          )}

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

          <button
            onPointerDown={() => { setShowCodeInput(true); setCodeInput('') }}
            style={{
              marginTop:28, background:'none', border:'none',
              fontFamily:SM, fontSize:9, color:C.rS,
              letterSpacing:'.08em', cursor:'pointer',
              textDecoration:'underline', textDecorationStyle:'dotted',
            }}
          >
            CAMBIAR RESTAURANTE
          </button>

          <div style={{ marginTop:16, fontFamily:SM, fontSize:9, color:'#2F2820', textAlign:'center', lineHeight:2, letterSpacing:'.08em' }}>
            ADMIN · 0000 &nbsp;|&nbsp; OWNER · 2026 &nbsp;|&nbsp; SUPER · 9999
          </div>
        </>
      )}
    </div>
  )
}
