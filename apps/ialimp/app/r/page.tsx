'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const C = {
  primary: '#16a34a', light: '#f0fdf4', border: '#d1fae5',
  text: '#1e293b', muted: '#64748b', bg: '#f8fafc',
  warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

const TIPO_CFG: Record<string,{icon:string,label:string,color:string}> = {
  abrir_piso:        { icon:'🔑', label:'Abrir piso',        color:'#1d4ed8' },
  cerrar_piso:       { icon:'🔒', label:'Cerrar piso',       color:'#6d28d9' },
  recoger_ropa:      { icon:'👕', label:'Recoger ropa',      color:'#b45309' },
  entregar_material: { icon:'📦', label:'Entregar material', color:'#0f766e' },
  incidencia:        { icon:'⚠️', label:'Incidencia',        color:'#dc2626' },
  otro:              { icon:'📋', label:'Otra tarea',         color:'#475569' },
}

function fmtEta(min: number|null|undefined): string|null {
  if (!min) return null
  if (min < 2) return '< 1 min'
  if (min < 60) return `${min} min`
  return `${Math.floor(min/60)}h ${min%60}min`
}

function haversineKm(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

// ── CheckItem ─────────────────────────────────────────────────────────────
function CheckItem({ item, onChange, onFoto }:{item:any,onChange:(id:string,v:boolean)=>void,onFoto:(id:string)=>void}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
      <button onClick={()=>onChange(item.id,!item.completado)}
        style={{ flexShrink:0, width:28, height:28, borderRadius:8, border:`2px solid ${item.completado?C.primary:'#cbd5e1'}`, background:item.completado?C.primary:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:'white', fontWeight:700 }}>
        {item.completado?'✓':''}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:item.completado?C.muted:C.text, textDecoration:item.completado?'line-through':'none' }}>
          {item.texto}
          {item.obligatorio&&!item.completado&&<span style={{ color:C.red, marginLeft:4 }}>*</span>}
        </div>
        {item.foto_url&&<a href={item.foto_url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#1d4ed8', display:'block', marginTop:2 }}>📷 Ver foto</a>}
      </div>
      <button onClick={()=>onFoto(item.id)}
        style={{ flexShrink:0, width:36, height:36, borderRadius:10, border:`1.5px solid ${item.foto_url?C.primary:C.border}`, background:item.foto_url?'#dcfce7':'white', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}
        title={item.requiere_foto?'Foto obligatoria':'Añadir foto'}>
        {item.foto_url?'✅':item.requiere_foto?'📸':'📷'}
      </button>
    </div>
  )
}

// ── SignaturePad ──────────────────────────────────────────────────────────
function SignaturePad({ onSave, onClear }:{onSave:(blob:Blob)=>void,onClear:()=>void}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasMark = useRef(false)

  function getPos(e: React.MouseEvent|React.TouchEvent, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }
    }
    return { x: (e as React.MouseEvent).clientX - r.left, y: (e as React.MouseEvent).clientY - r.top }
  }

  function start(e: React.MouseEvent|React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    drawing.current = true; hasMark.current = true
    const {x,y} = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(x,y)
  }
  function move(e: React.MouseEvent|React.TouchEvent) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const {x,y} = getPos(e, canvas)
    ctx.lineTo(x,y); ctx.strokeStyle='#1e293b'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.stroke()
  }
  function end() { drawing.current = false }

  function clear() {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')!.clearRect(0,0,canvas.width,canvas.height)
    hasMark.current = false; onClear()
  }

  function save() {
    const canvas = canvasRef.current; if (!canvas || !hasMark.current) return
    canvas.toBlob(b => { if (b) onSave(b) }, 'image/png')
  }

  return (
    <div style={{ marginTop:12 }}>
      <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }}>✍️ Firma del receptor (opcional)</div>
      <canvas ref={canvasRef} width={320} height={100}
        style={{ width:'100%', height:100, border:`1.5px solid ${C.border}`, borderRadius:10, background:'#fafafa', touchAction:'none', cursor:'crosshair', display:'block' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ display:'flex', gap:8, marginTop:6 }}>
        <button onClick={clear} style={{ flex:1, padding:'6px 0', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>🗑 Limpiar</button>
        <button onClick={save} style={{ flex:1, padding:'6px 0', borderRadius:8, border:`1px solid ${C.primary}`, background:C.light, color:C.primary, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>✅ Guardar firma</button>
      </div>
    </div>
  )
}

// ── ModalChat ─────────────────────────────────────────────────────────────
function ModalChat({ parada, onClose }:{parada:any, onClose:()=>void}) {
  const [mensajes, setMensajes] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/r/chat?parada_id=${parada.id}`)
    if (r.ok) { const d = await r.json(); setMensajes(d.mensajes||[]) }
  }, [parada.id])

  useEffect(() => { cargar(); const iv = setInterval(cargar,5000); return ()=>clearInterval(iv) }, [cargar])
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [mensajes])

  async function enviar() {
    if (!texto.trim()) return
    setEnviando(true)
    await fetch('/api/r/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parada_id:parada.id, mensaje:texto.trim()}) })
    setTexto(''); setEnviando(false); cargar()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:100, display:'flex', alignItems:'flex-end' }} onClick={onClose}>
      <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'75vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'16px 20px 12px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 12px' }}/>
          <div style={{ fontWeight:800, fontSize:16, color:C.text }}>💬 Chat con {parada.limpiadora_nombre}</div>
          <div style={{ fontSize:12, color:C.muted }}>{parada.titulo}</div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
          {mensajes.length===0 && <div style={{ textAlign:'center', color:C.muted, fontSize:13, padding:'24px 0' }}>Sin mensajes aún</div>}
          {mensajes.map((m:any) => (
            <div key={m.id} style={{ display:'flex', justifyContent:m.from_type==='repartidor'?'flex-end':'flex-start' }}>
              <div style={{ maxWidth:'80%', padding:'8px 12px', borderRadius:14, background:m.from_type==='repartidor'?C.primary:'#f1f5f9', color:m.from_type==='repartidor'?'white':C.text, fontSize:13 }}>
                {m.from_type!=='repartidor'&&<div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:2 }}>{m.from_nombre}</div>}
                {m.mensaje}
                <div style={{ fontSize:9, color:m.from_type==='repartidor'?'rgba(255,255,255,.6)':C.muted, marginTop:2 }}>{new Date(m.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
        <div style={{ padding:'10px 16px 28px', display:'flex', gap:8, flexShrink:0, borderTop:`1px solid ${C.border}` }}>
          <input value={texto} onChange={e=>setTexto(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&enviar()}
            placeholder="Escribe un mensaje..." style={{ flex:1, padding:'10px 14px', borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none' }}/>
          <button onClick={enviar} disabled={enviando||!texto.trim()}
            style={{ padding:'0 16px', borderRadius:12, background:texto.trim()?C.primary:'#e2e8f0', color:texto.trim()?'white':'#94a3b8', border:'none', cursor:texto.trim()?'pointer':'not-allowed', fontSize:18, fontFamily:'inherit' }}>
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ModalScan ─────────────────────────────────────────────────────────────
function ModalScan({ parada, onClose, onConfirmado }:{parada:any, onClose:()=>void, onConfirmado:()=>void}) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream|null>(null)
  const rafRef    = useRef<number>(0)
  const [estado, setEstado] = useState<'scanning'|'ok'|'error'>('scanning')
  const [manual,  setManual]  = useState('')
  const [usarManual, setUsarManual] = useState(false)
  const soportaDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window

  useEffect(() => {
    if (usarManual) return
    if (!soportaDetector) { setUsarManual(true); return }
    let detector: any
    navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      detector = new (window as any).BarcodeDetector({ formats:['qr_code','code_128','code_39','ean_13','ean_8'] })
      function scan() {
        if (!videoRef.current || estado!=='scanning') return
        detector.detect(videoRef.current).then((results: any[]) => {
          for (const r of results) {
            if (r.rawValue === parada.codigo_bulto) {
              setEstado('ok'); stopCamera(); return
            }
          }
        }).catch(()=>{})
        rafRef.current = requestAnimationFrame(scan)
      }
      rafRef.current = requestAnimationFrame(scan)
    }).catch(()=>{ setUsarManual(true) })
    return () => stopCamera()
  }, [usarManual])

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t=>t.stop())
  }

  function verificarManual() {
    if (manual.trim() === parada.codigo_bulto) setEstado('ok')
    else setEstado('error')
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:110, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:20, width:'90%', maxWidth:360, overflow:'hidden' }}>
        <div style={{ background:estado==='ok'?C.primary:estado==='error'?C.red:'#1e293b', padding:'16px 20px', textAlign:'center', color:'white' }}>
          <div style={{ fontSize:28, marginBottom:4 }}>{estado==='ok'?'✅':estado==='error'?'❌':'📷'}</div>
          <div style={{ fontWeight:800, fontSize:16 }}>
            {estado==='ok'?'¡Bulto confirmado!':estado==='error'?'Código incorrecto':'Escanear bulto'}
          </div>
          <div style={{ fontSize:12, opacity:.7, marginTop:2 }}>Código esperado: {parada.codigo_bulto}</div>
        </div>
        <div style={{ padding:20 }}>
          {estado==='scanning' && !usarManual && (
            <video ref={videoRef} muted playsInline style={{ width:'100%', borderRadius:12, background:'#000', aspectRatio:'4/3', display:'block' }}/>
          )}
          {estado==='scanning' && usarManual && (
            <div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>Tu navegador no soporta lectura automática. Introduce el código manualmente:</div>
              <input value={manual} onChange={e=>setManual(e.target.value)} placeholder={parada.codigo_bulto}
                style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', marginBottom:10 }}/>
              <button onClick={verificarManual} style={{ width:'100%', padding:11, borderRadius:12, background:C.primary, color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Verificar</button>
            </div>
          )}
          {estado!=='scanning' && (
            <div style={{ marginTop:0 }}>
              {estado==='ok' ? (
                <button onClick={()=>{onConfirmado();onClose()}} style={{ width:'100%', padding:13, borderRadius:12, background:C.primary, color:'white', border:'none', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>Continuar ✓</button>
              ) : (
                <button onClick={()=>setEstado('scanning')} style={{ width:'100%', padding:13, borderRadius:12, background:'#f1f5f9', color:C.text, border:'none', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Reintentar</button>
              )}
            </div>
          )}
          <button onClick={onClose} style={{ marginTop:10, width:'100%', padding:10, borderRadius:12, background:'transparent', color:C.muted, fontSize:13, fontWeight:600, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── ModalIncidencia ───────────────────────────────────────────────────────
function ModalIncidencia({ parada, onClose }:{parada:any, onClose:()=>void}) {
  const [tipo, setTipo] = useState('')
  const [nota, setNota] = useState('')
  const [fotoUrl, setFotoUrl] = useState<string|null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const TIPOS = ['Piso cerrado','Llave no funciona','Cliente ausente','Acceso bloqueado','Material incorrecto','Otro']

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const form = new FormData(); form.append('file',file); form.append('parada_id',parada.id)
    const r = await fetch('/api/r/upload-foto',{method:'POST',body:form})
    const d = await r.json(); if (d.url) setFotoUrl(d.url)
    e.target.value=''
  }

  async function enviar() {
    if (!tipo) return
    setEnviando(true)
    await fetch('/api/r/incidencias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parada_id:parada.id,tipo_incidencia:tipo,nota,foto_url:fotoUrl})})
    setEnviando(false); setEnviado(true)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:100, display:'flex', alignItems:'flex-end' }} onClick={onClose}>
      <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'16px 20px 12px', flexShrink:0 }}>
          <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 12px' }}/>
          <div style={{ fontWeight:800, fontSize:17, color:C.red }}>🚨 Reportar problema</div>
          <div style={{ fontSize:12, color:C.muted }}>{parada.titulo}</div>
        </div>
        {!enviado ? (
          <div style={{ flex:1, overflowY:'auto', padding:'0 20px 28px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:8 }}>Tipo de problema</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
              {TIPOS.map(t=>(
                <button key={t} onClick={()=>setTipo(t)} style={{ padding:'8px 14px', borderRadius:20, border:`1.5px solid ${tipo===t?C.red:C.border}`, background:tipo===t?C.redBg:'white', color:tipo===t?C.red:C.text, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{t}</button>
              ))}
            </div>
            <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Detalle adicional (opcional)"
              style={{ width:'100%', minHeight:64, padding:'10px 12px', borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', color:C.text, marginBottom:12 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>fotoRef.current?.click()} style={{ flex:1, padding:11, borderRadius:12, border:`1.5px solid ${fotoUrl?C.primary:C.border}`, background:fotoUrl?C.light:'white', color:fotoUrl?C.primary:C.muted, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                {fotoUrl?'📷 Foto añadida':'📷 Añadir foto'}
              </button>
              <button onClick={enviar} disabled={!tipo||enviando} style={{ flex:2, padding:11, borderRadius:12, background:tipo?C.red:'#e2e8f0', color:tipo?'white':'#94a3b8', border:'none', fontSize:14, fontWeight:800, cursor:tipo?'pointer':'not-allowed', fontFamily:'inherit' }}>
                {enviando?'Enviando...':'Enviar alerta 🚨'}
              </button>
            </div>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={onFoto}/>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 20px 48px', textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:800, fontSize:16, color:C.text }}>Alerta enviada al admin</div>
            <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>Recibirás respuesta en breve.</div>
            <button onClick={onClose} style={{ marginTop:24, padding:'10px 32px', borderRadius:12, background:C.primary, color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ModalCompletar ────────────────────────────────────────────────────────
function ModalCompletar({ parada, onClose, onParadaCompletada }:{parada:any, onClose:()=>void, onParadaCompletada:()=>void}) {
  const cfg = TIPO_CFG[parada.tipo] || TIPO_CFG.otro
  const [items,   setItems]   = useState<any[]>([])
  const [nota,    setNota]    = useState('')
  const [firmaUrl,setFirmaUrl]= useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string|null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [fotoItemId, setFotoItemId] = useState<string|null>(null)

  useEffect(() => {
    fetch(`/api/r/paradas/items?parada_id=${parada.id}`)
      .then(r=>r.json()).then(d=>{ setItems(d.items||[]); setLoading(false) })
  }, [parada.id])

  async function toggleItem(id:string,completado:boolean) {
    setItems(prev=>prev.map(it=>it.id===id?{...it,completado}:it))
    await fetch('/api/r/paradas/items',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({item_id:id,completado}) })
  }

  function abrirCamara(id:string) { setFotoItemId(id); fotoInputRef.current?.click() }

  async function onFotoChange(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]; if(!file||!fotoItemId) return
    const form=new FormData(); form.append('file',file); form.append('item_id',fotoItemId); form.append('parada_id',parada.id)
    const res=await fetch('/api/r/upload-foto',{method:'POST',body:form})
    const data=await res.json()
    if(data.url){
      await fetch('/api/r/paradas/items',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({item_id:fotoItemId,completado:true,foto_url:data.url}) })
      setItems(prev=>prev.map(it=>it.id===fotoItemId?{...it,foto_url:data.url,completado:true}:it))
    }
    setFotoItemId(null); e.target.value=''
  }

  async function guardarFirma(blob:Blob) {
    const form=new FormData(); form.append('file',new File([blob],'firma.png',{type:'image/png'})); form.append('parada_id',parada.id)
    const r=await fetch('/api/r/upload-foto',{method:'POST',body:form})
    const d=await r.json(); if(d.url) setFirmaUrl(d.url)
  }

  async function confirmar() {
    setSaving(true); setErr(null)
    const res=await fetch('/api/r/paradas',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parada_id:parada.id,nota_completada:nota,firma_url:firmaUrl}) })
    if(!res.ok){ const d=await res.json(); setErr(d.error||'Error al completar'); setSaving(false); return }
    setSaving(false); onParadaCompletada(); onClose()
  }

  const obligPendientes=items.filter(it=>it.obligatorio&&!it.completado).length
  const fotosPendientes=items.filter(it=>it.requiere_foto&&!it.foto_url).length
  const puedeCompletar=obligPendientes===0&&fotosPendientes===0

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:100, display:'flex', alignItems:'flex-end' }} onClick={onClose}>
      <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'92vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'16px 20px 0', flexShrink:0 }}>
          <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 16px' }}/>
          <div style={{ fontSize:18, fontWeight:800, color:C.text }}>{cfg.icon} {parada.titulo}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{cfg.label}</div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 20px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:C.muted }}>Cargando checklist...</div>
          ) : items.length===0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:13 }}>Sin checklist — puedes completar directamente.</div>
          ) : (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
                Checklist ({items.filter(i=>i.completado).length}/{items.length})
              </div>
              {items.map(it=><CheckItem key={it.id} item={it} onChange={toggleItem} onFoto={abrirCamara}/>)}
            </div>
          )}

          <SignaturePad onSave={guardarFirma} onClear={()=>setFirmaUrl(null)}/>
          {firmaUrl&&<div style={{ fontSize:11, color:C.primary, fontWeight:700, marginTop:4 }}>✅ Firma guardada</div>}

          <div style={{ marginTop:16 }}>
            <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Nota opcional (p.ej. 'llave dejada en buzón')"
              style={{ width:'100%', minHeight:72, padding:'10px 12px', borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', color:C.text }}/>
          </div>

          {(obligPendientes>0||fotosPendientes>0)&&(
            <div style={{ marginTop:8, padding:'8px 12px', borderRadius:10, background:'#fef2f2', border:'1px solid #fecaca', fontSize:13, color:C.red, fontWeight:600 }}>
              {obligPendientes>0&&`⚠️ ${obligPendientes} item${obligPendientes>1?'s':''} obligatorio${obligPendientes>1?'s':''} sin marcar. `}
              {fotosPendientes>0&&`📸 ${fotosPendientes} foto${fotosPendientes>1?'s':''} pendiente${fotosPendientes>1?'s':''}.`}
            </div>
          )}
          {err&&<div style={{ marginTop:8, padding:'8px 12px', borderRadius:10, background:'#fef2f2', fontSize:13, color:C.red, fontWeight:600 }}>{err}</div>}
        </div>

        <div style={{ padding:'12px 20px 28px', flexShrink:0 }}>
          <button onClick={confirmar} disabled={!puedeCompletar||saving}
            style={{ width:'100%', padding:14, borderRadius:14, background:puedeCompletar?`linear-gradient(135deg,${cfg.color},${cfg.color}cc)`:'#e2e8f0', color:puedeCompletar?'white':'#94a3b8', fontSize:15, fontWeight:800, border:'none', cursor:puedeCompletar?'pointer':'not-allowed', fontFamily:'inherit', minHeight:52 }}>
            {saving?'Guardando...':puedeCompletar?`${cfg.icon} Completar parada`:`Completa el checklist (${obligPendientes+fotosPendientes} pendiente${obligPendientes+fotosPendientes>1?'s':''})`}
          </button>
          <button onClick={onClose} style={{ marginTop:8, width:'100%', padding:10, borderRadius:12, background:'transparent', color:C.muted, fontSize:14, fontWeight:600, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
        </div>
        <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={onFotoChange}/>
      </div>
    </div>
  )
}

// ── ParadaCard ────────────────────────────────────────────────────────────
function ParadaCard({ p, onCompletar, onChat, onScan, onIncidencia }:{p:any, onCompletar:(p:any)=>void, onChat:(p:any)=>void, onScan:(p:any)=>void, onIncidencia:(p:any)=>void}) {
  const cfg=TIPO_CFG[p.tipo]||TIPO_CFG.otro
  const eta=fmtEta(p.eta_minutos)
  const tieneItems=p.items_total>0

  return (
    <div style={{ background:p.completada?'#f0fdf4':'white', borderRadius:16, border:`1.5px solid ${p.completada?'#86efac':C.border}`, overflow:'hidden', opacity:p.completada?0.7:1, boxShadow:p.completada?'none':'0 2px 8px rgba(0,0,0,.06)' }}>
      {/* Cabecera */}
      <div style={{ background:p.completada?'#dcfce7':'#f8fafc', borderBottom:`1px solid ${p.completada?'#86efac':C.border}`, padding:'8px 14px', display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:18 }}>{cfg.icon}</span>
          <span style={{ fontSize:12, fontWeight:700, color:p.completada?'#16a34a':cfg.color }}>{cfg.label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {eta&&!p.completada&&<span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', borderRadius:8, padding:'2px 8px', fontWeight:700 }}>🗺 {eta}</span>}
          {tieneItems&&<span style={{ fontSize:11, borderRadius:8, padding:'2px 8px', fontWeight:700, background:p.completada||p.items_ok===p.items_total?'#dcfce7':'#fef9c3', color:p.completada||p.items_ok===p.items_total?'#16a34a':'#854d0e' }}>✓ {p.items_ok}/{p.items_total}</span>}
          {p.completada&&<span style={{ fontSize:11, color:'#16a34a', fontWeight:700 }}>✓ Completada</span>}
          {!p.completada&&<span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>#{p.orden+1}</span>}
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ padding:'12px 14px' }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.text, marginBottom:2 }}>{p.titulo}</div>
        {p.propiedad_nombre&&<div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>🏠 {p.propiedad_nombre}</div>}
        {p.direccion&&(
          <a href={`https://maps.google.com/?q=${encodeURIComponent(p.direccion)}`} target="_blank" rel="noreferrer"
            style={{ fontSize:12, color:'#1d4ed8', display:'block', marginBottom:4, textDecoration:'none', fontWeight:600 }}>
            📍 {p.direccion} ↗
          </a>
        )}
        {p.limpiadora_nombre&&<div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>🧹 {p.limpiadora_nombre}</div>}
        {p.codigo_bulto&&!p.completada&&<div style={{ fontSize:11, color:'#0f766e', fontWeight:700, marginBottom:4 }}>📦 Bulto: {p.codigo_bulto}</div>}
        {p.notas&&<div style={{ fontSize:12, color:C.muted, background:C.bg, borderRadius:8, padding:'6px 10px', marginTop:4 }}>📝 {p.notas}</div>}
        {p.completada&&p.nota_completada&&<div style={{ marginTop:8, fontSize:12, color:'#16a34a', fontStyle:'italic' }}>"{p.nota_completada}"</div>}
        {p.completada&&p.firma_url&&<div style={{ marginTop:6 }}><a href={p.firma_url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#1d4ed8' }}>✍️ Ver firma</a></div>}

        {!p.completada&&(
          <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
            {/* Botones de acción secundarios */}
            <div style={{ display:'flex', gap:6 }}>
              {p.limpiadora_nombre&&(
                <button onClick={()=>onChat(p)} style={{ flex:1, padding:'8px 0', borderRadius:10, border:`1.5px solid ${C.border}`, background:'white', color:C.text, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  💬 Chat
                </button>
              )}
              {p.codigo_bulto&&(
                <button onClick={()=>onScan(p)} style={{ flex:1, padding:'8px 0', borderRadius:10, border:'1.5px solid #0f766e', background:'#f0fdfa', color:'#0f766e', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  📷 Escanear
                </button>
              )}
              <button onClick={()=>onIncidencia(p)} style={{ flex:1, padding:'8px 0', borderRadius:10, border:`1.5px solid ${C.red}`, background:'#fef2f2', color:C.red, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                🚨 Problema
              </button>
            </div>
            {/* Botón principal */}
            <button onClick={()=>onCompletar(p)}
              style={{ width:'100%', padding:11, borderRadius:12, background:`linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, color:'white', fontSize:14, fontWeight:800, border:'none', cursor:'pointer', fontFamily:'inherit', minHeight:44 }}>
              {tieneItems?`${cfg.icon} Ver checklist y completar`:`${cfg.icon} Marcar como hecha`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────
export default function RepartidorPage() {
  const router=useRouter()
  const [rep,       setRep]       = useState<any>(null)
  const [paradas,   setParadas]   = useState<any[]>([])
  const [notifs,    setNotifs]    = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState<any>(null)
  const [modalChat, setModalChat] = useState<any>(null)
  const [modalScan, setModalScan] = useState<any>(null)
  const [modalInc,  setModalInc]  = useState<any>(null)
  const [geoError,  setGeoError]  = useState<string|null>(null)
  const [optimizando,setOptimizando]=useState(false)
  const posActual   = useRef<{lat:number,lng:number}|null>(null)
  const watchRef    = useRef<number|null>(null)
  const lastPosSent = useRef<number>(0)

  useEffect(() => {
    fetch('/api/r/auth').then(r=>r.json()).then(d=>{
      if(!d.repartidor){ router.replace('/r/login'); return }
      setRep(d.repartidor); cargarParadas(); cargarNotifs()
    })
  }, [])

  const cargarParadas=useCallback(async()=>{
    setLoading(true)
    const res=await fetch('/api/r/paradas')
    if(res.ok){ const d=await res.json(); setParadas(d.paradas||[]) }
    setLoading(false)
  },[])

  const cargarNotifs=useCallback(async()=>{
    const res=await fetch('/api/r/notificaciones')
    if(res.ok){ const d=await res.json(); setNotifs(d.notificaciones||[]) }
  },[])

  useEffect(()=>{
    if(!navigator.geolocation){ setGeoError('Tu dispositivo no soporta geolocalización'); return }
    watchRef.current=navigator.geolocation.watchPosition(
      (pos)=>{
        posActual.current={ lat:pos.coords.latitude, lng:pos.coords.longitude }
        const now=Date.now()
        if(now-lastPosSent.current<30_000) return
        lastPosSent.current=now
        fetch('/api/r/posicion',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ lat:pos.coords.latitude, lng:pos.coords.longitude, precision_m:pos.coords.accuracy, speed_kmh:pos.coords.speed?pos.coords.speed*3.6:null }),
        }).then(r=>r.ok?r.json():null).then(d=>{
          if(d?.eta_minutos!=null) setParadas(prev=>prev.map(p=>!p.completada?{...p,eta_minutos:d.eta_minutos}:p))
        })
      },
      (err)=>{ if(err.code===1) setGeoError('Permiso de ubicación denegado') },
      { enableHighAccuracy:true, maximumAge:15_000, timeout:20_000 }
    )
    return()=>{ if(watchRef.current!=null) navigator.geolocation.clearWatch(watchRef.current) }
  },[])

  useEffect(()=>{
    const iv=setInterval(cargarNotifs,45_000); return()=>clearInterval(iv)
  },[])

  async function optimizarRuta() {
    if(!posActual.current){ alert('Activa la geolocalización para optimizar la ruta'); return }
    const pendientes=paradas.filter(p=>!p.completada&&p.propiedad_lat&&p.propiedad_lng)
    if(pendientes.length<2) return
    setOptimizando(true)
    // Nearest-neighbor desde posición actual
    let restantes=[...pendientes]
    const ordenado:any[]=[]
    let lat=posActual.current.lat, lng=posActual.current.lng
    while(restantes.length){
      let minDist=Infinity, minIdx=0
      restantes.forEach((p,i)=>{
        const d=haversineKm(lat,lng,p.propiedad_lat,p.propiedad_lng)
        if(d<minDist){ minDist=d; minIdx=i }
      })
      const next=restantes.splice(minIdx,1)[0]
      ordenado.push(next)
      lat=next.propiedad_lat; lng=next.propiedad_lng
    }
    const nuevoOrden=ordenado.map((p,i)=>({id:p.id,orden:i}))
    await fetch('/api/r/paradas/reordenar',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({orden:nuevoOrden}) })
    setOptimizando(false); cargarParadas()
  }

  async function logout() {
    await fetch('/api/r/auth',{method:'DELETE'}); router.replace('/r/login')
  }

  const pendientes=paradas.filter(p=>!p.completada)
  const completadas=paradas.filter(p=>p.completada)
  const notifsNuevas=notifs.filter(n=>!n.leida)

  if(loading&&!rep) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ textAlign:'center', color:C.muted }}>
        <div style={{ fontSize:32 }}>🚐</div>
        <div style={{ fontWeight:600, marginTop:8 }}>Cargando...</div>
      </div>
    </div>
  )

  return (
    <>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Nunito',-apple-system,sans-serif; }`}</style>
      <div style={{ minHeight:'100dvh', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(160deg,${C.primary} 0%,#15803d 100%)`, position:'sticky', top:0, zIndex:50 }}>
          <div style={{ padding:'clamp(14px,4vw,20px) clamp(14px,4vw,20px) 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:'clamp(17px,4vw,20px)', fontWeight:800, color:'white' }}>🚐 {rep?.nombre||'Repartidor'}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.65)', marginTop:2 }}>{pendientes.length} parada{pendientes.length!==1?'s':''} pendiente{pendientes.length!==1?'s':''}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {notifsNuevas.length>0&&<div style={{ background:'#fbbf24', borderRadius:10, padding:'3px 8px', fontSize:12, fontWeight:800, color:'white' }}>🔔 {notifsNuevas.length}</div>}
              {pendientes.filter(p=>p.propiedad_lat).length>=2&&(
                <button onClick={optimizarRuta} disabled={optimizando}
                  style={{ padding:'6px 10px', borderRadius:10, background:'rgba(255,255,255,.2)', color:'white', fontSize:11, fontWeight:700, border:'1px solid rgba(255,255,255,.3)', cursor:'pointer', fontFamily:'inherit' }}>
                  {optimizando?'..':'🗺 Ruta'}
                </button>
              )}
              <button onClick={logout} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(255,255,255,.2)', color:'white', fontSize:12, fontWeight:700, border:'1px solid rgba(255,255,255,.3)', cursor:'pointer', fontFamily:'inherit' }}>Salir</button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'rgba(255,255,255,.1)' }}>
            {[{label:'Pendientes',val:pendientes.length,icon:'⏳'},{label:'Completadas',val:completadas.length,icon:'✅'},{label:'Total hoy',val:paradas.length,icon:'📋'}].map(k=>(
              <div key={k.label} style={{ padding:10, textAlign:'center', background:'rgba(0,0,0,.08)' }}>
                <div style={{ fontSize:'clamp(18px,4.5vw,22px)', fontWeight:800, color:'white' }}>{k.icon} {k.val}</div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'14px clamp(12px,4vw,20px)', maxWidth:600, margin:'0 auto' }}>
          {geoError&&(
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'10px 14px', marginBottom:12, fontSize:13, color:C.red, fontWeight:600 }}>
              📍 {geoError} — sin ETA ni optimización de ruta
            </div>
          )}

          {notifsNuevas.length>0&&(
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>🔔 Avisos nuevos</div>
              {notifsNuevas.map((n:any)=>(
                <div key={n.id} style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:'10px 14px', marginBottom:6 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#92400e' }}>{n.titulo}</div>
                  {n.cuerpo&&<div style={{ fontSize:12, color:'#a16207', marginTop:2 }}>{n.cuerpo}</div>}
                </div>
              ))}
            </div>
          )}

          {!loading&&paradas.length===0&&(
            <div style={{ textAlign:'center', padding:'60px 0', color:C.muted }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
              <div style={{ fontWeight:700, fontSize:16 }}>Sin paradas para hoy</div>
              <div style={{ fontSize:13, marginTop:6 }}>Cuando el admin asigne paradas, aparecerán aquí.</div>
            </div>
          )}

          {pendientes.length>0&&(
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Pendientes ({pendientes.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {pendientes.map(p=>(
                  <ParadaCard key={p.id} p={p}
                    onCompletar={()=>setModal(p)}
                    onChat={()=>setModalChat(p)}
                    onScan={()=>setModalScan(p)}
                    onIncidencia={()=>setModalInc(p)}
                  />
                ))}
              </div>
            </div>
          )}

          {completadas.length>0&&(
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Completadas ({completadas.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {completadas.map(p=>(
                  <ParadaCard key={p.id} p={p} onCompletar={()=>{}} onChat={()=>setModalChat(p)} onScan={()=>{}} onIncidencia={()=>{}}/>
                ))}
              </div>
            </div>
          )}
          <div style={{ height:32 }}/>
        </div>

        {modal&&<ModalCompletar parada={modal} onClose={()=>setModal(null)} onParadaCompletada={cargarParadas}/>}
        {modalChat&&<ModalChat parada={modalChat} onClose={()=>setModalChat(null)}/>}
        {modalScan&&<ModalScan parada={modalScan} onClose={()=>setModalScan(null)} onConfirmado={()=>{}}/>}
        {modalInc&&<ModalIncidencia parada={modalInc} onClose={()=>setModalInc(null)}/>}
      </div>
    </>
  )
}
