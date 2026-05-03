'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ManualComanda from '@/components/ManualComanda'
import { useProductos86 } from '@/hooks/useRealtime'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { usePushNotifications } from '@/hooks/usePushNotifications'

const C = {
  bg:'#14110E', e1:'#1F1A15', e2:'#2A241D',
  fg:'#F6F1E7', fg2:'#C9BFAA', fg3:'#8D8270',
  rule:'#2F2820', rS:'#4A3F33',
  red:'#D9442B', rD:'#A8311E',
  tl:'#2B6A6E', gr:'#3F7D44',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

type Screen = 'idle' | 'recording' | 'processing' | 'speaking' | 'confirm' | 'sent' | 'error'

interface BrainResult {
  mesa:string; tipo:string
  items:{nombre:string;cantidad:number}[]
  confianza:number; raw:string
}

/** Construye el texto que se leerá en voz alta al camarero */
function buildTTSText(brain: BrainResult): string {
  if (brain.items.length === 0) return `${brain.tipo} para ${brain.mesa}. ¿Confirmamos?`
  const items = brain.items
    .map(it => `${it.cantidad === 1 ? 'una de' : it.cantidad} ${it.nombre}`)
    .join(', ')
  return `${brain.mesa}: ${items}. ¿Confirmamos?`
}

/** Habla el texto y devuelve una promesa que resuelve al terminar */
function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'es-ES'
    utt.rate = 1.05
    utt.pitch = 1
    utt.volume = 1
    // Priorizar voz femenina en español si existe
    const voices = window.speechSynthesis.getVoices()
    const esVoice = voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('female'))
      ?? voices.find(v => v.lang.startsWith('es'))
    if (esVoice) utt.voice = esVoice
    utt.onend = () => resolve()
    utt.onerror = () => resolve()
    window.speechSynthesis.speak(utt)
  })
}

function WaveBars({ active }: { active: boolean }) {
  const heights = [10,22,34,16,38,26,14,30,40,18,28,12,34,20,16,8,24,32,12,20]
  return (
    <div style={{display:'flex',alignItems:'center',gap:3,height:36}}>
      <style>{`@keyframes wv{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}`}</style>
      {heights.map((h,i)=>(
        <div key={i} style={{
          width:3,
          background: i%2 ? C.red : C.fg,
          borderRadius:2,
          height: active ? h : Math.max(3, h*0.15),
          transformOrigin:'center',
          animation: active ? `wv 1.1s ${(i*0.05).toFixed(2)}s ease-in-out infinite` : 'none',
          transition:'height 200ms ease',
        }}/>
      ))}
    </div>
  )
}

export default function EdgePage() {
  const { session, checking } = useAuth()
  const [modoManual, setModoManual] = useState(false)
  const [screen, setScreen] = useState<Screen>('idle')
  // Auto-switch to manual mode on tablet/desktop
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setModoManual(true)
    }
  }, [])
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain] = useState<BrainResult|null>(null)
  const [error, setError] = useState('')
  const [latencia, setLatencia] = useState<number|null>(null)
  const [turnoId, setTurnoId] = useState<string|null>(null)

  const mediaRef = useRef<MediaRecorder|null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  // Loading / auth guard
  if (checking || !session) {
    return <div style={{minHeight:'100dvh',background:C.bg}}/>
  }

  return <EdgeContent session={session} turnoId={turnoId} setTurnoId={setTurnoId} />
}

function EdgeContent({ session, turnoId, setTurnoId }: {
  session: {id:string; nombre:string; rol:string}
  turnoId: string|null
  setTurnoId: (id:string|null) => void
}) {
  const [modoManual, setModoManual] = useState(false)
  const [screen, setScreen] = useState<Screen>('idle')
  // Auto-switch to manual mode on tablet/desktop
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setModoManual(true)
    }
  }, [])
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain] = useState<BrainResult|null>(null)
  const [error, setError] = useState('')
  const [latencia, setLatencia] = useState<number|null>(null)
  const [alert86, setAlert86] = useState<string[]>([])
  const [lastComandaId, setLastComandaId] = useState<string|null>(null)
  // Voice Confirm: el sistema lee la comanda antes de mostrar botones
  const [voiceConfirm, setVoiceConfirm] = useState(true)
  const speakingRef = useRef(false)

  const skipSpeaking = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    speakingRef.current = false
    setScreen('confirm')
  }, [])

  // Al entrar en estado 'speaking' → leer TTS y pasar a 'confirm'
  useEffect(() => {
    if (screen !== 'speaking' || !brain) return
    speakingRef.current = true
    speak(buildTTSText(brain)).then(() => {
      if (speakingRef.current) {
        speakingRef.current = false
        setScreen('confirm')
        if (navigator.vibrate) navigator.vibrate([30, 50, 30])
      }
    })
    return () => { speakingRef.current = false }
  }, [screen, brain])
  const [pedidoCuenta, setPedidoCuenta] = useState<{loading:boolean;error:string;factura:null|{numero_factura:number;importe_total:number;qr_data:string}}>({loading:false,error:'',factura:null})
  const { prompt: installPrompt, install } = useInstallPrompt()
  const { subscribed, subscribe } = usePushNotifications(session.id)

  // Escucha 86 en realtime — muestra banner cuando hay nuevos agotados
  const productos86 = useProductos86(turnoId ?? undefined)
  const prev86Ref = useRef<number>(0)
  useEffect(() => {
    if (productos86.length > prev86Ref.current) {
      const nuevos = productos86.slice(0, productos86.length - prev86Ref.current)
      setAlert86(nuevos.map(p => p.nombre))
      const t = setTimeout(() => setAlert86([]), 8000)
      prev86Ref.current = productos86.length
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos86.length])

  const mediaRef = useRef<MediaRecorder|null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  useEffect(() => {
    fetch('/api/turno')
      .then(r=>r.json())
      .then(d=>{ if(d.turno) setTurnoId(d.turno.id) })
  }, [])

  const startRecording = useCallback(async () => {
    if (screen !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:true, noiseSuppression:true }
      })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType:'audio/webm;codecs=opus' })
      mr.ondataavailable = e => { if(e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(100)
      mediaRef.current = mr
      recordingRef.current = true
      setScreen('recording')
      if (navigator.vibrate) navigator.vibrate(50)
    } catch {
      setError('Sin acceso al micrófono')
      setScreen('error')
    }
  }, [screen])

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || !mediaRef.current) return
    recordingRef.current = false
    setScreen('processing')

    const mr = mediaRef.current
    await new Promise<void>(resolve => {
      mr.onstop = () => resolve()
      mr.stop()
    })
    mr.stream.getTracks().forEach(t=>t.stop())

    if (chunksRef.current.length === 0) { setScreen('idle'); return }

    const blob = new Blob(chunksRef.current, { type:'audio/webm' })
    const fd = new FormData()
    fd.append('audio', blob, 'audio.webm')
    fd.append('camarero_id', session.id)
    fd.append('turno_id', turnoId || 'demo')

    try {
      const r = await fetch('/api/transcribe', { method:'POST', body:fd })
      const d = await r.json()
      if (d.ok) {
        setTranscript(d.texto)
        setBrain(d.brain)
        setLatencia(d.latencia_ms)
        setLastComandaId(d.comanda_id ?? null)
        // Si voiceConfirm activo y speechSynthesis disponible → leer en voz alta
        const hasTTS = typeof window !== 'undefined' && 'speechSynthesis' in window
        setScreen(voiceConfirm && hasTTS ? 'speaking' : 'confirm')
        if (navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        setError(d.code === 'API_KEY_INVALID'
          ? 'API key no configurada — contacta al administrador'
          : d.error || 'Error procesando voz')
        setScreen('error')
      }
    } catch {
      setError('Error de red')
      setScreen('error')
    }
  }, [session.id, turnoId])

  // Spacebar PTT
  useEffect(() => {
    const down = (e:KeyboardEvent) => { if(e.code==='Space'&&!e.repeat&&screen==='idle'){e.preventDefault();startRecording()} }
    const up = (e:KeyboardEvent) => { if(e.code==='Space'&&screen==='recording') stopRecording() }
    window.addEventListener('keydown',down)
    window.addEventListener('keyup',up)
    return () => { window.removeEventListener('keydown',down); window.removeEventListener('keyup',up) }
  }, [startRecording,stopRecording])

  const logout = () => {
    fetch('/api/auth', { method:'DELETE' })
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  const reset = () => {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    speakingRef.current = false
    setScreen('idle'); setBrain(null); setTranscript(''); setError(''); setPedidoCuenta({loading:false,error:'',factura:null})
  }

  const pedirCuenta = async () => {
    if (!lastComandaId) return
    setPedidoCuenta({loading:true,error:'',factura:null})
    try {
      const r = await fetch('/api/factura/cerrar', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
        body: JSON.stringify({ comanda_id: lastComandaId, mesa_label: brain?.mesa ?? 'Mesa' })
      })
      const d = await r.json()
      if (r.ok) {
        setPedidoCuenta({loading:false,error:'',factura: d.factura})
      } else {
        setPedidoCuenta({loading:false,error: d.error ?? 'Error al generar cuenta',factura:null})
      }
    } catch {
      setPedidoCuenta({loading:false,error:'Error de red',factura:null})
    }
  }

  if (modoManual && session) {
    return (
      <ManualComanda
        session={session}
        onSent={() => {}}
        onVoiceMode={() => setModoManual(false)}
      />
    )
  }

  return (
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SN}}>
      <style>{`
        @keyframes pulse{50%{opacity:.3}}
        @keyframes toastUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes alert86{0%{transform:translateY(-100%);opacity:0}15%{transform:translateY(0);opacity:1}85%{transform:translateY(0);opacity:1}100%{transform:translateY(-100%);opacity:0}}
      `}</style>

      {/* BANNER 86 — aparece cuando se agota un producto */}
      {alert86.length > 0 && (
        <div style={{
          position:'fixed',top:0,left:0,right:0,zIndex:100,
          background:'#A8311E',padding:'12px 16px',
          fontFamily:SM,fontSize:13,color:'#F6F1E7',
          display:'flex',alignItems:'center',gap:10,
          animation:'alert86 8s ease forwards',
          borderBottom:'1px solid rgba(255,255,255,.15)',
        }}>
          <span style={{fontWeight:700,letterSpacing:'.1em'}}>86</span>
          <span style={{opacity:.5}}>·</span>
          <span>{alert86.join(' · ')}</span>
          <button onClick={()=>setAlert86([])} style={{marginLeft:'auto',background:'none',border:'none',color:'#F6F1E7',cursor:'pointer',opacity:.6,fontSize:16}}>×</button>
        </div>
      )}

      {/* HEADER */}
      <div style={{padding:'10px 16px 8px',borderBottom:`1px solid ${C.rule}`,background:C.bg,flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <svg width="22" height="22" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
            <span style={{fontFamily:SN,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',
              color:screen==='recording'?C.tl:C.fg3,display:'flex',gap:5,alignItems:'center'}}>
              <span style={{width:6,height:6,borderRadius:999,background:screen==='recording'?C.tl:C.fg3,
                animation:screen==='recording'?'pulse 1.2s ease-in-out infinite':'none'}}/>
              {screen==='recording'?'EAR · escuchando':screen==='processing'?'BRAIN · procesando...':'EAR · en espera'}
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{session.nombre.split(' ')[0]}</span>
            {!subscribed && (
              <button onClick={subscribe} title="Activar notificaciones"
                style={{fontFamily:SN,fontSize:9,fontWeight:700,color:'#E8A33B',background:'transparent',
                  border:'1px solid #E8A33B',borderRadius:3,padding:'3px 7px',cursor:'pointer',letterSpacing:'.06em'}}>
                NOTIF
              </button>
            )}
            {installPrompt && (
              <button onClick={install} title="Añadir a pantalla de inicio"
                style={{fontFamily:SN,fontSize:9,fontWeight:700,color:C.red,background:'transparent',
                  border:`1px solid ${C.red}`,borderRadius:3,padding:'3px 7px',cursor:'pointer',letterSpacing:'.06em'}}>
                INSTALAR
              </button>
            )}
            <button
            onPointerDown={() => setModoManual(m => !m)}
            style={{fontFamily:"'Inter Tight',system-ui,sans-serif",fontSize:10,fontWeight:600,letterSpacing:'.04em',color:modoManual?'#D9442B':'#8D8270',background:'transparent',border:`1px solid ${modoManual?'#D9442B':'#2F2820'}`,borderRadius:3,padding:'3px 8px',cursor:'pointer'}}
          >
            {modoManual ? 'VOZ' : 'MANUAL'}
          </button>
            <button
              onPointerDown={() => setVoiceConfirm(v => !v)}
              title={voiceConfirm ? 'Voice Confirm activo — toca para silenciar' : 'Voice Confirm silenciado'}
              style={{fontFamily:SN,fontSize:10,fontWeight:600,letterSpacing:'.04em',
                color: voiceConfirm ? C.tl : C.fg3,
                background:'transparent',
                border:`1px solid ${voiceConfirm ? C.tl : C.rS}`,
                borderRadius:3,padding:'3px 8px',cursor:'pointer'}}>
              {voiceConfirm ? 'VOX ON' : 'VOX OFF'}
            </button>
          <button onClick={logout}
              style={{fontFamily:SN,fontSize:10,fontWeight:600,color:C.fg3,background:'transparent',
                border:`1px solid ${C.rS}`,borderRadius:3,padding:'3px 8px',cursor:'pointer'}}>
              Salir
            </button>
          </div>
        </div>
        <WaveBars active={screen==='recording'}/>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:'flex',flexDirection:'column',padding:16,gap:16,overflow:'auto'}}>

        {screen==='idle' && (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontFamily:SE,fontSize:20,color:C.fg,textAlign:'center',lineHeight:1.4,maxWidth:260}}>
              Mantén pulsado para hablar.
            </div>
          </div>
        )}

        {screen==='recording' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
            <div style={{fontFamily:SM,fontSize:14,color:C.tl,letterSpacing:'.04em',display:'flex',gap:6,alignItems:'center'}}>
              <span style={{width:6,height:6,borderRadius:999,background:C.tl,animation:'pulse 1.2s ease-in-out infinite'}}/>
              GRABANDO
            </div>
          </div>
        )}

        {screen==='processing' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
            <div style={{fontFamily:SM,fontSize:13,color:C.fg3,animation:'pulse 1.2s ease-in-out infinite'}}>
              Procesando...
            </div>
          </div>
        )}

        {screen==='speaking' && brain && (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:20}}>
            <style>{`@keyframes ripple{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.2);opacity:0}}`}</style>
            {/* Onda sonora animada */}
            <div style={{position:'relative',width:80,height:80,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',width:80,height:80,borderRadius:999,border:`2px solid ${C.tl}`,
                animation:'ripple 1.4s ease-out infinite'}}/>
              <div style={{position:'absolute',width:80,height:80,borderRadius:999,border:`2px solid ${C.tl}`,
                animation:'ripple 1.4s ease-out 0.5s infinite'}}/>
              <div style={{width:48,height:48,borderRadius:999,background:`rgba(43,106,110,.25)`,
                display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.tl}`}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.tl} strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </div>
            </div>
            {/* Comanda en texto */}
            <div style={{textAlign:'center',maxWidth:280}}>
              <div style={{fontFamily:SM,fontSize:10,color:C.tl,letterSpacing:'.12em',marginBottom:10}}>
                VOX · LEYENDO COMANDA
              </div>
              <div style={{fontFamily:SE,fontSize:22,color:C.fg,lineHeight:1.3}}>
                {brain.mesa}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:10}}>
                {brain.items.map((it,i)=>(
                  <div key={i} style={{fontFamily:SN,fontSize:15,color:C.fg2,display:'flex',gap:8,justifyContent:'center'}}>
                    <span style={{fontFamily:SM,color:C.red,fontWeight:700}}>{it.cantidad}×</span>
                    {it.nombre}
                  </div>
                ))}
              </div>
            </div>
            {/* Skip */}
            <button onClick={skipSpeaking}
              style={{marginTop:8,background:'transparent',border:`1px solid ${C.rS}`,
                color:C.fg3,padding:'10px 24px',borderRadius:4,
                fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer',letterSpacing:'.04em'}}>
              Saltar lectura
            </button>
          </div>
        )}

        {screen==='confirm' && brain && (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{background:C.e1,border:`1px solid ${C.rule}`,borderRadius:8,padding:12}}>
              <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'.1em',marginBottom:6}}>
                EAR · {latencia}ms
              </div>
              <div style={{fontFamily:SM,fontSize:13,color:C.fg,lineHeight:1.5}}>
                "{transcript}"
              </div>
            </div>
            <div style={{background:C.e1,border:`1px solid ${C.rS}`,borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontFamily:SE,fontSize:32,color:C.fg,fontWeight:500}}>{brain.mesa}</span>
                <span style={{fontFamily:SN,fontSize:9,fontWeight:700,letterSpacing:'.08em',
                  color:'#E8A33B',textTransform:'uppercase',padding:'3px 8px',
                  background:'rgba(232,163,59,.12)',borderRadius:999}}>
                  {brain.tipo}
                </span>
              </div>
              <div style={{borderTop:`1px solid ${C.rule}`,paddingTop:10,display:'flex',flexDirection:'column',gap:6}}>
                {brain.items.map((it,i)=>(
                  <div key={i} style={{display:'flex',gap:10,fontFamily:SN,fontSize:15,color:C.fg}}>
                    <span style={{fontFamily:SM,fontWeight:700,color:C.red,width:28}}>{it.cantidad}x</span>
                    {it.nombre}
                  </div>
                ))}
                {brain.items.length===0 && (
                  <div style={{fontFamily:SN,fontSize:13,color:C.fg3}}>Sin items</div>
                )}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={reset}
                  style={{flex:1,background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,
                    padding:12,borderRadius:4,fontFamily:SN,fontSize:14,fontWeight:600,cursor:'pointer'}}>
                  Cancelar
                </button>
                <button onClick={()=>setScreen('sent')}
                  style={{flex:2,background:C.red,border:'none',color:C.fg,
                    padding:12,borderRadius:4,fontFamily:SN,fontSize:14,fontWeight:700,cursor:'pointer'}}>
                  Enviar a cocina
                </button>
              </div>
            </div>
          </div>
        )}

        {screen==='sent' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
            {/* Confirmacion envio */}
            <div style={{width:64,height:64,borderRadius:999,background:'rgba(63,125,68,.15)',
              display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.gr}`}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 12 10 18 20 6"/>
              </svg>
            </div>
            <div style={{fontFamily:SE,fontSize:22,color:C.fg,fontWeight:500}}>Enviado.</div>
            <div style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{latencia}ms · {brain?.mesa}</div>

            {/* Pedir cuenta — solo si hay comanda */}
            {lastComandaId && !pedidoCuenta.factura && (
              <button onClick={pedirCuenta} disabled={pedidoCuenta.loading}
                style={{marginTop:8,background:C.e1,border:`1px solid ${C.rS}`,color:C.fg,
                  padding:'12px 24px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,
                  cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
                {pedidoCuenta.loading ? 'Generando...' : 'Pedir cuenta · generar ticket'}
              </button>
            )}

            {/* Error cuenta */}
            {pedidoCuenta.error && (
              <div style={{fontFamily:SM,fontSize:11,color:C.red,textAlign:'center',padding:'0 16px'}}>{pedidoCuenta.error}</div>
            )}

            {/* Factura generada */}
            {pedidoCuenta.factura && (
              <div style={{background:C.e1,border:`1px solid ${C.rS}`,borderRadius:8,padding:16,width:'100%',maxWidth:320,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'.1em'}}>FACTURA VERIFACTU</div>
                <div style={{fontFamily:SM,fontSize:18,color:C.red,fontWeight:700}}>
                  T-{String(pedidoCuenta.factura.numero_factura).padStart(8,'0')}
                </div>
                <div style={{fontFamily:SE,fontSize:24,fontWeight:500,color:C.fg}}>
                  {pedidoCuenta.factura.importe_total.toFixed(2).replace('.',',')} €
                </div>
                <div style={{fontFamily:SM,fontSize:9,color:C.fg3,marginTop:4}}>QR en ticket impreso · verificable en sede AEAT</div>
              </div>
            )}

            <button onClick={reset}
              style={{marginTop:8,background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,
                padding:'12px 24px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>
              Volver
            </button>
          </div>
        )}

        {screen==='error' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
            <div style={{fontFamily:SM,fontSize:14,color:C.red}}>{error}</div>
            <button onClick={reset}
              style={{background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,
                padding:'12px 24px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* PTT BUTTON */}
      <div style={{padding:'12px 24px 32px',display:'flex',flexDirection:'column',
        alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'.1em'}}>
          {screen==='recording'?'SUELTA PARA ENVIAR':'MANTÉN PULSADO'}
        </div>
        <button
          onPointerDown={e=>{e.preventDefault();startRecording()}}
          onPointerUp={e=>{e.preventDefault();stopRecording()}}
          onPointerLeave={e=>{e.preventDefault();if(recordingRef.current)stopRecording()}}
          disabled={screen==='speaking' || screen==='processing'}
          style={{
            width:180, height:180, borderRadius:999,
            border:`4px solid ${screen==='recording'?C.red:screen==='speaking'?C.tl:C.rS}`,
            background:screen==='recording'?C.red:screen==='speaking'?'rgba(43,106,110,.15)':C.e1,
            color:C.fg, cursor: screen==='speaking'||screen==='processing' ? 'default' : 'pointer',
            transition:'transform 120ms cubic-bezier(0.34,1.56,0.64,1), background 200ms, border-color 200ms',
            transform:screen==='recording'?'scale(0.95)':'scale(1)',
            opacity: screen==='speaking'||screen==='processing' ? 0.5 : 1,
            boxShadow:screen==='recording'
              ?'0 0 0 16px rgba(217,68,43,0.15),0 0 0 32px rgba(217,68,43,0.06)'
              :'0 8px 24px rgba(0,0,0,0.5)',
            display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,
            touchAction:'none', userSelect:'none', WebkitUserSelect:'none',
          }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" fill={screen==='recording'?C.fg:'none'}/>
            <path d="M5 11a7 7 0 0 0 14 0"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
          </svg>
          <span style={{fontFamily:SN,fontSize:14,fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase'}}>
            {screen==='recording'?'Hablando':'PTT'}
          </span>
        </button>
      </div>
    </div>
  )
}
