'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ManualComanda from '@/components/ManualComanda'
import { useProductos86, useComandas } from '@/hooks/useRealtime'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAlertas } from '@/hooks/useAlertas'
import AlertaBanner from '@/components/AlertaBanner'

/* ─── PALETA CREMA (light) ──────────────────────────────────── */
const C = {
  bg:   '#F6F1E7',  // crema base
  bg1:  '#FBF8F1',  // crema elevación 1
  bg2:  '#EFE7D6',  // crema elevación 2
  bg3:  '#E5DAC2',  // crema elevación 3
  ink:  '#1A1714',  // tinta principal
  ink2: '#3A332C',  // tinta media
  ink3: '#6B5F52',  // tinta gris
  ink4: '#9A8D7C',  // tinta muy suave
  rule: '#D8CDB6',  // bordes
  verm: '#D9442B',  // vermilion (acento marca)
  vermD:'#A8311E',  // vermilion deep
  vermS:'#F4D8CF',  // vermilion suave (bg)
  amb:  '#E8A33B',  // ámbar
  ambS: '#F7E3B6',  // ámbar suave
  gr:   '#3F7D44',  // verde ok
  grS:  '#D4E4D2',  // verde suave
  teal: '#2B6A6E',  // teal (EAR/VOX)
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

type Screen = 'idle'|'recording'|'processing'|'speaking'|'asking'|'confirm'|'sent'|'error'
type Tab    = 'hablar'|'manual'|'pendientes'|'config'

interface BrainResult {
  mesa: string; tipo: string
  items: { nombre: string; cantidad: number }[]
  confianza: number; raw: string
}
interface ChatMsg {
  id: string; from: 'brain'|'camarero'|'sistema'
  texto: string; ts: Date; tipo?: 'ok'|'error'|'aviso'|'pregunta'
}

function buildTTS(b: BrainResult, a86: string[] = [], aAlerg: {producto:string;alergenos:string[]}[] = []): string {
  const s86 = a86.length ? `Atención, ochenta y seis: ${a86.join(' y ')}. ` : ''
  const sAl = aAlerg.length ? `Alérgeno detectado: ${aAlerg.map(a=>`${a.producto} contiene ${a.alergenos.join(' y ')}`).join('. ')}. ` : ''
  if (!b.items.length) return `${s86}${sAl}${b.tipo} para ${b.mesa}. ¿Confirmamos?`
  return `${s86}${sAl}${b.mesa}: ${b.items.map(it=>`${it.cantidad===1?'una de':it.cantidad} ${it.nombre}`).join(', ')}. ¿Confirmamos?`
}

function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof window==='undefined'||!window.speechSynthesis){resolve();return}
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang='es-ES'; utt.rate=1.05; utt.pitch=1; utt.volume=1
    const v = window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('es')&&v.name.toLowerCase().includes('female'))
           ?? window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('es'))
    if (v) utt.voice = v
    utt.onend=()=>resolve(); utt.onerror=()=>resolve()
    window.speechSynthesis.speak(utt)
  })
}

/* ─── COLORES ESTADO MESA ─────────────────────────────────────── */
const MBORDER: Record<string,string> = {
  libre: C.rule, activa:`${C.gr}66`, marchando:`${C.amb}88`,
  marchar:`${C.amb}88`, aviso:`${C.amb}88`, urgente: C.verm, cuenta:`${C.verm}88`,
}
const MBG: Record<string,string> = {
  libre: C.bg1, activa: C.grS, marchando: C.ambS,
  marchar: C.ambS, aviso: C.ambS, urgente: C.vermS, cuenta: C.vermS,
}
const MCOL: Record<string,string> = {
  libre: C.ink4, activa: C.gr, marchando: C.amb,
  marchar: C.amb, aviso: C.amb, urgente: C.verm, cuenta: C.verm,
}

/* ═══════════════════════════════════════════════════════════════ */
export default function EdgePage() {
  const { session, checking } = useAuth()
  const [turnoId, setTurnoId] = useState<string|null>(null)
  if (checking||!session) return <div style={{minHeight:'100dvh',background:C.bg}}/>
  return <EdgeContent session={session} turnoId={turnoId} setTurnoId={setTurnoId}/>
}

function EdgeContent({ session, turnoId, setTurnoId }:{
  session: {id:string;nombre:string;rol:string}
  turnoId: string|null
  setTurnoId: (id:string|null)=>void
}) {
  const [tab, setTab]     = useState<Tab>('hablar')
  const [screen, setScreen] = useState<Screen>('idle')
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain]           = useState<BrainResult|null>(null)
  const [error, setError]           = useState('')
  const [latencia, setLatencia]     = useState<number|null>(null)
  const [alert86, setAlert86]       = useState<string[]>([])
  const [lastComandaId, setLastComandaId] = useState<string|null>(null)
  const speakingRef = useRef(false)
  const [pendingItems, setPendingItems] = useState<BrainResult['items']>([])
  const [alertas86, setAlertas86]       = useState<string[]>([])
  const [alertasAlerg, setAlertasAlerg] = useState<{producto:string;alergenos:string[]}[]>([])
  const [mostrarAlerg, setMostrarAlerg] = useState(false)
  const [pedidoCuenta, setPedidoCuenta] = useState<{loading:boolean;error:string;factura:null|{numero_factura:number;importe_total:number}}>({loading:false,error:'',factura:null})
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [showPush, setShowPush]     = useState(false)
  const [pushMsg, setPushMsg]       = useState('')
  const [chatMsgs, setChatMsgs]     = useState<ChatMsg[]>([])

  // Config camarero
  const [voiceConfirm, setVoiceConfirm] = useState(true)
  const [alergenosMesa, setAlergenosMesa] = useState<string[]>([])
  const [zonaAsignada, setZonaAsignada]   = useState('salon')
  const [fontBig, setFontBig]             = useState(false)

  const addMsg = useCallback((from:ChatMsg['from'], texto:string, tipo?:ChatMsg['tipo']) => {
    setChatMsgs(prev => [...prev.slice(-4), {id:Date.now().toString(), from, texto, ts:new Date(), tipo}])
  }, [])

  const { prompt: installPrompt, install } = useInstallPrompt()
  const { subscribed, subscribe }          = usePushNotifications(session.id)
  const { alertas, marcarLeida }           = useAlertas(session.id, session.restaurante_id)
  const productos86                        = useProductos86(turnoId??undefined)
  const { comandas }                       = useComandas(turnoId??undefined)
  const prev86 = useRef(0)

  const ultimasComandas = comandas
    .filter(c => c.camarero_id === session.id)
    .slice(-2)

  useEffect(() => {
    if (productos86.length > prev86.current) {
      const nuevos = productos86.slice(0, productos86.length - prev86.current)
      setAlert86(nuevos.map(p=>p.nombre))
      addMsg('sistema', `86 · ${nuevos.map(p=>p.nombre).join(', ')}`, 'aviso')
      setTimeout(() => setAlert86([]), 8000)
      prev86.current = productos86.length
    }
  }, [productos86.length, addMsg])

  useEffect(() => {
    fetch('/api/turno').then(r=>r.json()).then(d => { if (d.turno) setTurnoId(d.turno.id) })
    try {
      const cfg = JSON.parse(localStorage.getItem('ia_cfg')||'{}')
      if (cfg.voiceConfirm !== undefined) setVoiceConfirm(cfg.voiceConfirm)
      if (cfg.zonaAsignada) setZonaAsignada(cfg.zonaAsignada)
      if (cfg.fontBig !== undefined) setFontBig(cfg.fontBig)
    } catch {}
  }, [])

  const saveCfg = useCallback((patch: Record<string,unknown>) => {
    try {
      const cfg = JSON.parse(localStorage.getItem('ia_cfg')||'{}')
      localStorage.setItem('ia_cfg', JSON.stringify({...cfg,...patch}))
    } catch {}
  }, [])

  useEffect(() => {
    if (screen !== 'speaking' || !brain) return
    speakingRef.current = true
    speak(buildTTS(brain, alertas86, alertasAlerg)).then(() => {
      if (speakingRef.current) { speakingRef.current=false; setScreen('confirm'); setSheetOpen(true) }
    })
    return () => { speakingRef.current = false }
  }, [screen, brain]) // eslint-disable-line react-hooks/exhaustive-deps

  const mediaRef    = useRef<MediaRecorder|null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  const startRecording = useCallback(async () => {
    if (screen !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      chunksRef.current = []
      const mr = new MediaRecorder(stream, {mimeType:'audio/webm;codecs=opus'})
      mr.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(100); mediaRef.current=mr; recordingRef.current=true
      setScreen('recording')
      if (navigator.vibrate) navigator.vibrate(50)
    } catch { setError('Sin acceso al micrófono'); setScreen('error') }
  }, [screen])

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || !mediaRef.current) return
    recordingRef.current = false; setScreen('processing')
    const mr = mediaRef.current
    await new Promise<void>(resolve => { mr.onstop=()=>resolve(); mr.stop() })
    mr.stream.getTracks().forEach(t=>t.stop())
    if (!chunksRef.current.length) { setScreen('idle'); return }

    const blob = new Blob(chunksRef.current, {type:'audio/webm'})
    const fd   = new FormData()
    fd.append('audio', blob, 'audio.webm')
    fd.append('camarero_id', session.id)
    fd.append('turno_id', turnoId||'demo')
    if (pendingItems.length > 0) fd.append('pending_items', JSON.stringify(pendingItems))

    try {
      const r = await fetch('/api/transcribe', {method:'POST', body:fd})
      const d = await r.json()
      if (d.ok) {
        setTranscript(d.texto); setBrain(d.brain); setLatencia(d.latencia_ms)
        setLastComandaId(d.comanda_id??null); setAlertas86(d.alertas_86??[]); setAlertasAlerg(d.alertas_alergenos??[])
        addMsg('camarero', d.texto)
        if (!d.comanda_id && d.brain?.mesa && ['T00','M00','','desconocida'].includes(d.brain.mesa)) {
          if (d.brain?.items?.length>0) setPendingItems(d.brain.items)
          addMsg('brain','¿Qué mesa?','pregunta')
          setScreen('asking'); speak('¿Qué mesa?').then(()=>startRecording()); return
        }
        setPendingItems([])
        const bItems: BrainResult['items'] = d.brain?.items||[]
        const msgTxt = `${d.brain?.mesa||'?'}: ${bItems.map((it: BrainResult['items'][0])=>`${it.cantidad}× ${it.nombre}`).join(', ')}`
        addMsg('brain', msgTxt + (d.alertas_86?.length?` · ⚠ 86`:'') + (d.alertas_alergenos?.length?` · ⚠ alérgeno`:''), (d.alertas_86?.length||d.alertas_alergenos?.length)?'aviso':'ok')
        const hasTTS = typeof window!=='undefined' && 'speechSynthesis' in window
        if (voiceConfirm && hasTTS) { setScreen('speaking') }
        else { setScreen('confirm'); setSheetOpen(true) }
        if (navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        const msg = d.code==='API_KEY_INVALID'?'API key no configurada':d.error||'Error procesando voz'
        setError(msg); addMsg('sistema', msg, 'error'); setScreen('error')
      }
    } catch { setError('Error de red'); addMsg('sistema','Sin conexión','error'); setScreen('error') }
  }, [session.id, turnoId, pendingItems, voiceConfirm, startRecording, addMsg])

  useEffect(() => {
    const dn = (e:KeyboardEvent) => { if(e.code==='Space'&&!e.repeat&&screen==='idle'){e.preventDefault();startRecording()} }
    const up = (e:KeyboardEvent) => { if(e.code==='Space'&&screen==='recording') stopRecording() }
    window.addEventListener('keydown',dn); window.addEventListener('keyup',up)
    return () => { window.removeEventListener('keydown',dn); window.removeEventListener('keyup',up) }
  }, [startRecording, stopRecording])

  const logout = () => {
    fetch('/api/auth',{method:'DELETE'}); localStorage.removeItem('ia_rest_session')
    window.location.href='/login'
  }
  const reset = () => {
    if (typeof window!=='undefined') window.speechSynthesis?.cancel()
    speakingRef.current=false; setScreen('idle'); setBrain(null); setTranscript('')
    setError(''); setPedidoCuenta({loading:false,error:'',factura:null})
    setAlertas86([]); setAlertasAlerg([]); setPendingItems([]); setSheetOpen(false)
  }
  const pedirCuenta = async () => {
    if (!lastComandaId) return
    setPedidoCuenta({loading:true,error:'',factura:null})
    try {
      const r = await fetch('/api/factura/cerrar',{method:'POST',headers:{'Content-Type':'application/json','x-ia-session':localStorage.getItem('ia_rest_session')??''},body:JSON.stringify({comanda_id:lastComandaId,mesa_label:brain?.mesa??'Mesa'})})
      const d = await r.json()
      if (r.ok) { setPedidoCuenta({loading:false,error:'',factura:d.factura}); addMsg('sistema',`Factura ${d.factura?.numero_factura} · ${d.factura?.importe_total?.toFixed(2)} €`,'ok') }
      else setPedidoCuenta({loading:false,error:d.error??'Error',factura:null})
    } catch { setPedidoCuenta({loading:false,error:'Error de red',factura:null}) }
  }

  const isListening  = screen==='recording'
  const isProcessing = screen==='processing'||screen==='speaking'

  return (
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SN,position:'relative',fontSize:fontBig?'1.1rem':'1rem',color:C.ink}}>
      <style>{`
        @keyframes ldot{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes hout{0%{transform:scale(1);opacity:.4}100%{transform:scale(2);opacity:0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes sttPulse{from{opacity:.6}to{opacity:1}}
        @keyframes urgPulse{0%,100%{border-color:${C.verm}}50%{border-color:${C.vermD}}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes pushIn{from{transform:translateY(-100%)}to{transform:translateY(0)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes a86{0%{opacity:0;transform:translateY(-100%)}10%{opacity:1;transform:translateY(0)}85%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-100%)}}
      `}</style>

      {/* ALERTAS — banner audio + notificación */}
      <AlertaBanner alertas={alertas} onMarcarLeida={marcarLeida} />

      {/* PUSH */}
      {showPush && (
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:60,background:C.grS,borderBottom:`2px solid ${C.gr}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,animation:'pushIn .3s ease'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:C.gr,flexShrink:0}}/>
          <span style={{fontFamily:SC,fontSize:14,flex:1,color:C.ink}}>{pushMsg}</span>
          <span onClick={()=>setShowPush(false)} style={{fontSize:11,color:C.ink3,cursor:'pointer'}}>✕</span>
        </div>
      )}

      {/* 86 BANNER */}
      {alert86.length>0 && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:C.verm,padding:'10px 16px',fontFamily:SM,fontSize:12,color:'#fff',display:'flex',alignItems:'center',gap:10,animation:'a86 8s ease forwards'}}>
          <span style={{fontWeight:700,letterSpacing:'.1em'}}>86</span><span style={{opacity:.6}}>·</span>
          <span>{alert86.join(' · ')}</span>
          <button onClick={()=>setAlert86([])} style={{marginLeft:'auto',background:'none',border:'none',color:'#fff',cursor:'pointer',fontSize:15}}>×</button>
        </div>
      )}

      {/* OVERLAY */}
      {sheetOpen && (
        <div onClick={()=>{setSheetOpen(false);if(screen==='confirm')reset()}}
          style={{position:'absolute',inset:0,background:'rgba(26,23,20,.35)',zIndex:20,backdropFilter:'blur(2px)'}}/>
      )}

      {/* CONFIRM SHEET */}
      {sheetOpen && brain && (
        <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:30,background:C.bg1,borderTop:`1px solid ${C.rule}`,borderRadius:'20px 20px 0 0',animation:'slideUp .3s ease',boxShadow:'0 -8px 32px rgba(26,23,20,.12)'}}>
          <div style={{width:36,height:3,background:C.rule,borderRadius:2,margin:'10px auto 0'}}/>
          <div style={{padding:'13px 20px 11px',display:'flex',alignItems:'center',gap:10,borderBottom:`1px solid ${C.rule}`}}>
            <span style={{fontFamily:SM,fontSize:8,color:C.amb,background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:4,padding:'2px 6px'}}>BRAIN</span>
            <span style={{fontFamily:SE,fontStyle:'italic',fontSize:18,flex:1,color:C.ink}}>{brain.mesa}</span>
            <span style={{fontFamily:SM,fontSize:10,color:C.gr}}>{Math.round((brain.confianza||.9)*100)}%</span>
          </div>
          {alertas86.length>0 && (
            <div style={{margin:'8px 20px 0',background:C.vermS,border:`1px solid ${C.verm}44`,borderRadius:7,padding:'7px 11px',fontFamily:SM,fontSize:11,color:C.verm,display:'flex',gap:8}}>
              <span style={{fontWeight:700}}>86</span><span>·</span><span>{alertas86.join(' · ')}</span>
            </div>
          )}
          {alertasAlerg.length>0 && (
            <div style={{margin:'6px 20px 0',background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:7,padding:'7px 11px',fontFamily:SM,fontSize:10,color:'#7A5A1A',display:'flex',flexDirection:'column',gap:3}}>
              <span style={{fontWeight:700,fontSize:11}}>ALÉRGENO DETECTADO</span>
              {alertasAlerg.map((a,i)=><span key={i}>{a.producto} contiene: {a.alergenos.join(', ')}</span>)}
            </div>
          )}
          <div style={{padding:'6px 20px',maxHeight:'34vh',overflowY:'auto'}}>
            {brain.items.map((it,i)=>{
              const is86 = alertas86.map(n=>n.toLowerCase()).includes(it.nombre.toLowerCase())
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderBottom:`1px solid ${C.rule}`,opacity:is86?.55:1,textDecoration:is86?'line-through':'none'}}>
                  <span style={{fontFamily:SE,fontStyle:'italic',fontSize:23,color:C.verm,lineHeight:1,minWidth:24,textAlign:'center'}}>{it.cantidad}</span>
                  <span style={{flex:1,fontSize:14,fontWeight:500,color:C.ink}}>{it.nombre}</span>
                  {is86 && <span style={{fontFamily:SM,fontSize:9,fontWeight:700,color:C.verm,padding:'1px 6px',background:C.vermS,borderRadius:3}}>86</span>}
                </div>
              )
            })}
          </div>
          {transcript && (
            <div style={{padding:'7px 20px 10px',borderTop:`1px solid ${C.rule}`,fontFamily:SC,fontSize:14,color:C.teal}}>
              💬 {transcript}
            </div>
          )}
          <div style={{display:'flex',borderTop:`1px solid ${C.rule}`}}>
            <button onClick={reset} style={{flex:1,padding:15,background:'transparent',border:'none',borderRight:`1px solid ${C.rule}`,color:C.ink3,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
            <button onClick={reset} style={{flex:1,padding:15,background:'transparent',border:'none',borderRight:`1px solid ${C.rule}`,color:C.amb,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Editar</button>
            <button onClick={()=>{
              setSheetOpen(false); setScreen('sent')
              addMsg('brain',`✓ Enviado · ${brain.mesa}`,'ok')
              setPushMsg(`🍳 Cocina recibió · ${brain.mesa}`); setShowPush(true); setTimeout(()=>setShowPush(false),4000)
            }} style={{flex:2,padding:15,background:C.verm,border:'none',color:'#fff',fontFamily:SN,fontSize:13,fontWeight:700,cursor:'pointer'}}>
              ✓ Confirmar
            </button>
          </div>
        </div>
      )}

      {/* ALÉRGENOS MODAL */}
      {mostrarAlerg && (
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.7)',zIndex:200,display:'flex',flexDirection:'column',padding:20,gap:12}}>
          <div style={{fontFamily:SM,fontSize:10,color:C.amb,letterSpacing:'.12em',fontWeight:700,textTransform:'uppercase'}}>ALÉRGENOS DE MESA · EU 1169/2011</div>
          <div style={{fontFamily:SN,fontSize:12,color:C.bg,lineHeight:1.4}}>El cliente ha indicado intolerancia / alergia a:</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,flex:1}}>
            {['Gluten','Crustáceos','Huevos','Pescado','Cacahuetes','Soja','Lactosa','Frutos secos','Apio','Mostaza','Sésamo','Sulfitos','Altramuces','Moluscos'].map(al=>{
              const on = alergenosMesa.includes(al)
              return (
                <button key={al} onPointerDown={()=>setAlergenosMesa(p=>on?p.filter(a=>a!==al):[...p,al])}
                  style={{background:on?C.ambS:C.bg1,border:`1px solid ${on?C.amb:C.rule}`,borderRadius:8,padding:'10px 8px',fontFamily:SN,fontSize:13,fontWeight:on?700:400,color:on?'#7A5A1A':C.ink2,cursor:'pointer',textAlign:'left',transition:'all .12s'}}>
                  {al}
                </button>
              )
            })}
          </div>
          <button onPointerDown={()=>setMostrarAlerg(false)}
            style={{background:C.verm,border:'none',color:'#fff',padding:14,borderRadius:10,fontFamily:SN,fontSize:14,fontWeight:700,cursor:'pointer'}}>
            Confirmar — {alergenosMesa.length>0?alergenosMesa.join(', '):'sin alérgenos declarados'}
          </button>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.rule}`,background:C.bg1,flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 1px 0 rgba(26,23,20,.06)'}}>
        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:21,color:C.verm,letterSpacing:'-.4px',lineHeight:1}}>ia.rest</div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {(isListening||isProcessing) && (
            <div style={{display:'flex',alignItems:'center',gap:5,background:isListening?`${C.teal}18`:`${C.amb}22`,border:`1px solid ${isListening?C.teal:C.amb}44`,borderRadius:12,padding:'3px 9px'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:isListening?C.teal:C.amb,animation:'ldot 1s infinite'}}/>
              <span style={{fontFamily:SM,fontSize:9,color:isListening?C.teal:C.amb}}>{isListening?'EAR':'BRAIN'}</span>
            </div>
          )}
          {alergenosMesa.length>0 && (
            <div style={{background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:12,padding:'3px 8px',fontFamily:SM,fontSize:9,color:'#7A5A1A',fontWeight:700}}>
              ⚠ {alergenosMesa.length}
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:5,background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:16,padding:'5px 11px 5px 7px',cursor:'pointer'}} onClick={logout}>
            <div style={{width:6,height:6,borderRadius:'50%',background:C.gr,animation:'ldot 2s infinite'}}/>
            <span style={{fontSize:12,fontWeight:600,color:C.ink}}>{session.nombre.split(' ')[0]}</span>
          </div>
        </div>
      </div>

      {/* ══ TAB: HABLAR ══════════════════════════════════════════ */}
      {tab==='hablar' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* ÚLTIMAS 2 COMANDAS */}
          {ultimasComandas.length>0 && (
            <div style={{padding:'8px 16px 0',display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
              {ultimasComandas.map(c => {
                const mesa   = c.mesa?.codigo || '?'
                const items  = c.items || []
                const resumen = items.slice(0,3).map(it=>`${it.cantidad}× ${it.nombre}`).join(' · ') + (items.length>3?` +${items.length-3}`:'')
                const col    = c.estado==='en_cocina'?C.amb:c.estado==='lista'?C.gr:C.ink4
                const bg     = c.estado==='en_cocina'?C.ambS:c.estado==='lista'?C.grS:C.bg2
                return (
                  <div key={c.id} style={{background:bg,border:`1px solid ${col}44`,borderLeft:`3px solid ${col}`,borderRadius:8,padding:'7px 10px',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{fontFamily:SE,fontStyle:'italic',fontSize:19,fontWeight:600,color:col,lineHeight:1,minWidth:24,textAlign:'center'}}>
                      {mesa.replace(/[^0-9]/g,'')}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,color:C.ink2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{resumen||'—'}</div>
                    </div>
                    <div style={{fontFamily:SM,fontSize:9,color:col,textTransform:'uppercase',flexShrink:0}}>{c.estado==='en_cocina'?'cocina':c.estado}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* CHAT */}
          <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 16px',display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:6}}>
            {chatMsgs.length===0 && screen==='idle' && (
              <div style={{textAlign:'center',padding:'0 20px 20px'}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:19,color:C.ink3,lineHeight:1.4}}>Mantén pulsado y habla.</div>
              </div>
            )}

            {screen==='asking' && (
              <div style={{background:`${C.teal}14`,border:`1px solid ${C.teal}44`,borderRadius:12,padding:'12px 14px',animation:'msgIn .2s ease'}}>
                <div style={{fontFamily:SM,fontSize:8,color:C.teal,letterSpacing:'1px',marginBottom:5,textTransform:'uppercase'}}>BRAIN · pregunta</div>
                <div style={{fontSize:15,fontWeight:600,color:C.ink}}>¿Qué mesa?</div>
                {pendingItems.length>0 && (
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                    {pendingItems.map((it,i) => (
                      <div key={i} style={{display:'flex',gap:8,fontSize:12,color:C.ink2}}>
                        <span style={{fontFamily:SM,color:C.verm,fontWeight:700}}>{it.cantidad}×</span>{it.nombre}
                      </div>
                    ))}
                    <button onClick={reset} style={{marginTop:6,background:'none',border:`1px solid ${C.rule}`,color:C.ink3,borderRadius:6,padding:'4px 10px',fontFamily:SN,fontSize:11,cursor:'pointer',alignSelf:'flex-start'}}>Cancelar</button>
                  </div>
                )}
              </div>
            )}

            {chatMsgs.map(msg => {
              const isCam = msg.from==='camarero'
              const isSis = msg.from==='sistema'
              const bCol  = msg.tipo==='error'?C.verm:msg.tipo==='aviso'?C.amb:msg.tipo==='pregunta'?C.teal:msg.tipo==='ok'?C.gr:C.rule
              const bBg   = msg.tipo==='error'?C.vermS:msg.tipo==='aviso'?C.ambS:msg.tipo==='ok'?C.grS:C.bg2
              return (
                <div key={msg.id} style={{alignSelf:isCam?'flex-end':'flex-start',maxWidth:'88%',background:isCam?C.bg2:bBg,border:`1px solid ${isCam?C.rule:bCol+'55'}`,borderRadius:isCam?'12px 3px 12px 12px':'3px 12px 12px 12px',padding:'8px 12px',animation:'msgIn .2s ease',boxShadow:'0 1px 3px rgba(26,23,20,.06)'}}>
                  {!isCam && (
                    <div style={{fontFamily:SM,fontSize:8,color:isSis?C.ink3:C.teal,letterSpacing:'1px',marginBottom:3,textTransform:'uppercase'}}>
                      {isSis?'sistema':msg.tipo==='pregunta'?'brain · pregunta':'brain'}
                    </div>
                  )}
                  <div style={{fontSize:13,color:msg.tipo==='error'?C.verm:C.ink,lineHeight:1.4,fontFamily:isCam?SC:SN,fontStyle:isCam?'italic':'normal'}}>
                    {msg.texto}
                  </div>
                  <div style={{fontSize:9,color:C.ink4,marginTop:3,textAlign:'right',fontFamily:SM}}>
                    {msg.ts.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              )
            })}

            {screen==='sent' && brain && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'10px 0'}}>
                <div style={{width:48,height:48,borderRadius:'50%',background:C.grS,display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.gr}`}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
                </div>
                {lastComandaId && !pedidoCuenta.factura && (
                  <button onClick={pedirCuenta} disabled={pedidoCuenta.loading}
                    style={{background:C.bg2,border:`1px solid ${C.rule}`,color:C.ink,padding:'9px 18px',borderRadius:8,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    {pedidoCuenta.loading?'Generando…':'Generar cuenta · Verifactu'}
                  </button>
                )}
                {pedidoCuenta.factura && (
                  <div style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,padding:12,textAlign:'center'}}>
                    <div style={{fontFamily:SM,fontSize:8,color:C.ink3,marginBottom:3}}>FACTURA VERIFACTU</div>
                    <div style={{fontFamily:SE,fontSize:22,fontWeight:600,color:C.ink}}>{pedidoCuenta.factura.importe_total.toFixed(2).replace('.',',')} €</div>
                  </div>
                )}
                <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.rule}`,color:C.ink3,padding:'8px 20px',borderRadius:8,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Nueva comanda</button>
              </div>
            )}

            {screen==='error' && (
              <div style={{textAlign:'center',padding:'10px 0'}}>
                <div style={{fontFamily:SM,fontSize:12,color:C.verm,marginBottom:10}}>{error}</div>
                <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.rule}`,color:C.ink3,padding:'8px 18px',borderRadius:8,fontFamily:SN,fontSize:12,cursor:'pointer'}}>Reintentar</button>
              </div>
            )}
          </div>

          {/* PTT */}
          <div style={{padding:'8px 20px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:7,flexShrink:0,borderTop:`1px solid ${C.rule}`,background:C.bg1}}>
            <div style={{position:'relative',width:88,height:88,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid ${isListening?C.verm+'60':'#D9442B22'}`,animation:'hout 2s ease-out infinite'}}/>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid ${isListening?C.verm+'60':'#D9442B22'}`,animation:'hout 2s ease-out .7s infinite'}}/>
              <button
                onPointerDown={e=>{e.preventDefault();startRecording()}}
                onPointerUp={e=>{e.preventDefault();stopRecording()}}
                onPointerLeave={e=>{e.preventDefault();if(recordingRef.current)stopRecording()}}
                disabled={isProcessing}
                style={{width:76,height:76,borderRadius:'50%',
                  background:isListening?C.verm:`linear-gradient(145deg,#E85540,${C.verm})`,
                  border:'none',cursor:isProcessing?'default':'pointer',position:'relative',zIndex:2,
                  boxShadow:isListening?`0 2px 12px ${C.verm}55`:`0 4px 20px ${C.verm}44`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transform:isListening?'scale(.91)':'scale(1)',
                  transition:'all .15s cubic-bezier(.34,1.56,.64,1)',
                  opacity:isProcessing?.5:1,touchAction:'none',userSelect:'none'}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="12" rx="3" fill={isListening?'rgba(255,255,255,.95)':'none'}/>
                  <path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
              </button>
            </div>
            <span style={{fontFamily:SM,fontSize:10,fontWeight:600,color:isListening?C.verm:C.ink3,textTransform:'uppercase',letterSpacing:'1.5px',animation:isListening?'sttPulse .8s infinite alternate':'none'}}>
              {isListening?'escuchando…':isProcessing?'procesando…':'mantén para hablar'}
            </span>
          </div>
        </div>
      )}

      {/* ══ TAB: MANUAL ══════════════════════════════════════════ */}
      {tab==='manual' && (
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <ManualComanda session={session} onSent={()=>{}} onVoiceMode={()=>setTab('hablar')}/>
        </div>
      )}

      {/* ══ TAB: PENDIENTES ══════════════════════════════════════ */}
      {tab==='pendientes' && <PendientesScreen session={session} turnoId={turnoId}/>}

      {/* ══ TAB: CONFIG ══════════════════════════════════════════ */}
      {tab==='config' && (
        <ConfigScreen
          session={session}
          voiceConfirm={voiceConfirm}  onVoiceConfirm={v=>{setVoiceConfirm(v);saveCfg({voiceConfirm:v})}}
          zonaAsignada={zonaAsignada}  onZona={v=>{setZonaAsignada(v);saveCfg({zonaAsignada:v})}}
          fontBig={fontBig}            onFontBig={v=>{setFontBig(v);saveCfg({fontBig:v})}}
          alergenosMesa={alergenosMesa} onAlergenosMesa={()=>setMostrarAlerg(true)}
          subscribed={subscribed}       onSubscribe={subscribe}
          hasInstall={!!installPrompt}  onInstall={install}
          onLogout={logout}
        />
      )}

      {/* ── BOTTOM NAV ─────────────────────────────────────────── */}
      <nav style={{display:'flex',background:C.bg1,borderTop:`1px solid ${C.rule}`,flexShrink:0}}>
        {([
          {id:'hablar',    lbl:'Hablar',   path:'M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v4'},
          {id:'manual',    lbl:'Manual',   path:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7M17.5 14v7'},
          {id:'pendientes',lbl:'Pedidos',  path:'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'},
          {id:'config',    lbl:'Config',   path:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'},
        ] as {id:Tab;lbl:string;path:string}[]).map(t => {
          const on = tab===t.id
          return (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,padding:'9px 4px 13px',background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,position:'relative',color:on?C.verm:C.ink3,transition:'color .15s'}}>
              {on && <div style={{position:'absolute',top:0,left:'22%',right:'22%',height:2,background:C.verm,borderRadius:'0 0 3px 3px'}}/>}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t.path.split('M').filter(Boolean).map((seg,i) => <path key={i} d={`M${seg}`}/>)}
              </svg>
              <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px'}}>{t.lbl}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/* ─── PENDIENTES ─────────────────────────────────────────────── */
function PendientesScreen({session,turnoId}:{session:{id:string;nombre:string;rol:string};turnoId:string|null}) {
  const [filtro,setFiltro] = useState('todas')
  const demo = [
    {id:'1',mesa:'Mesa 7',estado:'urgente',items:[{q:3,n:'Gambas al ajillo',nota:'sin guindilla'},{q:1,n:'Padrón',nota:''}],t:new Date(Date.now()-12*60000).toISOString(),who:'cocina'},
    {id:'2',mesa:'Mesa 4',estado:'cocina', items:[{q:2,n:'Croquetas caseras',nota:''},{q:1,n:'Salmorejo',nota:''}],t:new Date(Date.now()-4*60000).toISOString(), who:'frío'},
    {id:'3',mesa:'Mesa 11',estado:'lista', items:[{q:1,n:'Manchado sin azúcar',nota:''},{q:2,n:'Agua mineral',nota:''}],t:new Date(Date.now()-2*60000).toISOString(),who:'barra'},
  ]
  const timer = (iso:string) => { const s=Math.floor((Date.now()-new Date(iso).getTime())/1000); return `${Math.floor(s/60)}m ${s%60}s` }
  const vis = demo.filter(d=>filtro==='todas'||(filtro==='urgentes'&&d.estado==='urgente')||(filtro==='listas'&&d.estado==='lista')||(filtro==='cocina'&&d.estado==='cocina'))
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:C.bg}}>
      <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.rule}`,display:'flex',gap:5,overflowX:'auto',scrollbarWidth:'none' as const,flexShrink:0,background:C.bg1}}>
        {['todas','cocina','urgentes','listas'].map(f=>(
          <div key={f} onClick={()=>setFiltro(f)}
            style={{background:f===filtro?C.vermS:C.bg2,border:`1px solid ${f===filtro?C.verm+'55':C.rule}`,borderRadius:20,padding:'5px 12px',fontSize:11,fontWeight:f===filtro?600:400,color:f===filtro?C.verm:C.ink3,whiteSpace:'nowrap',cursor:'pointer',flexShrink:0}}>
            {f.charAt(0).toUpperCase()+f.slice(1)}{f==='todas'?` (${demo.length})`:f==='urgentes'?` (${demo.filter(d=>d.estado==='urgente').length})`:''}
          </div>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 16px',display:'flex',flexDirection:'column',gap:7}}>
        {vis.map(c=>{
          const urg=c.estado==='urgente'; const done=c.estado==='lista'
          return (
            <div key={c.id} style={{background:C.bg1,border:`1px solid ${urg?C.verm+'44':done?C.gr+'44':C.rule}`,borderRadius:12,overflow:'hidden',opacity:done?.75:1,boxShadow:'0 1px 4px rgba(26,23,20,.06)'}}>
              <div style={{padding:'9px 13px',borderBottom:`1px solid ${C.rule}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:done?C.grS:urg?C.vermS:C.bg2}}>
                <span style={{fontFamily:SE,fontStyle:'italic',fontSize:16,color:C.ink}}>{c.mesa}</span>
                <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',padding:'3px 9px',borderRadius:20,background:urg?C.verm:done?C.gr:C.amb,color:'#fff'}}>
                  {done?'✓ lista':urg?'⚡ urgente':'cocina'}
                </span>
              </div>
              <div style={{padding:'8px 13px 9px'}}>
                <div style={{display:'flex',flexDirection:'column',gap:3,marginBottom:6}}>
                  {c.items.map((it,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,opacity:done?.5:1,textDecoration:done?'line-through':'none'}}>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:15,color:C.verm,minWidth:14}}>{it.q}</span>
                      <span style={{fontSize:12,color:C.ink2}}>{it.n}</span>
                      {it.nota&&<span style={{fontFamily:SC,fontSize:11,color:C.amb,marginLeft:'auto'}}>{it.nota}</span>}
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontFamily:SM,fontSize:11,color:urg?C.verm:done?C.ink4:C.amb}}>{timer(c.t)}{urg?' ⚠':''}</span>
                  <span style={{fontSize:10,color:C.ink4}}>{session.nombre.split(' ')[0]} · {c.who}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── CONFIG ─────────────────────────────────────────────────── */
function ConfigScreen({session,voiceConfirm,onVoiceConfirm,zonaAsignada,onZona,fontBig,onFontBig,alergenosMesa,onAlergenosMesa,subscribed,onSubscribe,hasInstall,onInstall,onLogout}:{
  session:{id:string;nombre:string;rol:string}
  voiceConfirm:boolean; onVoiceConfirm:(v:boolean)=>void
  zonaAsignada:string;  onZona:(v:string)=>void
  fontBig:boolean;      onFontBig:(v:boolean)=>void
  alergenosMesa:string[];onAlergenosMesa:()=>void
  subscribed:boolean;   onSubscribe:()=>void
  hasInstall:boolean;   onInstall:()=>void
  onLogout:()=>void
}) {
  const Toggle = ({on,onT}:{on:boolean;onT:()=>void}) => (
    <div onClick={onT} style={{width:44,height:26,borderRadius:13,background:on?C.verm:C.bg3,border:`1px solid ${on?C.vermD:C.rule}`,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
      <div style={{position:'absolute',top:3,left:on?20:3,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(26,23,20,.2)',transition:'left .2s'}}/>
    </div>
  )
  const Chip = ({label,on,onClick}:{label:string;on:boolean;onClick:()=>void}) => (
    <div onClick={onClick} style={{padding:'6px 14px',borderRadius:20,background:on?C.vermS:C.bg2,border:`1px solid ${on?C.verm+'55':C.rule}`,fontSize:12,fontWeight:on?700:400,color:on?C.verm:C.ink2,cursor:'pointer',transition:'all .12s'}}>
      {label}
    </div>
  )
  const Row = ({label,sub,right}:{label:string;sub?:string;right:React.ReactElement}) => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
      <div>
        <div style={{fontSize:13,fontWeight:500,color:C.ink}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:C.ink4,marginTop:2}}>{sub}</div>}
      </div>
      <div>{right}</div>
    </div>
  )
  return (
    <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,background:C.bg}}>
      <div style={{padding:'16px 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,paddingBottom:14,borderBottom:`1px solid ${C.rule}`}}>
          <div style={{width:46,height:46,borderRadius:'50%',background:C.verm,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:'#fff',flexShrink:0}}>
            {session.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:C.ink}}>{session.nombre}</div>
            <div style={{fontSize:11,color:C.ink4,marginTop:1,textTransform:'capitalize'}}>{session.rol}</div>
          </div>
        </div>
      </div>
      <div style={{padding:'0 20px'}}>
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:9}}>Zona asignada</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
            {['salon','terraza','barra'].map(z=><Chip key={z} label={z.charAt(0).toUpperCase()+z.slice(1)} on={zonaAsignada===z} onClick={()=>onZona(z)}/>)}
          </div>
        </div>
        <Row label="Confirmación por voz" sub="BRAIN lee la comanda antes de confirmar"
          right={<Toggle on={voiceConfirm} onT={()=>onVoiceConfirm(!voiceConfirm)}/>}/>
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:C.ink}}>Alérgenos de mesa</div>
              <div style={{fontSize:11,color:alergenosMesa.length>0?C.amb:C.ink4,marginTop:2}}>
                {alergenosMesa.length>0?alergenosMesa.join(', '):'Sin alérgenos declarados'}
              </div>
            </div>
            <button onClick={onAlergenosMesa} style={{background:alergenosMesa.length>0?C.ambS:C.bg2,border:`1px solid ${alergenosMesa.length>0?C.amb+'66':C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:alergenosMesa.length>0?'#7A5A1A':C.ink3,cursor:'pointer'}}>
              {alergenosMesa.length>0?'Editar':'Declarar'}
            </button>
          </div>
        </div>
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:9}}>Tamaño de texto</div>
          <div style={{display:'flex',gap:6}}>
            <Chip label="Normal" on={!fontBig} onClick={()=>onFontBig(false)}/>
            <Chip label="Grande" on={fontBig}  onClick={()=>onFontBig(true)}/>
          </div>
        </div>
        {!subscribed && (
          <Row label="Notificaciones push" sub="Alertas cuando cocina marca listo"
            right={<button onClick={onSubscribe} style={{background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:'#7A5A1A',cursor:'pointer'}}>Activar</button>}/>
        )}
        {subscribed && (
          <Row label="Notificaciones" sub="Activas — recibirás alertas de cocina"
            right={<div style={{width:10,height:10,borderRadius:'50%',background:C.gr}}/>}/>
        )}
        {hasInstall && (
          <Row label="Instalar app" sub="Añadir a pantalla de inicio"
            right={<button onClick={onInstall} style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Instalar</button>}/>
        )}
        <div style={{paddingTop:20,paddingBottom:32}}>
          <button onClick={onLogout} style={{width:'100%',padding:13,background:'transparent',border:`1px solid ${C.verm}44`,borderRadius:10,fontFamily:SN,fontSize:13,fontWeight:600,color:C.verm,cursor:'pointer'}}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
