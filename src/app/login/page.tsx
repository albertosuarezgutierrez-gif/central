'use client'
import { SE, SN, SM } from '@/lib/colors'
import { useState, useEffect, useRef, useCallback } from 'react'
import { storeRestauranteCode } from '@/hooks/useAuth'
import FicharEntradaModal from '@/components/FicharEntradaModal'

const C = { bg:'#F6F1E7', e1:'#FBF8F1', e2:'#EFE7D6', fg:'#1A1714', fg3:'#6B5F52', rule:'#D8CDB6', rS:'#B8A98B', red:'#D9442B', teal:'#2B6A6E', green:'#3F7D44' }

function detectRestauranteCode(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  // ?t= token personalizado — se resuelve async en useEffect
  if (params.get('t')) return null
  const fromParam = params.get('r') ?? params.get('restaurante')
  if (fromParam) { storeRestauranteCode(fromParam.toUpperCase()); return fromParam.toUpperCase() }
  const host = window.location.hostname
  if (host.endsWith('.ia.rest') && !host.startsWith('www.')) {
    const slug = host.replace(/\.ia\.rest$/, '')
    if (slug && slug !== 'ia') { storeRestauranteCode(slug); return slug }
  }
  const stored = localStorage.getItem('ia_rest_restaurante')
  if (stored && stored !== 'ia-rest') return stored
  return null
}

function navigateByRol(camarero: { rol: string; seccion_id?: string | null }) {
  const dest: Record<string, string> = {
    super_admin: '/super', owner: '/owner', admin: '/hub',
    jefe_sala: '/jefe',
    camarero: '/edge', cocina: camarero.seccion_id ? `/kds?seccion=${camarero.seccion_id}` : '/kds',
    running: '/running'
  }
  window.location.href = dest[camarero.rol] ?? '/edge'
}

interface VozSugerencia { id: string; nombre: string; rol: string; seccion_id?: string | null }

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [restauranteCode, setRestauranteCode] = useState<string | null>(null)
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [vozMode, setVozMode] = useState<'idle'|'grabando'|'procesando'|'seleccion'|'exito'|'error'>('idle')
  const [vozTexto, setVozTexto] = useState('')
  const [vozSugerencias, setVozSugerencias] = useState<VozSugerencia[]>([])
  const [vozRestauranteId, setVozRestauranteId] = useState('')
  const [vozRestauranteNombre, setVozRestauranteNombre] = useState('')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  // Multi-cuenta: selector de restaurante
  const [cuentaSelector, setCuentaSelector] = useState<null | {
    cuenta: { id: string; nombre: string }
    restaurantes: { id: string; nombre: string; ciudad?: string; plan: string; plan_status: string }[]
  }>(null)
  const [selectedRestaurante, setSelectedRestaurante] = useState('')
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [tokenLocked, setTokenLocked] = useState(false) // llegó por ?t= → no puede cambiar restaurante
  const [tokenError, setTokenError] = useState('')
  // Modal de fichaje de entrada
  const [fichajeSession, setFichajeSession] = useState<{ id: string; restaurante_id: string; nombre: string; rol: string } | null>(null)

  useEffect(() => {
    setRestauranteCode(detectRestauranteCode())
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') setCheckoutSuccess(true)
    // Resolver token personalizado ?t=
    const token = params.get('t')
    if (token) {
      setLoading(true)
      fetch(`/api/login/token?t=${encodeURIComponent(token)}`)
        .then(r => r.json())
        .then(d => {
          if (d.codigo_acceso) {
            storeRestauranteCode(d.codigo_acceso)
            setRestauranteCode(d.codigo_acceso)
            setTokenLocked(true)
          } else {
            setTokenError(d.error ?? 'Enlace no válido')
          }
          setLoading(false)
        })
        .catch(() => { setTokenError('Error de red'); setLoading(false) })
    }
  }, [])
  useEffect(() => { if (pin.length === 4 && !showCodeInput) doLogin(pin) }, [pin, showCodeInput])

  const doLogin = async (p: string) => {
    setLoading(true); setError('')
    try {
      // 1. Intentar login por PIN de cuenta (multi-restaurante)
      const rCuenta = await fetch('/api/auth/pin-cuenta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p })
      })
      if (rCuenta.ok) {
        const dCuenta = await rCuenta.json()
        if (dCuenta.tipo === 'directo') {
          // Solo 1 restaurante → ir directo
          localStorage.setItem('ia_rest_session', JSON.stringify(dCuenta.session))
          navigateByRol({ rol: 'owner' })
          return
        }
        if (dCuenta.tipo === 'selector') {
          // Múltiples restaurantes → mostrar selector
          setCuentaSelector({ cuenta: dCuenta.cuenta, restaurantes: dCuenta.restaurantes })
          setLoading(false)
          return
        }
      }

      // 2. Fallback: login estándar por PIN de camarero (sistema actual)
      const body: Record<string, string> = { pin: p }
      if (restauranteCode) body.restaurante_code = restauranteCode
      const r = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      const d = await r.json()
      if (d.camarero) {
        localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
        // Usar returnUrl si viene del hook useAuth — solo roles sin modal de fichaje
        const params = new URLSearchParams(window.location.search)
        const returnUrl = params.get('return')
        const rolesSinFichaje = ['owner', 'super_admin']
        if (returnUrl && rolesSinFichaje.includes(d.camarero.rol)) {
          window.location.href = decodeURIComponent(returnUrl)
          return
        }
        // Owner nuevo → guía de onboarding
        if (d.camarero.rol === 'owner' && d.camarero.onboarding_completado !== true) {
          window.location.href = '/onboarding'
        } else if (['camarero','cocina','jefe_sala','running'].includes(d.camarero.rol)) {
          // Roles de trabajo → mostrar modal de fichaje antes de entrar
          setFichajeSession(d.camarero)
          setLoading(false)
        } else {
          navigateByRol(d.camarero)
        }
      } else { setError(d.error ?? 'PIN incorrecto'); setPin(''); setLoading(false) }
    } catch { setError('Error de conexion'); setPin(''); setLoading(false) }
  }

  const elegirRestaurante = async () => {
    if (!cuentaSelector || !selectedRestaurante) return
    setLoading(true)
    try {
      const r = await fetch('/api/auth/seleccionar-restaurante', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuentaSelector.cuenta.id, restaurante_id: selectedRestaurante })
      })
      const d = await r.json()
      if (d.session) {
        localStorage.setItem('ia_rest_session', JSON.stringify(d.session))
        navigateByRol({ rol: 'owner' })
      } else { setError('Error al seleccionar restaurante'); setLoading(false) }
    } catch { setError('Error de conexion'); setLoading(false) }
  }

  const tap = (k: string) => {
    if (loading || vozMode !== 'idle') return
    if (k === 'del') { setPin(p => p.slice(0,-1)); setError(''); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  const confirmCode = () => {
    const code = codeInput.trim().toUpperCase()
    if (code.length < 2) return
    storeRestauranteCode(code); setRestauranteCode(code)
    setShowCodeInput(false); setPin(''); setError('')
  }

  const startVoz = useCallback(async () => {
    if (vozMode !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true } })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType:'audio/webm;codecs=opus' })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(100)
      mediaRef.current = mr
      recordingRef.current = true
      setVozMode('grabando')
      if (navigator.vibrate) navigator.vibrate(50)
    } catch { setError('Sin acceso al microfono') }
  }, [vozMode])

  const stopVoz = useCallback(async () => {
    if (!recordingRef.current || !mediaRef.current) return
    recordingRef.current = false
    setVozMode('procesando')
    const mr = mediaRef.current
    await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop() })
    mr.stream.getTracks().forEach(t => t.stop())
    if (!chunksRef.current.length) { setVozMode('idle'); return }
    const blob = new Blob(chunksRef.current, { type:'audio/webm' })
    const fd = new FormData()
    fd.append('audio', blob, 'audio.webm')
    if (restauranteCode) fd.append('restaurante_code', restauranteCode)
    try {
      const r = await fetch('/api/auth/voz', { method:'POST', body:fd })
      const d = await r.json()
      setVozTexto(d.texto ?? '')
      if (d.identificado && d.camarero) {
        localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
        setVozMode('exito')
        if (navigator.vibrate) navigator.vibrate([30,50,30])
        setTimeout(() => navigateByRol(d.camarero), 900)
      } else if (d.sugerencias?.length) {
        setVozSugerencias(d.sugerencias)
        setVozRestauranteId(d.restaurante_id ?? '')
        setVozRestauranteNombre(d.restaurante_nombre ?? '')
        setVozMode('seleccion')
      } else {
        setError(d.error ?? 'No se identifico ningun camarero')
        setVozMode('error')
      }
    } catch { setError('Error de red'); setVozMode('error') }
  }, [restauranteCode])

  const seleccionarCamarero = (c: VozSugerencia) => {
    const session = { id:c.id, nombre:c.nombre, rol:c.rol, seccion_id:c.seccion_id ?? null, restaurante_id:vozRestauranteId, restaurante_nombre:vozRestauranteNombre }
    localStorage.setItem('ia_rest_session', JSON.stringify(session))
    navigateByRol(c)
  }

  const resetVoz = () => { setVozMode('idle'); setVozTexto(''); setVozSugerencias([]); setError('') }
  const keys = ['1','2','3','4','5','6','7','8','9','','0','del']

  // Pantalla de error si el token no es válido
  if (tokenError) {
    return (
      <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, gap:16 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <div style={{ fontFamily:SE, fontSize:18, color:C.fg }}>Enlace no válido</div>
        <div style={{ fontFamily:SM, fontSize:11, color:C.fg3, textAlign:'center', maxWidth:260 }}>{tokenError}.<br/>Solicita un enlace actualizado al propietario del restaurante.</div>
      </div>
    )
  }

  return (
    <>
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 24px 48px', userSelect:'none' }}>
      {/* Banner bienvenida post-checkout */}
      {checkoutSuccess && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:100, background:'#D4E4D2', border:'1px solid #3F7D44', borderRadius:12, padding:'12px 20px', display:'flex', alignItems:'center', gap:10, boxShadow:'rgba(63,125,68,0.15) 0px 4px 24px', maxWidth:'90vw' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3F7D44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
          <div style={{ fontFamily:SN, fontSize:13, color:'#a8d4ab', lineHeight:1.4 }}>
            <strong style={{ color:'#c8e6c9' }}>¡Cuenta activada!</strong><br/>
            <span style={{ fontSize:12, opacity:.85 }}>Introduce tu PIN de propietario para entrar.</span>
          </div>
        </div>
      )}
      <style>{`
        .pk{width:76px;height:76px;border-radius:999px;background:#FBF8F1;border:none;box-shadow:rgba(184,169,139,0.5) 0px 0px 0px 1px, rgba(184,169,139,0.15) 0px 2px 8px;color:#1A1714;font-family:'Inter Tight',system-ui,sans-serif;font-size:24px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background .1s,transform .08s;}
        .pk:active{background:#EFE7D6;transform:scale(.9);}
        @media(max-height:700px){.pk{width:64px;height:64px;font-size:20px}}
        @media(max-height:600px){.pk{width:56px;height:56px;font-size:18px}}
        @media(max-width:360px){.pk{width:68px;height:68px;font-size:22px}}
        input{font-size:16px!important}
        @keyframes pulse{50%{opacity:.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .cam-btn{width:100%;max-width:260px;padding:14px 16px;background:#FBF8F1;border:none;box-shadow:rgba(184,169,139,0.5) 0px 0px 0px 1px;border-radius:12px;color:#1A1714;font-family:'Inter Tight',system-ui,sans-serif;font-size:15px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;transition:background .1s;-webkit-tap-highlight-color:transparent;}
        .cam-btn:active{background:#EFE7D6;}
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, marginBottom:28 }}>
        <svg width="52" height="52" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1A1714"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
        <div style={{ fontFamily:SE, fontSize:26, color:C.fg, fontWeight:500 }}>ia<span style={{color:C.red}}>.</span>rest</div>
        {restauranteCode && <div style={{ fontFamily:SM, fontSize:9, color:C.fg3, letterSpacing:'.1em' }}>{restauranteCode}</div>}
      </div>

      {showCodeInput ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, width:'100%', maxWidth:260 }}>
          <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, letterSpacing:'.12em' }}>CODIGO DE RESTAURANTE</div>
          <input autoFocus value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&confirmCode()} placeholder="DEMO"
            style={{ width:'100%', padding:'12px 16px', background:C.e1, border:`1px solid ${C.rule}`, borderRadius:4, color:C.fg, fontFamily:SM, fontSize:16, letterSpacing:'.08em', outline:'none', textAlign:'center', boxSizing:'border-box' }}/>
          <button onPointerDown={confirmCode} style={{ width:'100%', padding:'12px', background:C.red, border:'none', borderRadius:4, color:C.fg, fontFamily:SN, fontSize:14, fontWeight:600, cursor:'pointer' }}>Continuar</button>
          <button onPointerDown={()=>setShowCodeInput(false)} style={{ background:'none', border:'none', fontFamily:SM, fontSize:9, color:C.rS, letterSpacing:'.08em', cursor:'pointer' }}>Cancelar</button>
        </div>

      ) : cuentaSelector ? (
        /* ─── Selector de restaurante multi-cuenta ─── */
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, width:'100%', maxWidth:320, animation:'fadeIn .3s ease' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, letterSpacing:'.12em', marginBottom:6 }}>SELECCIONA UN LOCAL</div>
            <div style={{ fontFamily:SE, fontSize:16, color:C.fg, fontStyle:'italic' }}>{cuentaSelector.cuenta.nombre}</div>
          </div>
          <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:8 }}>
            {cuentaSelector.restaurantes.map(r => (
              <button key={r.id}
                onPointerDown={() => setSelectedRestaurante(r.id)}
                style={{
                  width:'100%', padding:'14px 16px',
                  background: selectedRestaurante === r.id ? C.red : C.e1,
                  border: `1px solid ${selectedRestaurante === r.id ? C.red : C.rule}`,
                  borderRadius:9999, color:C.fg,
                  fontFamily:SN, fontSize:14, fontWeight:600,
                  cursor:'pointer', textAlign:'left',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  transition:'all .15s',
                }}>
                <span>{r.nombre}</span>
                <span style={{ fontFamily:SM, fontSize:10, color: selectedRestaurante === r.id ? 'rgba(255,255,255,.7)' : C.fg3 }}>{r.ciudad || r.plan}</span>
              </button>
            ))}
          </div>
          <button onPointerDown={elegirRestaurante}
            disabled={!selectedRestaurante || loading}
            style={{ width:'100%', padding:'14px', background:selectedRestaurante?C.red:C.e2, border:'none', borderRadius:9999, color:C.fg, fontFamily:SN, fontSize:15, fontWeight:700, cursor:selectedRestaurante?'pointer':'not-allowed', opacity:loading?0.6:1 }}>
            {loading ? 'Entrando...' : 'Entrar →'}
          </button>
          <button onPointerDown={() => { setCuentaSelector(null); setPin(''); setSelectedRestaurante('') }}
            style={{ background:'none', border:'none', fontFamily:SM, fontSize:9, color:C.rS, letterSpacing:'.08em', cursor:'pointer' }}>
            Volver
          </button>
        </div>

      ) : vozMode === 'seleccion' ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, width:'100%', maxWidth:280, animation:'fadeIn .3s ease' }}>
          <div style={{ fontFamily:SM, fontSize:9, color:C.fg3, letterSpacing:'.1em', textAlign:'center', marginBottom:4 }}>
            "{vozTexto}"<br/>Confirma quién eres:
          </div>
          {vozSugerencias.map(c => (
            <button key={c.id} className="cam-btn" onPointerDown={()=>seleccionarCamarero(c)}>
              <div style={{ width:32, height:32, borderRadius:999, background:C.rS, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:SN, fontSize:14, fontWeight:700, color:C.fg, flexShrink:0 }}>{c.nombre.charAt(0).toUpperCase()}</div>
              <div>
                <div style={{ fontFamily:SN, fontSize:14, fontWeight:600, color:C.fg }}>{c.nombre}</div>
                <div style={{ fontFamily:SM, fontSize:9, color:C.fg3, letterSpacing:'.06em', textTransform:'uppercase', marginTop:2 }}>{c.rol}</div>
              </div>
            </button>
          ))}
          <button onPointerDown={resetVoz} style={{ background:'none', border:'none', fontFamily:SM, fontSize:9, color:C.rS, letterSpacing:'.08em', cursor:'pointer', marginTop:8 }}>VOLVER AL PIN</button>
        </div>

      ) : vozMode === 'exito' ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, animation:'fadeIn .3s ease' }}>
          <div style={{ width:56, height:56, borderRadius:999, background:'rgba(63,125,68,.15)', border:`2px solid ${C.green}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
          </div>
          <div style={{ fontFamily:SE, fontSize:20, color:C.fg }}>Identificado.</div>
          <div style={{ fontFamily:SM, fontSize:10, color:C.fg3 }}>{vozTexto}</div>
        </div>

      ) : vozMode === 'error' ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, animation:'fadeIn .3s ease' }}>
          <div style={{ fontFamily:SM, fontSize:12, color:C.red, textAlign:'center', maxWidth:240 }}>{error || 'No se identifico'}</div>
          {vozTexto && <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, textAlign:'center', maxWidth:240 }}>"{vozTexto}"</div>}
          <button onPointerDown={resetVoz} style={{ background:'none', border:`1px solid ${C.rS}`, padding:'10px 20px', borderRadius:4, fontFamily:SN, fontSize:13, fontWeight:600, color:C.fg3, cursor:'pointer' }}>Volver</button>
        </div>

      ) : (
        <>
          {(vozMode === 'grabando' || vozMode === 'procesando') && (
            <div style={{ marginBottom:20, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ fontFamily:SM, fontSize:10, color: vozMode === 'grabando' ? C.teal : C.fg3, letterSpacing:'.1em', display:'flex', gap:6, alignItems:'center', animation:'pulse 1.2s ease-in-out infinite' }}>
                <span style={{ width:6, height:6, borderRadius:999, background: vozMode === 'grabando' ? C.teal : C.fg3 }}/>
                {vozMode === 'grabando' ? 'ESCUCHANDO — SUELTA PARA IDENTIFICAR' : 'IDENTIFICANDO...'}
              </div>
            </div>
          )}
          {vozMode === 'idle' && (
            <>
              <div style={{ fontFamily:SM, fontSize:10, color:C.fg3, letterSpacing:'.12em', marginBottom:20 }}>INTRODUCE TU PIN</div>
              <div style={{ display:'flex', gap:16, marginBottom:6, height:20, alignItems:'center' }}>
                {[0,1,2,3].map(i => (<div key={i} style={{ width:14, height:14, borderRadius:999, background: loading ? C.red : i < pin.length ? C.red : C.rS, transition:'background .12s, transform .1s', transform: i < pin.length ? 'scale(1.2)' : 'scale(1)' }}/>))}
              </div>
              <div style={{ height:20, marginBottom:20, fontFamily:SN, fontSize:12, color:C.red, textAlign:'center' }}>{loading ? '' : error}</div>
              {loading && <div style={{ fontFamily:SM, fontSize:11, color:C.red, letterSpacing:'.1em', marginBottom:20 }}>VERIFICANDO...</div>}
            </>
          )}
          {!loading && vozMode === 'idle' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 76px)', gap:12 }}>
              {keys.map((k, i) => {
                if (k === '') return <div key={i}/>
                return (<button key={i} className="pk" onPointerDown={e=>{e.preventDefault();tap(k)}} style={k==='del'?{fontSize:18}:{}}>{k==='del'?'⌫':k}</button>)
              })}
            </div>
          )}

          {!loading && (
            <button
              onPointerDown={e=>{e.preventDefault(); if(vozMode==='idle')startVoz(); else if(vozMode==='grabando')stopVoz()}}
              onPointerUp={e=>{e.preventDefault(); if(vozMode==='grabando')stopVoz()}}
              onPointerLeave={e=>{e.preventDefault(); if(vozMode==='grabando')stopVoz()}}
              style={{ marginTop: vozMode==='idle'?20:0, width: vozMode==='grabando'?80:56, height: vozMode==='grabando'?80:56, borderRadius:999, background: vozMode==='grabando'?C.teal:C.e1, border:`2px solid ${vozMode==='grabando'?C.teal:C.rS}`, color:C.fg, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: vozMode==='grabando'?'0 0 0 12px rgba(43,106,110,.2),0 0 0 24px rgba(43,106,110,.08)':'none', touchAction:'none' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3" fill={vozMode==='grabando'?C.fg:'none'}/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
            </button>
          )}
          {vozMode==='idle' && !loading && <div style={{ marginTop:6, fontFamily:SM, fontSize:9, color:C.rS, letterSpacing:'.06em' }}>MANTEN PARA ENTRAR POR VOZ</div>}
          {vozMode==='idle' && (
            <>
              {!tokenLocked && <button onPointerDown={()=>{setShowCodeInput(true);setCodeInput('')}} style={{ marginTop:24, background:'none', border:'none', fontFamily:SM, fontSize:9, color:C.rS, letterSpacing:'.08em', cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted' }}>CAMBIAR RESTAURANTE</button>}
              <a href="/recuperar-pin" style={{ marginTop:8, display:'block', fontFamily:SM, fontSize:9, color:C.rS, letterSpacing:'.08em', textAlign:'center', textDecoration:'underline', textDecorationStyle:'dotted' }}>¿OLVIDASTE TU PIN?</a>

            </>
          )}
        </>
      )}
    </div>

    {/* Modal de fichaje de entrada */}
    {fichajeSession && (
      <FicharEntradaModal
        session={fichajeSession}
        onFichado={(_turnoId) => {
          const s = fichajeSession
          setFichajeSession(null)
          navigateByRol(s)
        }}
        onSaltar={() => {
          const s = fichajeSession
          setFichajeSession(null)
          navigateByRol(s)
        }}
      />
    )}
    </>
  )
}
