'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const C={bg:'#14110E',e1:'#1F1A15',e2:'#2A241D',fg:'#F6F1E7',fg2:'#C9BFAA',fg3:'#8D8270',rule:'#2F2820',rS:'#4A3F33',red:'#D9442B',rD:'#A8311E',amb:'#E8A33B',tl:'#2B6A6E',gr:'#3F7D44'}
const SN="'Inter Tight',system-ui,sans-serif"
const SE="'Newsreader',Georgia,serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

function WaveBars({active}:{active:boolean}){
  const h=[10,20,32,16,36,24,14,28,38,18,26,12,32,20,16,8,22,30,12,20]
  return(
    <div style={{display:'flex',alignItems:'center',gap:3,height:32}}>
      <style>{`@keyframes wv{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}`}</style>
      {h.map((v,i)=>(
        <div key={i} style={{width:3,background:i%2?C.red:C.fg,borderRadius:2,height:active?v:Math.max(3,v*.15),transformOrigin:'center',animation:active?`wv 1.1s ${(i*.05).toFixed(2)}s ease-in-out infinite`:'none',transition:'height 200ms'}}/>
      ))}
    </div>
  )
}

interface Session { id:string; nombre:string; rol:string }
interface Comanda { id:string; mesa?:{codigo:string}; tipo:string; numero_ticket:number; estado:string; items?:{nombre:string;cantidad:number}[]; created_at:string }

export default function EdgePage(){
  const router = useRouter()
  const [session,setSession]=useState<Session|null>(null)
  const [pin,setPin]=useState('')
  const [pinError,setPinError]=useState('')
  const [tab,setTab]=useState<'ptt'|'mesas'>('ptt')

  // PTT state
  const [screen,setScreen]=useState<'idle'|'recording'|'processing'|'confirm'|'sent'|'error'>('idle')
  const [transcript,setTranscript]=useState('')
  const [brain,setBrain]=useState<any>(null)
  const [latencia,setLatencia]=useState<number|null>(null)
  const [errMsg,setErrMsg]=useState('')
  const [turnoId,setTurnoId]=useState<string|null>(null)

  // Mis mesas / historial
  const [misComandasState,setMisComandasState]=useState<Comanda[]>([])

  const mediaRef=useRef<MediaRecorder|null>(null)
  const chunksRef=useRef<Blob[]>([])
  const holdRef=useRef(false)

  useEffect(()=>{
    const s=localStorage.getItem('ia_rest_session')
    if(s){
      const sess=JSON.parse(s)
      setSession(sess)
      if(sess.rol==='admin'){ router.push('/hub'); return }
      fetchTurno()
      fetchMisComandasFn(sess.id)
    }
  },[])

  const fetchTurno=async()=>{
    const r=await fetch('/api/turno')
    const d=await r.json()
    if(d.turno) setTurnoId(d.turno.id)
  }

  const fetchMisComandasFn=useCallback(async(camId?:string)=>{
    const id=camId||(session?.id||'')
    if(!id) return
    const {data}=await supabase
      .from('comandas')
      .select('*,mesa:mesas(codigo),items:comanda_items(*)')
      .eq('camarero_id',id)
      .order('created_at',{ascending:false})
      .limit(30)
    if(data) setMisComandasState(data)
  },[session?.id])

  // Realtime: actualizar mis comandas
  useEffect(()=>{
    if(!session?.id) return
    const ch=supabase.channel('mis-comandas')
      .on('postgres_changes',{event:'*',schema:'public',table:'comandas'},()=>fetchMisComandasFn())
      .subscribe()
    return()=>{supabase.removeChannel(ch)}
  },[session?.id,fetchMisComandasFn])

  const handleLogin=async()=>{
    if(pin.length<4){setPinError('Mínimo 4 dígitos');return}
    setPinError('')
    const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})})
    const d=await r.json()
    if(d.camarero){
      localStorage.setItem('ia_rest_session',JSON.stringify(d.camarero))
      setSession(d.camarero)
      if(d.camarero.rol==='admin'){ router.push('/hub'); return }
      fetchTurno()
      fetchMisComandasFn(d.camarero.id)
    } else { setPinError('PIN incorrecto') }
  }

  const logout=()=>{ localStorage.removeItem('ia_rest_session'); setSession(null); setPin('') }

  const startRec=useCallback(async()=>{
    if(screen!=='idle') return
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      chunksRef.current=[]
      const mr=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'})
      mr.ondataavailable=e=>{if(e.data.size>0) chunksRef.current.push(e.data)}
      mr.start(100); mediaRef.current=mr; holdRef.current=true
      setScreen('recording')
      if(navigator.vibrate) navigator.vibrate(50)
    }catch{ setErrMsg('Sin acceso al micrófono'); setScreen('error') }
  },[screen])

  const stopRec=useCallback(async()=>{
    if(!holdRef.current||!mediaRef.current) return
    holdRef.current=false; setScreen('processing')
    const mr=mediaRef.current
    await new Promise<void>(res=>{ mr.onstop=()=>res(); mr.stop() })
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
      if(d.ok){ setTranscript(d.texto); setBrain(d.brain); setLatencia(d.latencia_ms); setScreen('confirm'); if(navigator.vibrate) navigator.vibrate([30,50,30]) }
      else{ setErrMsg(d.error||'Error'); setScreen('error') }
    }catch{ setErrMsg('Error de red'); setScreen('error') }
  },[session?.id,turnoId])

  useEffect(()=>{
    const dn=(e:KeyboardEvent)=>{if(e.code==='Space'&&!e.repeat){e.preventDefault();startRec()}}
    const up=(e:KeyboardEvent)=>{if(e.code==='Space') stopRec()}
    window.addEventListener('keydown',dn); window.addEventListener('keyup',up)
    return()=>{window.removeEventListener('keydown',dn);window.removeEventListener('keyup',up)}
  },[startRec,stopRec])

  const sendComanda=async()=>{
    setScreen('sent')
    setTimeout(()=>fetchMisComandasFn(),1000)
  }

  // ── LOGIN ──────────────────────────────────────────────────
  if(!session) return(
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,gap:24}}>
      <svg width="52" height="52" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
      <div style={{fontFamily:SE,fontSize:28,color:C.fg,fontWeight:500,textAlign:'center'}}>ia<span style={{color:C.red}}>.</span>rest</div>
      <div style={{width:'100%',maxWidth:320,display:'flex',flexDirection:'column',gap:10}}>
        <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="PIN de acceso" value={pin}
          onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          style={{background:C.e1,border:`1px solid ${C.rS}`,borderRadius:4,padding:'14px 16px',fontFamily:SM,fontSize:20,color:C.fg,outline:'none',textAlign:'center',letterSpacing:'0.2em',width:'100%'}}
        />
        {pinError&&<div style={{fontFamily:SN,fontSize:12,color:C.red,textAlign:'center'}}>{pinError}</div>}
        <button onClick={handleLogin} style={{background:C.red,border:'none',borderRadius:4,padding:14,fontFamily:SN,fontSize:15,fontWeight:700,color:C.fg,cursor:'pointer'}}>Entrar</button>
      </div>
    </div>
  )

  // ── CAMARERO APP ───────────────────────────────────────────
  const estadoColor={nueva:C.amb,en_cocina:C.gr,lista:C.tl,entregada:C.fg3,cancelada:C.red}

  return(
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <style>{`@keyframes pulse{50%{opacity:.3}}@keyframes blink{50%{opacity:0}}@keyframes toastUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* TOP BAR */}
      <div style={{padding:'10px 16px 8px',borderBottom:`1px solid ${C.rule}`,background:C.bg,display:'flex',flexDirection:'column',gap:8,flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontFamily:SN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:screen==='recording'?C.tl:C.fg3,display:'flex',gap:6,alignItems:'center'}}>
            <span style={{width:6,height:6,borderRadius:999,background:screen==='recording'?C.tl:C.fg3,animation:screen==='recording'?'pulse 1.2s ease-in-out infinite':'none'}}/>
            {screen==='recording'?'EAR · escuchando':screen==='processing'?'BRAIN · procesando...':'EAR · en espera'}
          </span>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{session.nombre.split(' ')[0]}</span>
            <button onClick={logout} style={{background:'transparent',border:`1px solid ${C.rS}`,borderRadius:3,padding:'3px 8px',fontFamily:SN,fontSize:10,color:C.fg3,cursor:'pointer'}}>Salir</button>
          </div>
        </div>
        <WaveBars active={screen==='recording'}/>
      </div>

      {/* TABS */}
      <div style={{display:'flex',borderBottom:`1px solid ${C.rule}`,background:C.e1,flexShrink:0}}>
        {[{id:'ptt',label:'PTT · Voz'},{id:'mesas',label:`Mis comandas (${misComandasState.length})`}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{flex:1,padding:'10px',background:'transparent',border:'none',borderBottom:`2px solid ${tab===t.id?C.red:'transparent'}`,cursor:'pointer',fontFamily:SN,fontSize:12,fontWeight:700,color:tab===t.id?C.fg:C.fg3,letterSpacing:'0.04em'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* PTT TAB */}
      {tab==='ptt'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',overflow:'auto'}}>

            {screen==='idle'&&<div style={{fontFamily:SE,fontSize:20,color:C.fg,textAlign:'center',lineHeight:1.3,maxWidth:260,paddingTop:20}}>Mantén pulsado para hablar.</div>}
            {screen==='recording'&&<div style={{fontFamily:SM,fontSize:14,color:C.tl,letterSpacing:'0.04em',display:'flex',gap:6,alignItems:'center',paddingTop:20}}><span style={{width:6,height:6,borderRadius:999,background:C.tl,animation:'pulse 1.2s ease-in-out infinite'}}/>GRABANDO</div>}
            {screen==='processing'&&<div style={{fontFamily:SM,fontSize:13,color:C.fg3,paddingTop:20}}>Procesando...</div>}

            {screen==='confirm'&&brain&&(
              <div style={{width:'100%',display:'flex',flexDirection:'column',gap:12}}>
                <div style={{background:C.e1,border:`1px solid ${C.rule}`,borderRadius:8,padding:12}}>
                  <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'0.1em',marginBottom:6}}>EAR · {latencia}ms</div>
                  <div style={{fontFamily:SM,fontSize:13,color:C.fg,lineHeight:1.5}}>{`"${transcript}"`}</div>
                </div>
                <div style={{background:C.e1,border:`1px solid ${C.rS}`,borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                    <span style={{fontFamily:SE,fontSize:30,color:C.fg,fontWeight:500}}>{brain.mesa}</span>
                    <span style={{fontFamily:SN,fontSize:9,fontWeight:700,color:C.amb,textTransform:'uppercase',padding:'3px 8px',background:'rgba(232,163,59,.12)',borderRadius:999}}>{brain.tipo}</span>
                  </div>
                  <div style={{borderTop:`1px solid ${C.rule}`,paddingTop:10,display:'flex',flexDirection:'column',gap:6}}>
                    {brain.items?.map((it:any,i:number)=>(
                      <div key={i} style={{display:'flex',gap:10,fontFamily:SN,fontSize:15,color:C.fg}}>
                        <span style={{fontFamily:SM,fontWeight:700,color:C.red,width:28}}>{it.cantidad}x</span>{it.nombre}
                      </div>
                    ))}
                    {(!brain.items||brain.items.length===0)&&<div style={{fontFamily:SN,fontSize:13,color:C.fg3}}>Sin ítems</div>}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>setScreen('idle')} style={{flex:1,background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,padding:12,borderRadius:4,fontFamily:SN,fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
                    <button onClick={sendComanda} style={{flex:2,background:C.red,border:'none',color:C.fg,padding:12,borderRadius:4,fontFamily:SN,fontSize:14,fontWeight:700,cursor:'pointer'}}>Enviar</button>
                  </div>
                </div>
              </div>
            )}

            {screen==='sent'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,paddingTop:20}}>
                <div style={{width:64,height:64,borderRadius:999,background:'rgba(63,125,68,.15)',display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.gr}`}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
                </div>
                <div style={{fontFamily:SE,fontSize:22,color:C.fg,fontWeight:500}}>Enviado.</div>
                <div style={{fontFamily:SM,fontSize:11,color:C.fg3}}>{latencia}ms · {brain?.mesa}</div>
                <button onClick={()=>{setScreen('idle');setBrain(null);setTranscript('')}} style={{marginTop:16,background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,padding:'12px 24px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>Volver</button>
              </div>
            )}

            {screen==='error'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,paddingTop:20}}>
                <div style={{fontFamily:SM,fontSize:14,color:C.red}}>{errMsg}</div>
                <button onClick={()=>{setScreen('idle');setErrMsg('')}} style={{background:'transparent',border:`1px solid ${C.rS}`,color:C.fg2,padding:'12px 24px',borderRadius:4,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer'}}>Reintentar</button>
              </div>
            )}

            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,paddingBottom:10}}>
              <div style={{fontFamily:SM,fontSize:9,color:C.fg3,letterSpacing:'0.1em'}}>{screen==='recording'?'SUELTA PARA ENVIAR':'MANTÉN PULSADO'}</div>
              <button
                onMouseDown={startRec} onMouseUp={stopRec} onMouseLeave={stopRec}
                onTouchStart={e=>{e.preventDefault();startRec()}} onTouchEnd={e=>{e.preventDefault();stopRec()}}
                style={{width:160,height:160,borderRadius:999,border:`4px solid ${screen==='recording'?C.red:C.rS}`,background:screen==='recording'?C.red:C.e1,color:C.fg,fontFamily:SN,fontSize:14,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',cursor:'pointer',transition:'transform 120ms cubic-bezier(0.34,1.56,0.64,1),background 200ms',transform:screen==='recording'?'scale(0.95)':'scale(1)',boxShadow:screen==='recording'?'0 0 0 14px rgba(217,68,43,.15)':'0 8px 24px rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,userSelect:'none',WebkitUserSelect:'none',touchAction:'none'}}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="12" rx="3" fill={screen==='recording'?C.fg:'none'}/>
                  <path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
                {screen==='recording'?'Hablando':'PTT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MIS COMANDAS TAB */}
      {tab==='mesas'&&(
        <div style={{flex:1,overflow:'auto',padding:12}}>
          <div style={{fontFamily:SE,fontSize:18,fontWeight:500,color:C.fg,marginBottom:12}}>Mis comandas de hoy</div>
          {misComandasState.length===0&&<div style={{fontFamily:SM,fontSize:12,color:C.fg3,fontStyle:'italic'}}>Sin comandas todavía.</div>}
          {misComandasState.map(c=>(
            <div key={c.id} style={{background:C.e1,border:`1px solid ${C.rule}`,borderRadius:6,padding:12,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
                <span style={{fontFamily:SE,fontSize:20,color:C.fg,fontWeight:500}}>{c.mesa?.codigo||'—'}</span>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:999,background:`${(estadoColor as any)[c.estado]||C.fg3}22`,color:(estadoColor as any)[c.estado]||C.fg3,textTransform:'uppercase',border:`1px solid ${(estadoColor as any)[c.estado]||C.fg3}44`}}>{c.estado}</span>
                  <span style={{fontFamily:SM,fontSize:10,color:C.fg3}}>{new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              </div>
              {(c.items||[]).map((it,i)=>(
                <div key={i} style={{fontFamily:SN,fontSize:13,color:c.estado==='cancelada'?C.fg3:C.fg2,display:'flex',gap:8,padding:'2px 0',textDecoration:c.estado==='cancelada'?'line-through':'none'}}>
                  <span style={{fontFamily:SM,color:C.red,width:24}}>{it.cantidad}x</span>{it.nombre}
                </div>
              ))}
              {(c.items||[]).length===0&&<div style={{fontFamily:SN,fontSize:12,color:C.fg3}}>{c.tipo==='cuenta'?'Solicitud de cuenta':c.tipo==='marchar'?'Marchar':'—'}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
