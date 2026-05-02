'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

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

type Screen = 'idle' | 'recording' | 'processing' | 'confirm' | 'sent' | 'error'

interface BrainResult {
  mesa:string; tipo:string
  items:{nombre:string;cantidad:number}[]
  confianza:number; raw:string
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
  const [screen, setScreen] = useState<Screen>('idle')
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
  const [screen, setScreen] = useState<Screen>('idle')
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain] = useState<BrainResult|null>(null)
  const [error, setError] = useState('')
  const [latencia, setLatencia] = useState<number|null>(null)

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
        setScreen('confirm')
        if (navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        setError(d.error || 'Error procesando voz')
        setScreen('error')
      }
    } catch {
      setError('Error de red')
      setScreen('error')
    }
  }, [session.id, turnoId])

  // Spacebar PTT
  useEffect(() => {
    const down = (e:KeyboardEvent) => { if(e.code==='Space'&&!e.repeat){e.preventDefault();startRecording()} }
    const up = (e:KeyboardEvent) => { if(e.code==='Space') stopRecording() }
    window.addEventListener('keydown',down)
    window.addEventListener('keyup',up)
    return () => { window.removeEventListener('keydown',down); window.removeEventListener('keyup',up) }
  }, [startRecording,stopRecording])

  const logout = () => {
    fetch('/api/auth', { method:'DELETE' })
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  const reset = () => { setScreen('idle'); setBrain(null); setTranscript(''); setError('') }

  return (
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SN}}>
      <style>{`
        @keyframes pulse{50%{opacity:.3}}
        @keyframes toastUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

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
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{session.nombre.split(' ')[0]}</span>
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
            <div style={{width:64,height:64,borderRadius:999,background:'rgba(63,125,68,.15)',
              display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.gr}`}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 12 10 18 20 6"/>
              </svg>
            </div>
            <div style={{fontFamily:SE,fontSize:22,color:C.fg,fontWeight:500}}>Enviado.</div>
            <div style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{latencia}ms · {brain?.mesa}</div>
            <button onClick={reset}
              style={{marginTop:16,background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,
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
          style={{
            width:180, height:180, borderRadius:999,
            border:`4px solid ${screen==='recording'?C.red:C.rS}`,
            background:screen==='recording'?C.red:C.e1,
            color:C.fg, cursor:'pointer',
            transition:'transform 120ms cubic-bezier(0.34,1.56,0.64,1), background 200ms, border-color 200ms',
            transform:screen==='recording'?'scale(0.95)':'scale(1)',
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
