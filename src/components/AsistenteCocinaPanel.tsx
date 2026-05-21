'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const K = {
  bg:'#14110E', bg2:'#1E1A16', bg3:'#2A2420',
  fg:'#F6F1E7', fg2:'#D8CDB6', fg3:'#8A7D6E',
  red:'#D9442B', amb:'#E8A33B', gr:'#3F7D44',
  tl:'#2B6A6E', rule:'#3A332C',
}
const SN = 'Inter Tight, system-ui, sans-serif'
const SE = 'Newsreader, Georgia, serif'
const SM = 'Inter Tight, system-ui, sans-serif'

// Chuleta de patrones — igual que ChuletaVoz del camarero
const PATRONES = [
  { icon:'🔢', label:'Pendientes', ejemplo:'¿Cuántos solomillos pendientes?' },
  { icon:'🍽️', label:'Mesa',      ejemplo:'¿Qué tiene la mesa S4?' },
  { icon:'⚠️', label:'Alérgicos', ejemplo:'¿Hay alérgicos en cocina ahora?' },
  { icon:'⏱️', label:'Tiempo',    ejemplo:'¿Qué lleva más tiempo sin salir?' },
  { icon:'📦', label:'Stock',     ejemplo:'¿Cuánto queda de merluza?' },
  { icon:'🏷️', label:'Caducidad', ejemplo:'¿Qué elaboraciones caducan hoy?' },
  { icon:'🔥', label:'Partida',   ejemplo:'¿Cómo va la cocina caliente?' },
]

type Mensaje = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  via?: 'texto' | 'voz'
}

interface Props {
  open: boolean
  onClose: () => void
  sessionToken?: string
}

export default function AsistenteCocinaPanel({ open, onClose, sessionToken }: Props) {
  const [mensajes, setMensajes]   = useState<Mensaje[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [showChuleta, setShowChuleta] = useState(false)

  // PTT — igual que el camarero
  const [grabando, setGrabando]   = useState(false)
  const [grabSecs, setGrabSecs]   = useState(0)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const mediaRecRef   = useRef<MediaRecorder | null>(null)
  const chunksRef     = useRef<Blob[]>([])
  const grabTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, loading])

  const getSes = () => sessionToken ?? localStorage.getItem('ia_rest_session') ?? ''

  const preguntar = useCallback(async (texto: string, via: 'texto' | 'voz' = 'texto') => {
    const q = texto.trim()
    if (!q || loading) return
    setInput(''); setErrorMsg(null)
    setMensajes(m => [...m, { role:'user', content:q, timestamp:new Date().toISOString(), via }])
    setLoading(true)
    try {
      const r = await fetch('/api/kds/asistente', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-ia-session': getSes() },
        body: JSON.stringify({ pregunta: q }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Error')
      setMensajes(m => [...m, { role:'assistant', content:d.respuesta ?? d.error ?? '?', timestamp:new Date().toISOString() }])
    } catch (e) {
      setErrorMsg(String(e))
    } finally {
      setLoading(false)
    }
  }, [loading])

  // ── PTT ─────────────────────────────────────────────────────────────────
  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start(200)
      mediaRecRef.current = rec
      setGrabando(true); setGrabSecs(0)
      grabTimerRef.current = setInterval(() => setGrabSecs(s => s + 1), 1000)
    } catch {
      setErrorMsg('No se pudo acceder al micrófono')
    }
  }

  const pararGrabacion = async () => {
    const rec = mediaRecRef.current
    if (!rec) return
    clearInterval(grabTimerRef.current!)
    setGrabando(false); setGrabSecs(0)
    await new Promise<void>(res => {
      rec.onstop = () => res()
      rec.stop()
      rec.stream.getTracks().forEach(t => t.stop())
    })
    const blob = new Blob(chunksRef.current, { type: rec.mimeType })
    if (blob.size < 1000) return
    await transcribirYPreguntar(blob, rec.mimeType)
  }

  const transcribirYPreguntar = async (blob: Blob, mimeType: string) => {
    setTranscribiendo(true)
    try {
      const ext  = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `pregunta.${ext}`, { type: mimeType })
      const fd   = new FormData()
      fd.append('audio', file)
      fd.append('modo', 'cocina') // modo especial para Whisper con vocabulario de cocina
      const r = await fetch('/api/transcribe/cocina', {
        method: 'POST',
        headers: { 'x-ia-session': getSes() },
        body: fd,
      })
      const d = await r.json()
      if (d.texto?.trim()) {
        await preguntar(d.texto, 'voz')
      } else {
        setErrorMsg('No se entendió la pregunta. Inténtalo de nuevo.')
      }
    } catch {
      setErrorMsg('Error al transcribir el audio')
    } finally {
      setTranscribiendo(false)
    }
  }

  if (!open) return null

  return (
    <div style={{
      position:'fixed', top:0, right:0, bottom:0, width:360, maxWidth:'95vw',
      background:K.bg2, borderLeft:`1px solid ${K.rule}`, zIndex:250,
      display:'flex', flexDirection:'column', boxShadow:'-6px 0 32px rgba(0,0,0,.25)',
    }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${K.rule}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:K.bg, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:K.tl, letterSpacing:'.05em' }}>✦ ASISTENTE COCINA</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowChuleta(v => !v)} title="Chuleta de comandos"
            style={{ background: showChuleta ? K.tl : 'none', border:`1px solid ${showChuleta ? K.tl : K.rule}`, borderRadius:6, cursor:'pointer', color: showChuleta ? '#fff' : K.fg3, fontSize:13, padding:'4px 8px' }}>
            ?
          </button>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:K.fg3, fontSize:18, lineHeight:1 }}>✕</button>
        </div>
      </div>

      {/* Chuleta de comandos */}
      {showChuleta && (
        <div style={{ background:K.bg3, borderBottom:`1px solid ${K.rule}`, padding:'10px 14px', flexShrink:0 }}>
          <div style={{ fontFamily:SM, fontSize:9, fontWeight:700, color:K.fg3, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>
            Patrones de consulta
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {PATRONES.map(p => (
              <button key={p.label} onClick={() => { setInput(p.ejemplo); setShowChuleta(false); inputRef.current?.focus() }}
                style={{ display:'flex', gap:8, alignItems:'center', background:'none', border:`1px solid ${K.rule}`, borderRadius:6, padding:'5px 10px', cursor:'pointer', textAlign:'left' as const }}>
                <span style={{ fontSize:14 }}>{p.icon}</span>
                <div>
                  <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:K.tl }}>{p.label}</div>
                  <div style={{ fontFamily:SN, fontSize:11, color:K.fg3, fontStyle:'italic' }}>"{p.ejemplo}"</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:10 }}>
        {mensajes.length === 0 && !loading && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:'20px 0' }}>
            <span style={{ fontSize:32 }}>✦</span>
            <span style={{ fontFamily:SE, fontStyle:'italic', color:K.fg3, fontSize:14, textAlign:'center', lineHeight:1.5 }}>
              Pregúntame sobre las comandas activas
            </span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', marginTop:4 }}>
              {PATRONES.slice(0,4).map(p => (
                <button key={p.label} onClick={() => preguntar(p.ejemplo)}
                  style={{ padding:'4px 10px', borderRadius:14, border:`1px solid ${K.tl}44`, background:'transparent', fontFamily:SN, fontSize:11, color:K.tl, cursor:'pointer' }}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap:2 }}>
            {m.role === 'user' ? (
              <div style={{ maxWidth:'85%', padding:'8px 12px', borderRadius:'14px 14px 4px 14px', background:K.tl, color:'#fff', fontFamily:SN, fontSize:13, lineHeight:1.45 }}>
                {m.via === 'voz' && <span style={{ fontSize:10, opacity:.7, marginRight:6 }}>🎤</span>}
                {m.content}
              </div>
            ) : (
              <div style={{ maxWidth:'90%', padding:'10px 13px', borderRadius:'14px 14px 14px 4px', background:K.bg3, border:`1px solid ${K.rule}`, color:K.fg, fontFamily:SN, fontSize:13, lineHeight:1.55 }}>
                {m.content}
              </div>
            )}
            <span style={{ fontSize:10, color:K.fg3 }}>
              {new Date(m.timestamp).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
            </span>
          </div>
        ))}

        {(loading || transcribiendo) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 0' }}>
            <span style={{ fontFamily:SN, fontSize:11, color:K.fg3 }}>
              {transcribiendo ? 'Transcribiendo voz…' : 'Pensando…'}
            </span>
            {[0,1,2].map(i => (
              <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:K.tl, display:'inline-block', opacity: 0.4 + i * 0.3 }} />
            ))}
          </div>
        )}

        {errorMsg && (
          <div style={{ padding:'8px 12px', background:'#2E1010', borderRadius:8, fontSize:12, color:K.red }}>
            {errorMsg}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding:'8px 10px', borderTop:`1px solid ${K.rule}`, display:'flex', flexDirection:'column', gap:8, background:K.bg2, flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(input) } }}
            placeholder="Pregunta… o pulsa el micro 🎤"
            rows={1}
            disabled={loading || grabando || transcribiendo}
            style={{
              flex:1, padding:'8px 12px', borderRadius:16,
              border:`1px solid ${K.rule}`, background:K.bg3,
              fontFamily:SN, fontSize:13, color:K.fg,
              resize:'none', outline:'none', lineHeight:1.4,
              opacity: loading || grabando ? .6 : 1,
            }}
          />

          {/* PTT — Botón micrófono */}
          <button
            onPointerDown={iniciarGrabacion}
            onPointerUp={pararGrabacion}
            onPointerLeave={grabando ? pararGrabacion : undefined}
            disabled={loading || transcribiendo}
            title={grabando ? `Grabando ${grabSecs}s… suelta para enviar` : 'Mantén pulsado para hablar'}
            style={{
              width:38, height:38, borderRadius:'50%', flexShrink:0,
              background: grabando ? K.red : K.bg3,
              border:`1.5px solid ${grabando ? K.red : K.rule}`,
              cursor: loading || transcribiendo ? 'default' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16, transition:'all .15s',
              boxShadow: grabando ? `0 0 0 4px ${K.red}33` : 'none',
              opacity: loading || transcribiendo ? .5 : 1,
            }}
          >
            {grabando ? '⏹' : '🎤'}
          </button>

          {/* Enviar texto */}
          <button
            onClick={() => preguntar(input)}
            disabled={!input.trim() || loading || grabando}
            style={{
              width:38, height:38, borderRadius:'50%', flexShrink:0,
              background: input.trim() && !loading && !grabando ? K.tl : K.rule,
              border:'none',
              cursor: input.trim() && !loading && !grabando ? 'pointer' : 'default',
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background .15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={input.trim() && !loading ? '#fff' : K.fg3} strokeWidth={2}>
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        {grabando && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px', background:`${K.red}18`, borderRadius:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:K.red, animation:'none' }} />
            <span style={{ fontFamily:SN, fontSize:11, color:K.red }}>Grabando {grabSecs}s… suelta para enviar</span>
          </div>
        )}
      </div>
    </div>
  )
}
