'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const C={bg:'#14110E',e1:'#1F1A15',e2:'#2A241D',fg:'#F6F1E7',fg2:'#C9BFAA',fg3:'#8D8270',rule:'#2F2820',rS:'#4A3F33',red:'#D9442B',rD:'#A8311E',amb:'#E8A33B',tl:'#2B6A6E',gr:'#3F7D44'}
const SN="'Inter Tight',system-ui,sans-serif"
const SE="'Newsreader',Georgia,serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

type Screen='idle'|'recording'|'processing'|'confirm'|'sent'|'error'
interface Brain{mesa:string;tipo:string;items:{nombre:string;cantidad:number}[];confianza:number;raw:string}
interface Session{id:string;nombre:string;rol:string}
interface Comanda{id:string;mesa?:{codigo:string};tipo:string;items?:{nombre:string;cantidad:number}[];created_at:string;numero_ticket:number}

function WaveBars({active}:{active:boolean}){
  const h=[12,24,36,18,40,28,16,32,42,20]
  return(
    <div style={{display:'flex',alignItems:'center',gap:3,height:32}}>
      <style>{`@keyframes wv{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}`}</style>
      {h.map((v,i)=>(
        <div key={i} style={{width:3,background:i%2?C.red:C.fg,borderRadius:2,height:active?v:Math.max(3,v*.15),transformOrigin:'center',animation:active?`wv 1.1s ${(i*.07).toFixed(2)}s ease-in-out infinite`:'none',transition:'height .2s'}}/>
      ))}
    </div>
  )
}

export default function EdgePage(){
  const router=useRouter()
  const [session,setSession]=useState<Session|null>(null)
  const [pin,setPin]=useState('')
  const [loginErr,setLoginErr]=useState('')
  const [screen,setScreen]=useState<Screen>('idle')
  const [transcript,setTranscript]=useState('')
  const [brain,setBrain]=useState<Brain|null>(null)
  const [latencia,setLatencia]=useState<number|null>(null)
  const [errMsg,setErrMsg]=useState('')
  const [turnoId,setTurnoId]=useState<string|null>(null)
  const [historial,setHistorial]=useState<Comanda[]>([])
  const mediaRef=useRef<MediaRecorder|null>(null)
  const chunksRef=useRef<Blob[]>([])

  // Restore session
  useEffect(()=>{
    const s=localStorage.getItem('ia_session')
    if(s){
      const p=JSON.parse(s) as Session
      setSession(p)
      if(p.rol==='admin') router.replace('/hub')
      else{ fetchTurno(); fetchHistorial(p.id) }
    }
  },[])

  const fetchTurno=async()=>{
    const r=await fetch('/api/turno')
    const d=await r.json()
    if(d.turno) setTurnoId(d.turno.id)
  }

  const fetchHistorial=async(camId:string)=>{
    const {data}=await supabase
      .from('comandas')
      .select('id,tipo,numero_ticket,created_at,mesa:mesas(codigo),items:comanda_items(nombre,cantidad)')
      .eq('camarero_id',camId)
      .order('created_at',{ascending:false})
      .limit(20)
    if(data) setHistorial(data as any[])
  }

  const handleLogin=async()=>{
    if(pin.length<4){setLoginErr('PIN de 4 dígitos mínimo');return}
    const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})})
    const d=await r.json()
    if(d.camarero){
      localStorage.setItem('ia_session',JSON.stringify(d.camarero))
      setSession(d.camarero)
      setLoginErr('')
      if(d.camarero.rol==='admin') router.replace('/hub')
      else{ fetchTurno(); fetchHistorial(d.camarero.id) }
    } else {
      setLoginErr('PIN incorrecto')
      setPin('')
    }
  }

  const logout=()=>{localStorage.removeItem('ia_session');setSession(null);setPin('')}

  const startRec=useCallback(async()=>{
    if(screen!=='idle') return
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      chunksRef.current=[]
      const mr=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'})
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data)}
      mr.start(100)
      mediaRef.current=mr
      setScreen('recording')
      if(navigator.vibrate)navigator.vibrate(50)
    }catch{setErrMsg('Sin acceso al micrófono');setScreen('error')}
  },[screen])

  const stopRec=useCallback(async()=>{
    if(!mediaRef.current||screen!=='recording') return
    setScreen('processing')
    const mr=mediaRef.current
    await new Promise<void>(r=>{mr.onstop=()=>r();mr.stop()})
    mr.stream.getTracks().forEach(t=>t.stop())
    if(!chunksRef.current.length){setScreen('idle');return}
    const blob=new Blob(chunksRef.current,{type:'audio/webm'})
    const fd=new FormData()
    fd.append('audio',blob,'audio.webm')
    fd.append('camarero_id',session?.id||'demo')
    fd.append('turno_id',turnoId||'demo')
    try{
      const r=await fetch('/api/transcribe',{method:'POST',body:fd})
      const d=await r.json()
      if(d.ok){setTranscript(d.texto);setBrain(d.brain);setLatencia(d.latencia_ms);setScreen('confirm')}
      else{setErrMsg(d.error||'Error');setScreen('error')}
    }catch{setErrMsg('Error de red');setScreen('error')}
  },[screen,session,turnoId])

  const handleSend=()=>{
    setScreen('sent')
    if(navigator.vibrate)navigator.vibrate([30,50,30])
    if(session) fetchHistorial(session.id)
  }

  // Spacebar PTT
  useEffect(()=>{
    const dn=(e:KeyboardEvent)=>{if(e.code==='Space'&&!e.repeat){e.preventDefault();startRec()}}
    const up=(e:KeyboardEvent)=>{if(e.code==='Space'){e.preventDefault();stopRec()}}
    window.addEventListener('keydown',dn)
    window.addEventListener('keyup',up)
    return()=>{window.removeEventListener('keydown',dn);window.removeEventListener('keyup',up)}
  },[startRec,stopRec])

  const LOGO=()=>(
    <svg width="32" height="32" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/>
    <g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
  )

  // ─── LOGIN ───────────────────────────────────────────────
  if(!session) return(
    <div style={{minHeight:'100dvh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,gap:20}}>
      <LOGO/>
      <div style={{fontFamily:SE,fontSize:26,color:C.fg,fontWeight:500,textAlign:'center'}}>
        ia<span style={{color:C.red}}>.</span>rest
      </div>
      <div style={{width:'100%',maxWidth:320,display:'flex',flexDirection:'column',gap:10}}>
        <input
          type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          placeholder="PIN de acceso"
          value={pin} onChange={e=>setPin(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          autoFocus
          style={{background:C.e1,border:`1px solid ${pin.length>=4?C.red:C.rS}`,borderRadius:4,padding:'14px 16px',fontFamily:SM,fontSize:20,color:C.fg,outline:'none',textAlign:'center',letterSpacing:'0.3em',width:'100%',boxSizing:'border-box',transition:'border-color .2s'}}
        />
        {loginErr&&<div style={{fontFamily:SN,fontSize:12,color:C.red,textAlign:'center'}}>{loginErr}</div>}
        <button onClick={handleLogin} style={{background:C.red,border:'none',borderRadius:4,padding:14,fontFamily:SN,fontSize:15,fontWeight:700,color:C.fg,cursor:'pointer',width:'100%'}}>
          Entrar
        </button>
      </div>
      <div style={{fontFamily:SM,fontSize:10,color:C.fg3,letterSpacing:'.08em',textAlign:'center',marginTop:8}}>
        Admin → /hub automático
      </div>
    </div>
  )

  // ─── CAMARERO APP ────────────────────────────────────────
  return(
    <div style={{minHeight:'100dvh',background:C.bg,display:'flex',flexDirection:'column'}}>
      <style>{`@keyframes pulse{50%{opacity:.3}}@keyframes blink{50%{opacity:0}}@keyframes toastUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* TOP BAR */}
      <div style={{padding:'10px 16px 8px',borderBottom:`1px solid ${C.rule}`,background:C.bg,flexShrink:0,position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:SN,fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',
              color:screen==='recording'?C.tl:C.fg3,display:'flex',gap:5,alignItems:'center'}}>
              <span style={{width:6,height:6,borderRadius:999,background:screen==='recording'?C.tl:C.fg3,animation:screen==='recording'?'pulse 1.2s ease-in-out infinite':'none'}}/>
              {screen==='recording'?'EAR · escuchando':screen==='processing'?'BRAIN · procesando...':'EAR · en espera'}
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{session.nombre}</span>
            <button onClick={logout} style={{background:'transparent',border:`1px solid ${C.rS}`,borderRadius:3,padding:'3px 8px',fontFamily:SN,fontSize:10,color:C.fg3,cursor:'pointer'}}>Salir</button>
          </div>
        </div>
        <WaveBars active={screen==='recording'}/>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:'flex',flexDirection:'column',padding:'12px 16px',gap:12,overflowY:'auto',paddingBottom:220}}>

        {/* IDLE */}
        {screen==='idle'&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:120,gap:6}}>
            <div style={{fontFamily:SE,fontSize:18,color:C.fg2,textAlign:'center'}}>Mantén pulsado para hablar.</div>
            <div style={{fontFamily:SM,fontSize:10,color:C.fg3}}>o barra espaciadora en desktop</div>
          </div>
        )}

        {/* PROCESSING */}
        {screen==='processing'&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:100,gap:8}}>
            <div style={{fontFamily:SM,fontSize:11,color:C.fg3,animation:'pulse 1s ease-in-out infinite'}}>BRAIN procesando...</div>
          </div>
        )}

        {/* CONFIRM */}
        {screen==='confirm'&&brain&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:C.e1,border:`1px solid ${C.rule}`,borderRadius:6,padding:'10px 12px'}}>
              <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'.1em',marginBottom:5}}>EAR · {latencia}ms</div>
              <div style={{fontFamily:SM,fontSize:13,color:C.fg,lineHeight:1.5}}>"{transcript}"</div>
            </div>
            <div style={{background:C.e1,border:`1px solid ${C.rS}`,borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontFamily:SE,fontSize:30,color:C.fg,fontWeight:500}}>{brain.mesa}</span>
                <span style={{fontFamily:SN,fontSize:9,fontWeight:700,letterSpacing:'.08em',color:C.amb,textTransform:'uppercase',padding:'3px 8px',background:'rgba(232,163,59,.12)',borderRadius:999}}>{brain.tipo}</span>
              </div>
              <div style={{borderTop:`1px solid ${C.rule}`,paddingTop:10,display:'flex',flexDirection:'column',gap:5}}>
                {brain.items.map((it,i)=>(
                  <div key={i} style={{display:'flex',gap:10,fontFamily:SN,fontSize:15,color:C.fg}}>
                    <span style={{fontFamily:SM,fontWeight:700,color:C.red,width:26}}>{it.cantidad}x</span>{it.nombre}
                  </div>
                ))}
                {brain.items.length===0&&<div style={{fontFamily:SN,fontSize:13,color:C.fg3}}>Sin items</div>}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setScreen('idle')} style={{flex:1,background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,padding:12,borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
                <button onClick={handleSend} style={{flex:2,background:C.red,border:'none',color:C.fg,padding:12,borderRadius:4,fontFamily:SN,fontSize:14,fontWeight:700,cursor:'pointer'}}>Enviar</button>
              </div>
            </div>
          </div>
        )}

        {/* SENT */}
        {screen==='sent'&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:140,gap:14,animation:'toastUp .3s ease'}}>
            <div style={{width:56,height:56,borderRadius:999,background:'rgba(63,125,68,.15)',display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.gr}`}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
            </div>
            <div style={{fontFamily:SE,fontSize:20,color:C.fg,fontWeight:500}}>Enviado · {latencia}ms</div>
            <button onClick={()=>{setScreen('idle');setBrain(null);setTranscript('')}} style={{background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,padding:'10px 20px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>
              Nueva comanda
            </button>
          </div>
        )}

        {/* ERROR */}
        {screen==='error'&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:100,gap:12}}>
            <div style={{fontFamily:SM,fontSize:13,color:C.red}}>{errMsg}</div>
            <button onClick={()=>{setScreen('idle');setErrMsg('')}} style={{background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,padding:'10px 20px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>Reintentar</button>
          </div>
        )}

        {/* HISTORIAL - solo mis comandas */}
        {historial.length>0&&(screen==='idle'||screen==='sent')&&(
          <div>
            <div style={{fontFamily:SN,fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:C.fg3,marginBottom:8}}>Mi historial</div>
            <div style={{display:'flex',flexDirection:'column',gap:1}}>
              {historial.slice(0,10).map(c=>(
                <div key={c.id} style={{display:'flex',gap:10,padding:'9px 0',borderBottom:`1px solid ${C.rule}`,alignItems:'center'}}>
                  <span style={{fontFamily:SE,fontSize:16,fontWeight:500,color:C.fg,width:40,flexShrink:0}}>{c.mesa?.codigo||'—'}</span>
                  <span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:2,background:c.tipo==='86'?'rgba(217,68,43,.15)':'rgba(255,255,255,.06)',color:c.tipo==='86'?C.red:C.fg3,flexShrink:0,textTransform:'uppercase'}}>{c.tipo}</span>
                  <span style={{fontFamily:SN,fontSize:12,color:C.fg2,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {(c.items||[]).map(it=>`${it.cantidad}x ${it.nombre}`).join(', ')||'—'}
                  </span>
                  <span style={{fontFamily:SM,fontSize:10,color:C.fg3,flexShrink:0}}>{new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PTT BUTTON */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,padding:'8px 0 28px',display:'flex',flexDirection:'column',alignItems:'center',gap:6,background:`linear-gradient(180deg,transparent,${C.bg} 35%)`}}>
        <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'.1em'}}>
          {screen==='recording'?'SUELTA PARA ENVIAR':'MANTÉN PULSADO'}
        </div>
        <button
          onMouseDown={startRec} onMouseUp={stopRec} onMouseLeave={()=>{if(screen==='recording')stopRec()}}
          onTouchStart={e=>{e.preventDefault();startRec()}}
          onTouchEnd={e=>{e.preventDefault();stopRec()}}
          style={{width:160,height:160,borderRadius:999,border:`4px solid ${screen==='recording'?C.red:C.rS}`,background:screen==='recording'?C.red:C.e1,color:C.fg,fontFamily:SN,fontSize:14,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',cursor:'pointer',transition:'transform 120ms cubic-bezier(0.34,1.56,0.64,1),background .2s',transform:screen==='recording'?'scale(.95)':'scale(1)',boxShadow:screen==='recording'?'0 0 0 14px rgba(217,68,43,.15),0 0 0 28px rgba(217,68,43,.06)':'0 8px 24px rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:6,userSelect:'none',WebkitUserSelect:'none',touchAction:'none'}}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" fill={screen==='recording'?C.fg:'none'}/>
            <path d="M5 11a7 7 0 0 0 14 0"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
          </svg>
          {screen==='recording'?'Hablando':'PTT'}
        </button>
      </div>
    </div>
  )
}
