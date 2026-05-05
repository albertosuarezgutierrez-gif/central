'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ManualComanda from '@/components/ManualComanda'
import { useProductos86, useComandas } from '@/hooks/useRealtime'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { usePushNotifications } from '@/hooks/usePushNotifications'

const C = {
  bg:'#14110E', bg1:'#1C1814', bg2:'#241F19', bg3:'#2E2820',
  txt:'#F6F1E7', txt2:'#D8CDB6', txt3:'#8C7B6A', txt4:'#4A3F35',
  verm:'#D9442B', vermD:'#A8311E',
  amber:'#E8A33B', green:'#3F7D44', teal:'#2B8A8E',
  rule:'#1E1A15',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

type Screen = 'idle'|'recording'|'processing'|'speaking'|'asking'|'confirm'|'sent'|'error'
type Tab = 'hablar'|'manual'|'pendientes'|'config'

interface BrainResult {
  mesa:string; tipo:string
  items:{nombre:string;cantidad:number}[]
  confianza:number; raw:string
}

// Mensaje visible en el chat del camarero
interface ChatMsg {
  id:string; from:'brain'|'camarero'|'sistema'
  texto:string; ts:Date; tipo?:'ok'|'error'|'aviso'|'pregunta'
}

function buildTTSText(brain:BrainResult, a86:string[]=[], aAlerg:{producto:string;alergenos:string[]}[]=[]): string {
  const s86 = a86.length ? `Atención, ochenta y seis: ${a86.join(' y ')}. ` : ''
  const sAl = aAlerg.length ? `Alérgeno detectado: ${aAlerg.map(a=>`${a.producto} contiene ${a.alergenos.join(' y ')}`).join('. ')}. ` : ''
  if (!brain.items.length) return `${s86}${sAl}${brain.tipo} para ${brain.mesa}. ¿Confirmamos?`
  const items = brain.items.map(it=>`${it.cantidad===1?'una de':it.cantidad} ${it.nombre}`).join(', ')
  return `${s86}${sAl}${brain.mesa}: ${items}. ¿Confirmamos?`
}

function speak(text:string): Promise<void> {
  return new Promise(resolve => {
    if (typeof window==='undefined'||!window.speechSynthesis){resolve();return}
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang='es-ES'; utt.rate=1.05; utt.pitch=1; utt.volume=1
    const voices = window.speechSynthesis.getVoices()
    const v = voices.find(v=>v.lang.startsWith('es')&&v.name.toLowerCase().includes('female'))??voices.find(v=>v.lang.startsWith('es'))
    if(v) utt.voice=v
    utt.onend=()=>resolve(); utt.onerror=()=>resolve()
    window.speechSynthesis.speak(utt)
  })
}

export default function EdgePage() {
  const { session, checking } = useAuth()
  const [turnoId, setTurnoId] = useState<string|null>(null)
  if (checking||!session) return <div style={{minHeight:'100dvh',background:C.bg}}/>
  return <EdgeContent session={session} turnoId={turnoId} setTurnoId={setTurnoId}/>
}

function EdgeContent({ session, turnoId, setTurnoId }:{
  session:{id:string;nombre:string;rol:string}
  turnoId:string|null
  setTurnoId:(id:string|null)=>void
}) {
  const [tab, setTab] = useState<Tab>('hablar')
  const [screen, setScreen] = useState<Screen>('idle')
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain] = useState<BrainResult|null>(null)
  const [error, setError] = useState('')
  const [latencia, setLatencia] = useState<number|null>(null)
  const [alert86, setAlert86] = useState<string[]>([])
  const [lastComandaId, setLastComandaId] = useState<string|null>(null)
  const speakingRef = useRef(false)
  const [pendingItems, setPendingItems] = useState<BrainResult['items']>([])
  const [alertas86Comanda, setAlertas86Comanda] = useState<string[]>([])
  const [alertasAlergenos, setAlertasAlergenos] = useState<{producto:string;alergenos:string[]}[]>([])
  const [mostrarAlergenos, setMostrarAlergenos] = useState(false)
  const [pedidoCuenta, setPedidoCuenta] = useState<{loading:boolean;error:string;factura:null|{numero_factura:number;importe_total:number;qr_data:string}}>({loading:false,error:'',factura:null})
  const [sheetOpen, setSheetOpen] = useState<'confirm'|null>(null)
  const [showPush, setShowPush] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  // Config del camarero (persiste en localStorage)
  const [voiceConfirm, setVoiceConfirm] = useState(true)
  const [alergenosMesa, setAlergenosMesa] = useState<string[]>([])
  const [zonaAsignada, setZonaAsignada] = useState<string>('salon')
  const [fontSize, setFontSize] = useState<'normal'|'grande'>('normal')

  // Historial de mensajes chat (últimas 3 interacciones)
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])

  const addMsg = useCallback((from:ChatMsg['from'], texto:string, tipo?:ChatMsg['tipo'])=>{
    const msg:ChatMsg = {id:Date.now().toString(), from, texto, ts:new Date(), tipo}
    setChatMsgs(prev=>[...prev.slice(-4), msg]) // máximo 5
  },[])

  const { prompt: installPrompt, install } = useInstallPrompt()
  const { subscribed, subscribe } = usePushNotifications(session.id)
  const productos86 = useProductos86(turnoId??undefined)
  const { comandas: todasComandas } = useComandas(turnoId??undefined)
  // Últimas 2 comandas del camarero activo en este turno
  const ultimasComandas = todasComandas
    .filter((c:Record<string,unknown>)=>(c.camarero as Record<string,unknown>)?.id===session.id)
    .slice(-2)
  const prev86Ref = useRef(0)

  useEffect(()=>{
    if(productos86.length>prev86Ref.current){
      const nuevos=productos86.slice(0,productos86.length-prev86Ref.current)
      setAlert86(nuevos.map(p=>p.nombre))
      addMsg('sistema',`86 · ${nuevos.map(p=>p.nombre).join(', ')}`, 'aviso')
      const t=setTimeout(()=>setAlert86([]),8000)
      prev86Ref.current=productos86.length
      return ()=>clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[productos86.length])

  useEffect(()=>{
    fetch('/api/turno').then(r=>r.json()).then(d=>{ if(d.turno) setTurnoId(d.turno.id) })
    // Cargar config guardada
    try {
      const cfg = JSON.parse(localStorage.getItem('ia_rest_cfg')||'{}')
      if(cfg.voiceConfirm!==undefined) setVoiceConfirm(cfg.voiceConfirm)
      if(cfg.zonaAsignada) setZonaAsignada(cfg.zonaAsignada)
      if(cfg.fontSize) setFontSize(cfg.fontSize)
    } catch {}
  },[])

  const saveConfig = useCallback((patch:Record<string,unknown>)=>{
    try {
      const cfg = JSON.parse(localStorage.getItem('ia_rest_cfg')||'{}')
      localStorage.setItem('ia_rest_cfg', JSON.stringify({...cfg, ...patch}))
    } catch {}
  },[])

  const skipSpeaking = useCallback(()=>{
    if(typeof window!=='undefined') window.speechSynthesis?.cancel()
    speakingRef.current=false; setScreen('confirm'); setSheetOpen('confirm')
  },[])

  useEffect(()=>{
    if(screen!=='speaking'||!brain) return
    speakingRef.current=true
    speak(buildTTSText(brain,alertas86Comanda,alertasAlergenos)).then(()=>{
      if(speakingRef.current){ speakingRef.current=false; setScreen('confirm'); setSheetOpen('confirm') }
    })
    return ()=>{ speakingRef.current=false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen,brain])

  const mediaRef = useRef<MediaRecorder|null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  const startRecording = useCallback(async()=>{
    if(screen!=='idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      chunksRef.current=[]
      const mr = new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'})
      mr.ondataavailable=e=>{ if(e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(100); mediaRef.current=mr; recordingRef.current=true
      setScreen('recording')
      if(navigator.vibrate) navigator.vibrate(50)
    } catch { setError('Sin acceso al micrófono'); setScreen('error') }
  },[screen])

  const stopRecording = useCallback(async()=>{
    if(!recordingRef.current||!mediaRef.current) return
    recordingRef.current=false; setScreen('processing')
    const mr=mediaRef.current
    await new Promise<void>(resolve=>{ mr.onstop=()=>resolve(); mr.stop() })
    mr.stream.getTracks().forEach(t=>t.stop())
    if(!chunksRef.current.length){ setScreen('idle'); return }

    const blob=new Blob(chunksRef.current,{type:'audio/webm'})
    const fd=new FormData()
    fd.append('audio',blob,'audio.webm')
    fd.append('camarero_id',session.id)
    fd.append('turno_id',turnoId||'demo')
    if(pendingItems.length>0) fd.append('pending_items',JSON.stringify(pendingItems))

    try {
      const r=await fetch('/api/transcribe',{method:'POST',body:fd})
      const d=await r.json()
      if(d.ok){
        setTranscript(d.texto); setBrain(d.brain); setLatencia(d.latencia_ms)
        setLastComandaId(d.comanda_id??null)
        setAlertas86Comanda(d.alertas_86??[]); setAlertasAlergenos(d.alertas_alergenos??[])

        // Añadir al chat lo que dijo el camarero
        addMsg('camarero', d.texto)

        if(!d.comanda_id&&d.brain?.mesa&&['T00','M00','','desconocida'].includes(d.brain.mesa)){
          if(d.brain?.items?.length>0) setPendingItems(d.brain.items)
          addMsg('brain','¿Qué mesa?','pregunta')
          setScreen('asking'); speak('¿Qué mesa?').then(()=>startRecording()); return
        }
        setPendingItems([])

        // Construir mensaje BRAIN para el chat
        const mesaLabel = d.brain?.mesa||'?'
        const itemsLabel = d.brain?.items?.map((it:BrainResult['items'][0])=>`${it.cantidad}× ${it.nombre}`).join(', ')||''
        const a86 = d.alertas_86||[]; const aAlerg = d.alertas_alergenos||[]
        let msgBrain = `${mesaLabel}: ${itemsLabel}`
        if(a86.length) msgBrain += ` · ⚠ 86: ${a86.join(', ')}`
        if(aAlerg.length) msgBrain += ` · ⚠ alérgeno`
        addMsg('brain', msgBrain, a86.length||aAlerg.length?'aviso':'ok')

        const hasTTS=typeof window!=='undefined'&&'speechSynthesis' in window
        if(voiceConfirm&&hasTTS){ setScreen('speaking') }
        else { setScreen('confirm'); setSheetOpen('confirm') }
        if(navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        const errMsg = d.code==='API_KEY_INVALID'?'API key no configurada':d.error||'Error procesando voz'
        setError(errMsg)
        addMsg('sistema', errMsg, 'error')
        setScreen('error')
      }
    } catch {
      setError('Error de red')
      addMsg('sistema','Sin conexión','error')
      setScreen('error')
    }
  },[session.id,turnoId,pendingItems,voiceConfirm,startRecording,addMsg])

  useEffect(()=>{
    const dn=(e:KeyboardEvent)=>{ if(e.code==='Space'&&!e.repeat&&screen==='idle'){e.preventDefault();startRecording()} }
    const up=(e:KeyboardEvent)=>{ if(e.code==='Space'&&screen==='recording') stopRecording() }
    window.addEventListener('keydown',dn); window.addEventListener('keyup',up)
    return ()=>{ window.removeEventListener('keydown',dn); window.removeEventListener('keyup',up) }
  },[startRecording,stopRecording])

  const logout=()=>{
    fetch('/api/auth',{method:'DELETE'}); localStorage.removeItem('ia_rest_session')
    window.location.href='/login'
  }

  const reset=()=>{
    if(typeof window!=='undefined') window.speechSynthesis?.cancel()
    speakingRef.current=false
    setScreen('idle'); setBrain(null); setTranscript(''); setError('')
    setPedidoCuenta({loading:false,error:'',factura:null})
    setAlertas86Comanda([]); setAlertasAlergenos([]); setPendingItems([])
    setSheetOpen(null)
  }

  const pedirCuenta=async()=>{
    if(!lastComandaId) return
    setPedidoCuenta({loading:true,error:'',factura:null})
    try {
      const r=await fetch('/api/factura/cerrar',{method:'POST',headers:{'Content-Type':'application/json','x-ia-session':localStorage.getItem('ia_rest_session')??''},body:JSON.stringify({comanda_id:lastComandaId,mesa_label:brain?.mesa??'Mesa'})})
      const d=await r.json()
      if(r.ok){ setPedidoCuenta({loading:false,error:'',factura:d.factura}); addMsg('sistema',`Factura ${d.factura?.numero_factura} · ${d.factura?.importe_total?.toFixed(2)} €`,'ok') }
      else setPedidoCuenta({loading:false,error:d.error??'Error al generar cuenta',factura:null})
    } catch { setPedidoCuenta({loading:false,error:'Error de red',factura:null}) }
  }

  const isListening = screen==='recording'
  const isProcessing = screen==='processing'||screen==='speaking'
  const fS = fontSize==='grande' ? 1.15 : 1

  return (
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SN,position:'relative',fontSize:`${fS}rem`}}>
      <style>{`
        @keyframes ldot{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes hout{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.1);opacity:0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes stt{from{opacity:.6}to{opacity:1}}
        @keyframes urg{0%,100%{border-color:#D9442B}50%{border-color:#A8311E}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes pushIn{from{transform:translateY(-100%)}to{transform:translateY(0)}}
        @keyframes alert86{0%{opacity:0;transform:translateY(-100%)}10%{opacity:1;transform:translateY(0)}85%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-100%)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* PUSH */}
      {showPush&&(
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:60,background:C.bg3,borderBottom:`2px solid ${C.green}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,animation:'pushIn .3s cubic-bezier(.34,1.56,.64,1)'}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:C.green,boxShadow:`0 0 6px ${C.green}`,flexShrink:0}}/>
          <span style={{fontFamily:SC,fontSize:14,flex:1}}>{pushMsg}</span>
          <span onClick={()=>setShowPush(false)} style={{fontSize:11,color:C.txt4,cursor:'pointer',padding:3}}>✕</span>
        </div>
      )}

      {/* 86 BANNER */}
      {alert86.length>0&&(
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:'#A8311E',padding:'11px 16px',fontFamily:SM,fontSize:12,color:C.txt,display:'flex',alignItems:'center',gap:10,animation:'alert86 8s ease forwards',borderBottom:'1px solid rgba(255,255,255,.15)'}}>
          <span style={{fontWeight:700,letterSpacing:'.1em'}}>86</span><span style={{opacity:.5}}>·</span>
          <span>{alert86.join(' · ')}</span>
          <button onClick={()=>setAlert86([])} style={{marginLeft:'auto',background:'none',border:'none',color:C.txt,cursor:'pointer',opacity:.6,fontSize:15}}>×</button>
        </div>
      )}

      {/* OVERLAY confirm sheet */}
      {sheetOpen&&(
        <div onClick={()=>{setSheetOpen(null);if(screen==='confirm')reset()}}
          style={{position:'absolute',inset:0,background:'rgba(10,9,7,.65)',zIndex:20,backdropFilter:'blur(2px)'}}/>
      )}

      {/* CONFIRM SHEET */}
      {sheetOpen==='confirm'&&brain&&(
        <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:30,background:C.bg1,borderTop:`1px solid ${C.bg3}`,borderRadius:'20px 20px 0 0',animation:'slideUp .32s cubic-bezier(.32,1,.28,1)'}}>
          <div style={{width:36,height:3,background:C.bg3,borderRadius:2,margin:'10px auto 0'}}/>
          <div style={{padding:'13px 20px 11px',display:'flex',alignItems:'center',gap:10,borderBottom:`1px solid ${C.rule}`}}>
            <span style={{fontFamily:SM,fontSize:8,color:C.amber,background:'rgba(232,163,59,.1)',border:'1px solid rgba(232,163,59,.2)',borderRadius:4,padding:'2px 6px'}}>BRAIN</span>
            <span style={{fontFamily:SE,fontStyle:'italic',fontSize:17,flex:1}}>{brain.mesa}</span>
            <span style={{fontFamily:SM,fontSize:10,color:C.green}}>{Math.round((brain.confianza||0.9)*100)}%</span>
          </div>
          {alertas86Comanda.length>0&&(
            <div style={{margin:'7px 20px 0',background:'rgba(168,49,30,.12)',border:`1px solid ${C.vermD}`,borderRadius:6,padding:'6px 10px',fontFamily:SM,fontSize:11,color:C.verm,display:'flex',gap:8}}>
              <span style={{fontWeight:700}}>86</span><span>·</span><span>{alertas86Comanda.join(' · ')}</span>
            </div>
          )}
          {alertasAlergenos.length>0&&(
            <div style={{margin:'5px 20px 0',background:'rgba(232,163,59,.1)',border:`1px solid ${C.amber}`,borderRadius:6,padding:'6px 10px',fontFamily:SM,fontSize:10,color:C.amber,display:'flex',flexDirection:'column',gap:3}}>
              <span style={{fontWeight:700,fontSize:11}}>ALÉRGENO DETECTADO</span>
              {alertasAlergenos.map((a,i)=><span key={i} style={{opacity:.9}}>{a.producto} contiene: {a.alergenos.join(', ')}</span>)}
            </div>
          )}
          <div style={{padding:'6px 20px',maxHeight:'32vh',overflowY:'auto'}}>
            {brain.items.map((it,i)=>{
              const is86=alertas86Comanda.map(n=>n.toLowerCase()).includes(it.nombre.toLowerCase())
              return(
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'7px 0',borderBottom:`1px solid ${C.rule}`,opacity:is86?.6:1,textDecoration:is86?'line-through':'none'}}>
                  <span style={{fontFamily:SE,fontStyle:'italic',fontSize:22,color:C.verm,lineHeight:1,minWidth:22,textAlign:'center'}}>{it.cantidad}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:500}}>{it.nombre}</span>
                  {is86&&<span style={{fontFamily:SM,fontSize:9,fontWeight:700,color:C.vermD,padding:'1px 5px',background:'rgba(168,49,30,.2)',borderRadius:2}}>86</span>}
                </div>
              )
            })}
          </div>
          {transcript&&(
            <div style={{padding:'6px 20px 10px',borderTop:`1px solid ${C.rule}`,fontFamily:SC,fontSize:13,color:C.teal}}>
              💬 {transcript}
            </div>
          )}
          <div style={{display:'flex',borderTop:`1px solid ${C.rule}`}}>
            <button onClick={reset} style={{flex:1,padding:14,background:'transparent',border:'none',borderRight:`1px solid ${C.rule}`,color:C.txt4,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
            <button onClick={reset} style={{flex:1,padding:14,background:'transparent',border:'none',borderRight:`1px solid ${C.rule}`,color:C.amber,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Editar</button>
            <button onClick={()=>{
              setSheetOpen(null); setScreen('sent')
              addMsg('brain',`✓ Enviado · ${brain.mesa}`,'ok')
              setPushMsg(`🍳 Cocina recibió · ${brain.mesa}`); setShowPush(true); setTimeout(()=>setShowPush(false),4000)
            }} style={{flex:2,padding:14,background:C.verm,border:'none',color:C.txt,fontFamily:SN,fontSize:13,fontWeight:700,cursor:'pointer'}}>
              ✓ Confirmar
            </button>
          </div>
        </div>
      )}

      {/* ALÉRGENOS MODAL */}
      {mostrarAlergenos&&(
        <div style={{position:'fixed',inset:0,background:'rgba(13,11,8,.92)',zIndex:200,display:'flex',flexDirection:'column',padding:20,gap:12}}>
          <div style={{fontFamily:SM,fontSize:10,color:C.amber,letterSpacing:'.12em',fontWeight:700,textTransform:'uppercase'}}>ALÉRGENOS DE MESA · EU 1169/2011</div>
          <div style={{fontFamily:SN,fontSize:12,color:C.txt3,lineHeight:1.4}}>El cliente ha indicado intolerancia / alergia a:</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,flex:1}}>
            {['Gluten','Crustáceos','Huevos','Pescado','Cacahuetes','Soja','Lactosa','Frutos secos','Apio','Mostaza','Sésamo','Sulfitos','Altramuces','Moluscos'].map(al=>{
              const active=alergenosMesa.includes(al)
              return(
                <button key={al} onPointerDown={()=>setAlergenosMesa(prev=>active?prev.filter(a=>a!==al):[...prev,al])}
                  style={{background:active?'rgba(232,163,59,.18)':C.bg2,border:`1px solid ${active?C.amber:C.rule}`,borderRadius:6,padding:'10px 8px',fontFamily:SN,fontSize:12,fontWeight:active?700:400,color:active?C.amber:C.txt3,cursor:'pointer',textAlign:'left',transition:'all .15s'}}>
                  {al}
                </button>
              )
            })}
          </div>
          <button onPointerDown={()=>setMostrarAlergenos(false)}
            style={{background:C.verm,border:'none',color:C.txt,padding:13,borderRadius:8,fontFamily:SN,fontSize:14,fontWeight:700,cursor:'pointer'}}>
            Confirmar — {alergenosMesa.length>0?alergenosMesa.join(', '):'sin alérgenos declarados'}
          </button>
        </div>
      )}

      {/* ── HEADER mínimo ── */}
      <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.rule}`,background:C.bg,flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.verm,letterSpacing:'-.5px',lineHeight:1}}>ia.rest</div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {/* Estado pipeline — solo cuando activo */}
          {(isListening||isProcessing)&&(
            <div style={{display:'flex',alignItems:'center',gap:5,background:C.bg2,border:`1px solid ${isListening?C.teal:C.amber}`,borderRadius:12,padding:'3px 10px'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:isListening?C.teal:C.amber,animation:'ldot 1s ease-in-out infinite'}}/>
              <span style={{fontFamily:SM,fontSize:9,color:isListening?C.teal:C.amber}}>{isListening?'EAR':'BRAIN'}</span>
            </div>
          )}
          {/* Alérgenos activos badge */}
          {alergenosMesa.length>0&&(
            <div style={{background:'rgba(232,163,59,.12)',border:`1px solid ${C.amber}`,borderRadius:12,padding:'3px 8px',fontFamily:SM,fontSize:9,color:C.amber,fontWeight:700}}>
              ⚠ {alergenosMesa.length}
            </div>
          )}
          {/* Camarero */}
          <div style={{display:'flex',alignItems:'center',gap:5,background:C.bg2,border:`1px solid ${C.bg3}`,borderRadius:16,padding:'4px 10px 4px 6px',cursor:'pointer'}} onClick={logout}>
            <div style={{width:5,height:5,borderRadius:'50%',background:C.green,boxShadow:`0 0 5px ${C.green}`,animation:'ldot 2s infinite'}}/>
            <span style={{fontSize:12,fontWeight:600}}>{session.nombre.split(' ')[0]}</span>
          </div>
        </div>
      </div>

      {/* ══ TAB: HABLAR ══════════════════════════════════════════ */}
      {tab==='hablar'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* ÚLTIMAS 2 COMANDAS DEL TURNO */}
          {ultimasComandas.length>0&&(
            <div style={{padding:'8px 16px 0',display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
              {(ultimasComandas as Record<string,unknown>[]).map((c)=>{
                const mesa = (c.mesa as Record<string,string>)?.codigo||'?'
                const items = (c.items as Record<string,unknown>[])
                const resumen = items.slice(0,3).map(it=>`${it.cantidad}× ${it.nombre}`).join(' · ')+(items.length>3?` +${items.length-3}`:'')
                const estado = c.estado as string
                const col = estado==='en_cocina'?C.amber:estado==='lista'?C.green:C.txt4
                return(
                  <div key={c.id as string} style={{background:C.bg1,border:`1px solid ${C.rule}`,borderLeft:`3px solid ${col}`,borderRadius:8,padding:'7px 10px',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{fontFamily:SE,fontStyle:'italic',fontSize:19,fontWeight:600,color:col,lineHeight:1,minWidth:24,textAlign:'center'}}>
                      {mesa.replace(/[^0-9]/g,'')}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,color:C.txt2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{resumen||'—'}</div>
                    </div>
                    <div style={{fontFamily:SM,fontSize:9,color:col,textTransform:'uppercase',flexShrink:0}}>{estado==='en_cocina'?'cocina':estado}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* CHAT */}
          <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 16px',display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:6}}>

            {/* Estado vacío */}
            {chatMsgs.length===0&&screen==='idle'&&(
              <div style={{textAlign:'center',padding:'0 20px 20px'}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.txt4,lineHeight:1.4}}>Mantén pulsado y habla.</div>
              </div>
            )}

            {/* Asking state */}
            {screen==='asking'&&(
              <div style={{background:'rgba(43,138,142,.1)',border:`1px solid rgba(43,138,142,.3)`,borderRadius:12,padding:'12px 14px',animation:'msgIn .2s ease'}}>
                <div style={{fontFamily:SM,fontSize:8,color:C.teal,letterSpacing:'1px',marginBottom:5}}>BRAIN · pregunta</div>
                <div style={{fontSize:14,fontWeight:600}}>¿Qué mesa?</div>
                {pendingItems.length>0&&(
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                    {pendingItems.map((it,i)=>(
                      <div key={i} style={{display:'flex',gap:8,fontSize:12,color:C.txt2}}>
                        <span style={{fontFamily:SM,color:C.verm,fontWeight:700}}>{it.cantidad}×</span>{it.nombre}
                      </div>
                    ))}
                    <button onClick={reset} style={{marginTop:6,background:'none',border:`1px solid ${C.bg3}`,color:C.txt4,borderRadius:6,padding:'5px 10px',fontFamily:SN,fontSize:11,cursor:'pointer',alignSelf:'flex-start'}}>Cancelar</button>
                  </div>
                )}
              </div>
            )}

            {/* Mensajes del historial */}
            {chatMsgs.map(msg=>{
              const isCam = msg.from==='camarero'
              const isSis = msg.from==='sistema'
              const borderCol = msg.tipo==='error'?C.verm:msg.tipo==='aviso'?C.amber:msg.tipo==='pregunta'?C.teal:msg.tipo==='ok'?C.green:C.bg3
              return(
                <div key={msg.id} style={{
                  alignSelf:isCam?'flex-end':'flex-start',
                  maxWidth:'88%',
                  background:isCam?C.bg2:isSis?'rgba(217,68,43,.08)':C.bg2,
                  border:`1px solid ${isCam?C.bg3:borderCol}`,
                  borderRadius:isCam?'12px 4px 12px 12px':'4px 12px 12px 12px',
                  padding:'8px 12px',
                  animation:'msgIn .2s ease',
                }}>
                  {!isCam&&(
                    <div style={{fontFamily:SM,fontSize:8,color:isSis?(msg.tipo==='error'?C.verm:C.txt4):C.teal,letterSpacing:'1px',marginBottom:3,textTransform:'uppercase'}}>
                      {isSis?'sistema':msg.tipo==='pregunta'?'brain · pregunta':'brain'}
                    </div>
                  )}
                  <div style={{fontSize:13,color:isSis&&msg.tipo==='error'?C.verm:C.txt,lineHeight:1.4,fontFamily:isCam?SC:SN,fontStyle:isCam?'italic':'normal'}}>
                    {msg.texto}
                  </div>
                  <div style={{fontSize:9,color:C.txt4,marginTop:3,textAlign:'right',fontFamily:SM}}>
                    {msg.ts.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              )
            })}

            {/* sent state */}
            {screen==='sent'&&brain&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'10px 0'}}>
                <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(63,125,68,.12)',display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.green}`}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
                </div>
                {lastComandaId&&!pedidoCuenta.factura&&(
                  <button onClick={pedirCuenta} disabled={pedidoCuenta.loading}
                    style={{background:C.bg2,border:`1px solid ${C.bg3}`,color:C.txt,padding:'9px 18px',borderRadius:8,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    {pedidoCuenta.loading?'Generando…':'Generar cuenta · Verifactu'}
                  </button>
                )}
                {pedidoCuenta.factura&&(
                  <div style={{background:C.bg2,border:`1px solid ${C.bg3}`,borderRadius:10,padding:12,textAlign:'center'}}>
                    <div style={{fontFamily:SM,fontSize:8,color:C.txt4,letterSpacing:'.1em',marginBottom:3}}>FACTURA VERIFACTU</div>
                    <div style={{fontFamily:SE,fontSize:22,fontWeight:600,color:C.txt}}>{pedidoCuenta.factura.importe_total.toFixed(2).replace('.',',')} €</div>
                  </div>
                )}
                <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.bg3}`,color:C.txt3,padding:'8px 20px',borderRadius:8,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Nueva comanda</button>
              </div>
            )}

            {/* error */}
            {screen==='error'&&(
              <div style={{textAlign:'center',padding:'10px 0'}}>
                <div style={{fontFamily:SM,fontSize:12,color:C.verm,marginBottom:10}}>{error}</div>
                <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.bg3}`,color:C.txt3,padding:'8px 18px',borderRadius:8,fontFamily:SN,fontSize:12,cursor:'pointer'}}>Reintentar</button>
              </div>
            )}
          </div>

          {/* PTT */}
          <div style={{padding:'8px 20px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:7,flexShrink:0}}>
            <div style={{position:'relative',width:88,height:88,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid rgba(217,68,43,${isListening?.45:.2})`,animation:'hout 2s ease-out infinite'}}/>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid rgba(217,68,43,${isListening?.45:.2})`,animation:'hout 2s ease-out .7s infinite'}}/>
              <button
                onPointerDown={e=>{e.preventDefault();startRecording()}}
                onPointerUp={e=>{e.preventDefault();stopRecording()}}
                onPointerLeave={e=>{e.preventDefault();if(recordingRef.current)stopRecording()}}
                disabled={isProcessing}
                style={{width:76,height:76,borderRadius:'50%',
                  background:isListening?C.verm:`radial-gradient(circle at 38% 30%,#EA5540,${C.verm} 55%,${C.vermD})`,
                  border:'none',cursor:isProcessing?'default':'pointer',position:'relative',zIndex:2,
                  boxShadow:isListening?`0 2px 10px rgba(217,68,43,.3)`:`0 6px 24px rgba(217,68,43,.4)`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transform:isListening?'scale(.91)':'scale(1)',
                  transition:'all .15s cubic-bezier(.34,1.56,.64,1)',
                  opacity:isProcessing?.5:1,touchAction:'none',userSelect:'none'}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(246,241,231,.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="12" rx="3" fill={isListening?'rgba(246,241,231,.95)':'none'}/>
                  <path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
              </button>
            </div>
            <span style={{fontFamily:SM,fontSize:10,fontWeight:600,color:isListening?C.verm:C.txt4,textTransform:'uppercase',letterSpacing:'1.5px',animation:isListening?'stt .8s infinite alternate':'none'}}>
              {isListening?'escuchando…':isProcessing?'procesando…':'mantén para hablar'}
            </span>
          </div>
        </div>
      )}

      {/* ══ TAB: MANUAL ══════════════════════════════════════════ */}
      {tab==='manual'&&(
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <ManualComanda session={session} onSent={()=>{}} onVoiceMode={()=>setTab('hablar')}/>
        </div>
      )}

      {/* ══ TAB: PENDIENTES ══════════════════════════════════════ */}
      {tab==='pendientes'&&(
        <PendientesScreen session={session} turnoId={turnoId}/>
      )}

      {/* ══ TAB: CONFIG ══════════════════════════════════════════ */}
      {tab==='config'&&(
        <ConfigScreen
          session={session}
          voiceConfirm={voiceConfirm} onVoiceConfirm={v=>{setVoiceConfirm(v);saveConfig({voiceConfirm:v})}}
          zonaAsignada={zonaAsignada} onZona={v=>{setZonaAsignada(v);saveConfig({zonaAsignada:v})}}
          fontSize={fontSize} onFontSize={v=>{setFontSize(v);saveConfig({fontSize:v})}}
          alergenosMesa={alergenosMesa}
          onAlergenosMesa={()=>setMostrarAlergenos(true)}
          subscribed={subscribed} onSubscribe={subscribe}
          installPrompt={installPrompt} onInstall={install}
          onLogout={logout}
        />
      )}

      {/* ── BOTTOM NAV 4 tabs ── */}
      <div style={{display:'flex',background:C.bg1,borderTop:`1px solid ${C.rule}`,flexShrink:0}}>
        {([
          {id:'hablar',label:'Hablar',icon:(
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="12" rx="3"/>
              <path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
            </svg>)},
          {id:'manual',label:'Manual',icon:(
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h7M17.5 14v7"/>
            </svg>)},
          {id:'pendientes',label:'Pedidos',icon:(
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>)},
          {id:'config',label:'Config',icon:(
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>)},
        ] as {id:Tab;label:string;icon:React.ReactNode}[]).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:'9px 4px 13px',background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,position:'relative',color:tab===t.id?C.verm:C.txt4,transition:'color .15s'}}>
            {tab===t.id&&<div style={{position:'absolute',top:0,left:'22%',right:'22%',height:2,background:C.verm,borderRadius:'0 0 3px 3px'}}/>}
            {t.icon}
            <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px'}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── PENDIENTES ─────────────────────────────────────────────── */
function PendientesScreen({session,turnoId}:{session:{id:string;nombre:string;rol:string};turnoId:string|null}) {
  const [filtro,setFiltro]=useState('todas')
  const demo=[
    {id:'1',mesa:'Mesa 7',estado:'urgente',items:[{q:3,n:'Gambas al ajillo',nota:'sin guindilla'},{q:1,n:'Padrón',nota:null}],t:new Date(Date.now()-12*60000).toISOString(),who:'cocina'},
    {id:'2',mesa:'Mesa 4',estado:'cocina',items:[{q:2,n:'Croquetas caseras',nota:null},{q:1,n:'Salmorejo',nota:null}],t:new Date(Date.now()-4*60000).toISOString(),who:'frío'},
    {id:'3',mesa:'Mesa 11',estado:'lista',items:[{q:1,n:'Manchado sin azúcar',nota:null},{q:2,n:'Agua mineral',nota:null}],t:new Date(Date.now()-2*60000).toISOString(),who:'barra'},
  ]
  function timer(iso:string){const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);return `${Math.floor(s/60)}m ${s%60}s`}
  const visible=demo.filter(d=>filtro==='todas'||(filtro==='urgentes'&&d.estado==='urgente')||(filtro==='listas'&&d.estado==='lista')||(filtro==='cocina'&&d.estado==='cocina'))
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.rule}`,display:'flex',gap:5,overflowX:'auto',scrollbarWidth:'none' as const,flexShrink:0}}>
        {['todas','cocina','urgentes','listas'].map(f=>(
          <div key={f} onClick={()=>setFiltro(f)}
            style={{background:filtro===f?'rgba(217,68,43,.1)':C.bg2,border:`1px solid ${filtro===f?'rgba(217,68,43,.4)':C.rule}`,borderRadius:20,padding:'4px 11px',fontSize:11,fontWeight:500,color:filtro===f?C.verm:C.txt4,whiteSpace:'nowrap',cursor:'pointer',flexShrink:0}}>
            {f.charAt(0).toUpperCase()+f.slice(1)}{f==='todas'?` (${demo.length})`:f==='urgentes'?` (${demo.filter(d=>d.estado==='urgente').length})`:''}
          </div>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 16px',display:'flex',flexDirection:'column',gap:6}}>
        {visible.map(c=>{
          const urg=c.estado==='urgente';const done=c.estado==='lista'
          return(
            <div key={c.id} style={{background:C.bg2,border:`1px solid ${urg?'rgba(217,68,43,.35)':done?'rgba(63,125,68,.3)':C.bg3}`,borderRadius:12,overflow:'hidden',opacity:done?.65:1}}>
              <div style={{padding:'9px 13px',borderBottom:`1px solid ${C.rule}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontFamily:SE,fontStyle:'italic',fontSize:16}}>{c.mesa}</span>
                <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'.7px',padding:'3px 8px',borderRadius:20,background:urg?'rgba(217,68,43,.12)':done?'rgba(63,125,68,.1)':'rgba(232,163,59,.1)',color:urg?C.verm:done?C.green:C.amber}}>
                  {done?'✓ lista':urg?'⚡ urgente':'cocina'}
                </span>
              </div>
              <div style={{padding:'8px 13px 9px'}}>
                <div style={{display:'flex',flexDirection:'column',gap:3,marginBottom:6}}>
                  {c.items.map((it,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,opacity:done?.4:1,textDecoration:done?'line-through':'none'}}>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:15,color:C.verm,minWidth:14}}>{it.q}</span>
                      <span style={{fontSize:12,color:C.txt2}}>{it.n}</span>
                      {it.nota&&<span style={{fontFamily:SC,fontSize:11,color:C.amber,marginLeft:'auto'}}>{it.nota}</span>}
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontFamily:SM,fontSize:11,color:urg?C.verm:done?C.txt4:C.amber}}>{timer(c.t)}{urg?' ⚠':''}</span>
                  <span style={{fontSize:10,color:C.txt4}}>{session.nombre.split(' ')[0]} · {c.who}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── CONFIG SCREEN ──────────────────────────────────────────── */
function ConfigScreen({
  session, voiceConfirm, onVoiceConfirm, zonaAsignada, onZona,
  fontSize, onFontSize, alergenosMesa, onAlergenosMesa,
  subscribed, onSubscribe, installPrompt, onInstall, onLogout,
}:{
  session:{id:string;nombre:string;rol:string}
  voiceConfirm:boolean; onVoiceConfirm:(v:boolean)=>void
  zonaAsignada:string; onZona:(v:string)=>void
  fontSize:'normal'|'grande'; onFontSize:(v:'normal'|'grande')=>void
  alergenosMesa:string[]; onAlergenosMesa:()=>void
  subscribed:boolean; onSubscribe:()=>void
  installPrompt:unknown; onInstall:()=>void
  onLogout:()=>void
}) {
  const Row = ({label,sub,right}:{label:string;sub?:string;right:React.ReactNode})=>(
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
      <div>
        <div style={{fontSize:13,fontWeight:500}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:C.txt4,marginTop:2}}>{sub}</div>}
      </div>
      <div>{right}</div>
    </div>
  )
  const Toggle = ({on,onToggle}:{on:boolean;onToggle:()=>void})=>(
    <div onClick={onToggle} style={{width:44,height:24,borderRadius:12,background:on?C.verm:C.bg3,border:`1px solid ${on?C.vermD:C.bg3}`,position:'relative',cursor:'pointer',transition:'background .2s,border .2s',flexShrink:0}}>
      <div style={{position:'absolute',top:2,left:on?20:2,width:18,height:18,borderRadius:'50%',background:C.txt,boxShadow:'0 1px 4px rgba(0,0,0,.4)',transition:'left .2s'}}/>
    </div>
  )
  const Chip = ({label,on,onClick}:{label:string;on:boolean;onClick:()=>void})=>(
    <div onClick={onClick} style={{padding:'5px 12px',borderRadius:20,background:on?'rgba(217,68,43,.12)':C.bg2,border:`1px solid ${on?'rgba(217,68,43,.4)':C.rule}`,fontSize:12,fontWeight:on?600:400,color:on?C.verm:C.txt3,cursor:'pointer',transition:'all .12s'}}>
      {label}
    </div>
  )

  return (
    <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const}}>
      {/* Perfil */}
      <div style={{padding:'16px 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,paddingBottom:14,borderBottom:`1px solid ${C.rule}`}}>
          <div style={{width:44,height:44,borderRadius:'50%',background:`linear-gradient(135deg,${C.vermD},${C.verm})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:C.txt,flexShrink:0}}>
            {session.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:600}}>{session.nombre}</div>
            <div style={{fontSize:11,color:C.txt4,marginTop:1,textTransform:'capitalize'}}>{session.rol}</div>
          </div>
        </div>
      </div>

      <div style={{padding:'0 20px'}}>
        {/* Zona */}
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:8}}>Zona asignada</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['salon','terraza','barra'].map(z=>(
              <Chip key={z} label={z.charAt(0).toUpperCase()+z.slice(1)} on={zonaAsignada===z} onClick={()=>onZona(z)}/>
            ))}
          </div>
        </div>

        {/* VOX */}
        <Row label="Confirmación por voz" sub="BRAIN lee la comanda en voz alta antes de confirmar"
          right={<Toggle on={voiceConfirm} onToggle={()=>onVoiceConfirm(!voiceConfirm)}/>}/>

        {/* Alérgenos */}
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>Alérgenos de mesa</div>
              <div style={{fontSize:11,color:alergenosMesa.length>0?C.amber:C.txt4,marginTop:2}}>
                {alergenosMesa.length>0?alergenosMesa.join(', '):'Sin alérgenos declarados'}
              </div>
            </div>
            <button onClick={onAlergenosMesa}
              style={{background:alergenosMesa.length>0?'rgba(232,163,59,.12)':C.bg2,border:`1px solid ${alergenosMesa.length>0?C.amber:C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:alergenosMesa.length>0?C.amber:C.txt3,cursor:'pointer'}}>
              {alergenosMesa.length>0?'Editar':'Declarar'}
            </button>
          </div>
        </div>

        {/* Tamaño texto */}
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:8}}>Tamaño de texto</div>
          <div style={{display:'flex',gap:6}}>
            <Chip label="Normal" on={fontSize==='normal'} onClick={()=>onFontSize('normal')}/>
            <Chip label="Grande" on={fontSize==='grande'} onClick={()=>onFontSize('grande')}/>
          </div>
        </div>

        {/* Notificaciones */}
        {!subscribed&&(
          <Row label="Notificaciones push" sub="Recibe alertas cuando cocina marca listo"
            right={
              <button onClick={onSubscribe} style={{background:C.bg2,border:`1px solid ${C.amber}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:C.amber,cursor:'pointer'}}>
                Activar
              </button>
            }/>
        )}
        {subscribed&&(
          <Row label="Notificaciones" sub="Activas — recibirás alertas de cocina"
            right={<div style={{width:8,height:8,borderRadius:'50%',background:C.green,boxShadow:`0 0 6px ${C.green}`}}/>}/>
        )}

        {/* Instalar PWA */}
        {installPrompt&&(
          <Row label="Instalar app" sub="Añadir a pantalla de inicio"
            right={
              <button onClick={onInstall} style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:C.txt3,cursor:'pointer'}}>
                Instalar
              </button>
            }/>
        )}

        {/* Cerrar sesión */}
        <div style={{paddingTop:20,paddingBottom:32}}>
          <button onClick={onLogout} style={{width:'100%',padding:13,background:'transparent',border:`1px solid rgba(217,68,43,.3)`,borderRadius:10,fontFamily:SN,fontSize:13,fontWeight:600,color:C.verm,cursor:'pointer'}}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
