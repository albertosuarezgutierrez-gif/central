'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Comanda } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const K={bg:'#0D0B08',c1:'#161310',fg:'#F6F1E7',fg2:'#C9BFAA',fg3:'#8D8270',rule:'#2F2820',rS:'#4A3F33',red:'#D9442B',amb:'#E8A33B',gr:'#3F7D44',tl:'#2B6A6E'}
const SE="'Newsreader',Georgia,serif"
const SN="'Inter Tight',system-ui,sans-serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

type Seccion = { id: string; nombre: string; color_kds: string }
type PttState = 'idle' | 'recording' | 'processing' | 'ok' | 'error'

function edadStr(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m===0)return'AHORA';if(m<60)return`+${m}m`;return`+${Math.floor(m/60)}h${m%60?m%60+'m':''}`}
function edadColor(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);return m<10?K.gr:m<20?K.amb:K.red}

function WaveBars({ active }: { active: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 20 }}>
      {[8, 16, 12, 18, 10, 14, 8].map((h, i) => (
        <span key={i} style={{
          width: 2,
          height: active ? h : 4,
          background: active ? K.red : K.rS,
          borderRadius: 2,
          transition: 'height .15s ease',
          animation: active ? `wave-kds ${0.6 + i * 0.08}s ease-in-out infinite alternate` : 'none',
        }} />
      ))}
    </div>
  )
}

function PttButton({
  seccionId,
  session,
  onConfirmed,
}: {
  seccionId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
  onConfirmed: (mesa: string) => void
}) {
  const [ptt, setPtt] = useState<PttState>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recordingRef = useRef(false)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFeedback = () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => {
      setFeedback(null)
      setPtt('idle')
    }, 2800)
  }

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mr.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(100)
      mediaRef.current = mr
      recordingRef.current = true
      setPtt('recording')
    } catch {
      setFeedback('Micrófono no disponible')
      setPtt('error')
      clearFeedback()
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || !mediaRef.current) return
    recordingRef.current = false
    setPtt('processing')

    const mr = mediaRef.current
    mr.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop())

    await new Promise<void>(res => { mr.onstop = () => res(); mr.stop() })

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const fd = new FormData()
    fd.append('audio', blob, 'audio.webm')
    if (seccionId) fd.append('seccion_id', seccionId)

    try {
      const headers: Record<string, string> = {}
      if (session) headers['x-ia-session'] = JSON.stringify(session)

      const res = await fetch('/api/kds/voz', { method: 'POST', headers, body: fd })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setFeedback(data.error || 'No entendí. Intenta de nuevo.')
        setPtt('error')
      } else {
        setFeedback(`${data.mesa} — listo (${data.items_actualizados} platos · ${data.latencia_ms}ms)`)
        setPtt('ok')
        onConfirmed(data.mesa)
      }
    } catch {
      setFeedback('Error de red. Intenta de nuevo.')
      setPtt('error')
    }
    clearFeedback()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccionId, session, onConfirmed])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body && ptt === 'idle') {
        e.preventDefault()
        startRecording()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && ptt === 'recording') stopRecording()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [ptt, startRecording, stopRecording])

  const isRecording = ptt === 'recording'
  const isProcessing = ptt === 'processing'
  const isOk = ptt === 'ok'
  const isError = ptt === 'error'

  const borderColor = isRecording ? K.red : isOk ? K.gr : isError ? K.amb : K.rS

  return (
    <div style={{ position:'fixed', bottom:20, right:20, zIndex:50, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10, pointerEvents:'none' }}>
      {feedback && (
        <div style={{
          background: isOk ? 'rgba(63,125,68,.15)' : isError ? 'rgba(232,163,59,.15)' : 'rgba(26,23,20,.9)',
          border: `1px solid ${isOk ? 'rgba(63,125,68,.5)' : isError ? 'rgba(232,163,59,.5)' : K.rS}`,
          borderRadius: 6, padding: '8px 14px',
          fontFamily: SM, fontSize: 12, fontWeight: 700,
          color: isOk ? K.gr : isError ? K.amb : K.fg,
          letterSpacing: '.05em', maxWidth: 280,
          pointerEvents: 'none', animation: 'slideUp .2s ease',
        }}>
          {feedback}
        </div>
      )}

      {isRecording && (
        <div style={{ background:'rgba(217,68,43,.12)', border:'1px solid rgba(217,68,43,.3)', borderRadius:6, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, pointerEvents:'none' }}>
          <WaveBars active />
          <span style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:K.red, letterSpacing:'.1em' }}>ESCUCHANDO</span>
        </div>
      )}

      <button
        onPointerDown={e => { e.preventDefault(); if (ptt === 'idle') startRecording() }}
        onPointerUp={e => { e.preventDefault(); if (isRecording) stopRecording() }}
        onPointerLeave={e => { e.preventDefault(); if (recordingRef.current) stopRecording() }}
        style={{
          width:64, height:64, borderRadius:999,
          border:`3px solid ${borderColor}`,
          background: isRecording ? K.red : isOk ? K.gr : isError ? 'rgba(232,163,59,.2)' : K.c1,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
          cursor: isProcessing ? 'wait' : 'pointer',
          transition:'all .15s ease',
          transform: isRecording ? 'scale(0.93)' : 'scale(1)',
          boxShadow: isRecording
            ? `0 0 0 6px rgba(217,68,43,.18), 0 8px 24px rgba(217,68,43,.35)`
            : `0 4px 16px rgba(0,0,0,.6)`,
          pointerEvents:'auto', touchAction:'none', userSelect:'none',
        }}
      >
        {isProcessing ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ animation:'spin .8s linear infinite' }}>
            <circle cx="11" cy="11" r="9" stroke={K.fg3} strokeWidth="2" strokeDasharray="28 8" />
          </svg>
        ) : isOk ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <polyline points="4 11 9 16 18 6" stroke={K.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : isError ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <line x1="6" y1="6" x2="16" y2="16" stroke={K.fg} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="16" y1="6" x2="6" y2="16" stroke={K.fg} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="9" y="3" width="4" height="9" rx="2" fill={K.fg2} />
            <path d="M5 11a6 6 0 0 0 12 0" stroke={K.fg2} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <line x1="11" y1="17" x2="11" y2="20" stroke={K.fg2} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
        <span style={{ fontFamily:SM, fontSize:7, fontWeight:700, letterSpacing:'.1em', color:K.fg3 }}>
          {isRecording ? 'SUELTA' : isProcessing ? '...' : 'VOZ'}
        </span>
      </button>
    </div>
  )
}

function KDSInner() {
  const { session, checking } = useAuth(['admin', 'cocina', 'super_admin'])
  const searchParams = useSearchParams()
  const paramSeccion = searchParams.get('seccion')

  const seccionFiltro = paramSeccion ?? session?.seccion_id ?? null

  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [time, setTime] = useState(new Date())
  const [vistaPase, setVistaPase] = useState(false)

  const fetchSecciones = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('secciones_cocina')
      .select('id,nombre,color_kds')
      .eq('restaurante_id', session.restaurante_id)
      .order('orden', { ascending: true })
    if (data) setSecciones(data)
  }, [session])

  const fetchData = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('comandas')
      .select('*,mesa:mesas(codigo),camarero:camareros(nombre),items:comanda_items(*)')
      .eq('restaurante_id', session.restaurante_id)
      .in('tipo', ['comanda', 'marchar'])
      .in('estado', ['nueva', 'en_cocina'])
      .order('created_at', { ascending: true })
    if (data) setComandasState(data as unknown as Comanda[])
  }, [session])

  useEffect(() => {
    if (!session) return
    fetchSecciones()
    fetchData()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel('kds') as any)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, fetchData)
      .subscribe()
    const t = setInterval(() => { fetchData(); setTime(new Date()) }, 5000)
    const c = setInterval(() => setTime(new Date()), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t); clearInterval(c) }
  }, [session, fetchData, fetchSecciones])

  const toggle = async (itemId: string, estado: string) => {
    await supabase.from('comanda_items').update({ estado: estado === 'listo' ? 'pendiente' : 'listo' }).eq('id', itemId)
    fetchData()
  }

  const cerrar = async (id: string, mesaId: string, camareroId?: string, mesaCodigo?: string) => {
    await supabase.from('comandas').update({ estado: 'lista' }).eq('id', id)
    await supabase.from('mesas').update({ estado: 'activa' }).eq('id', mesaId)
    if (camareroId) {
      fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ia-session': localStorage.getItem('ia_rest_session') ?? '',
        },
        body: JSON.stringify({
          title: 'Comanda lista',
          body: `${mesaCodigo || 'Mesa'} — todo listo. Puedes servir.`,
          mesa: mesaCodigo,
          camarero_ids: [camareroId],
          data: { url: '/edge' },
        }),
      }).catch(() => {})
    }
    fetchData()
  }

  const handleVozConfirmada = useCallback((_mesa: string) => {
    setTimeout(() => fetchData(), 300)
  }, [fetchData])

  const comandasFiltradas = comandas.map(c => {
    if (!seccionFiltro) return c
    const itemsFiltrados = (c.items || []).filter(it => it.seccion_id === seccionFiltro)
    return { ...c, items: itemsFiltrados }
  }).filter(c => !seccionFiltro || (c.items && c.items.length > 0))

  const seccionActiva = secciones.find(s => s.id === seccionFiltro)
  const colorSeccion = seccionActiva?.color_kds ?? K.gr
  const esAdmin = session?.rol === 'admin' || session?.rol === 'super_admin'

  if (checking || !session) return <div style={{ minHeight: '100dvh', background: K.bg }} />

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: K.bg }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes wave-kds{from{transform:scaleY(0.4)}to{transform:scaleY(1)}}
        @media(min-width:640px){.kds-grid{grid-template-columns:repeat(2,1fr)!important}}
        @media(min-width:1024px){.kds-grid{grid-template-columns:repeat(3,1fr)!important}}
        @media(min-width:1400px){.kds-grid{grid-template-columns:repeat(4,1fr)!important}}
        .sec-tab{cursor:pointer;padding:4px 10px;border-radius:3px;font-family:${SM};font-size:9px;font-weight:700;letter-spacing:.1em;text-decoration:none;transition:background .15s,color .15s}
      `}</style>

      <div style={{ padding:'0 16px', minHeight:52, borderBottom:`1px solid ${K.rule}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:K.c1, flexShrink:0, position:'sticky', top:0, zIndex:10, flexWrap:'wrap', gap:8, paddingTop:6, paddingBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <svg width="22" height="22" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
          <span style={{ fontFamily:SN, fontSize:12, color:K.fg2, fontWeight:500, letterSpacing:'.04em' }}>
            KDS{seccionActiva ? ` · ${seccionActiva.nombre.toUpperCase()}` : ' · TODAS'}
          </span>
          <span style={{ width:6, height:6, borderRadius:999, background:colorSeccion }} />
        </div>

        {esAdmin && secciones.length > 0 && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            <a href="/kds" className="sec-tab"
              style={{ background:!seccionFiltro&&!vistaPase ? '#2F2820' : 'transparent', color:!seccionFiltro&&!vistaPase ? K.fg : K.fg3 }}>
              TODAS
            </a>
            {secciones.map(s => (
              <a key={s.id} href={`/kds?seccion=${s.id}`} onClick={()=>setVistaPase(false)} className="sec-tab"
                style={{ background:seccionFiltro===s.id&&!vistaPase ? '#2F2820' : 'transparent', color:seccionFiltro===s.id&&!vistaPase ? s.color_kds : K.fg3 }}>
                {s.nombre.toUpperCase()}
              </a>
            ))}
            <button onClick={()=>setVistaPase(v=>!v)}
              style={{ cursor:'pointer', padding:'4px 10px', borderRadius:3, fontFamily:SM, fontSize:9, fontWeight:700, letterSpacing:'.1em', border:'none',
                background:vistaPase?K.gr:'transparent', color:vistaPase?'#fff':K.fg3, transition:'background .15s,color .15s' }}>
              PASE
            </button>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <rect x="4.5" y="1.5" width="3" height="6" rx="1.5" fill={K.tl} />
              <path d="M2 6a4 4 0 0 0 8 0" stroke={K.tl} strokeWidth="1.2" strokeLinecap="round" fill="none" />
            </svg>
            <span style={{ fontFamily:SM, fontSize:9, color:K.tl, letterSpacing:'.1em', fontWeight:700 }}>VOZ</span>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            {[['OK',K.gr],['AVISO',K.amb],['URGENTE',K.red]].map(([l,c])=>(
              <span key={l} style={{ fontFamily:SN, fontSize:9, fontWeight:700, letterSpacing:'.08em', color:c, display:'flex', gap:3, alignItems:'center' }}>
                <span style={{ width:5, height:5, borderRadius:999, background:c }}/>{l}
              </span>
            ))}
          </div>
          <span style={{ fontFamily:SM, fontSize:16, fontWeight:700, color:K.fg }}>{time.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        </div>
      </div>

      <div style={{ flex:1, padding:10, overflowY:'auto' }}>
        {vistaPase ? (
          /* ══════ VISTA PASE — Expediting Screen ══════ */
          comandas.length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:10 }}>
              <span style={{ fontFamily:SE, fontSize:28, color:K.fg3, fontStyle:'italic' }}>Cocina libre.</span>
              <span style={{ fontFamily:SM, fontSize:10, color:K.fg3, letterSpacing:'.1em' }}>PASE · SIN MESAS ACTIVAS</span>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontFamily:SM, fontSize:9, color:K.fg3, letterSpacing:'.12em', padding:'4px 2px 10px', borderBottom:'1px solid '+K.rule, marginBottom:4 }}>
                PASE · {comandas.length} MESA{comandas.length!==1?'S':''} ACTIVA{comandas.length!==1?'S':''}
              </div>
              <div className="kds-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:8 }}>
                {comandas.map(c=>{
                  const items = c.items||[]
                  const total = items.length
                  const listos = items.filter(it=>it.estado==='listo').length
                  const allDone = total>0 && listos===total
                  const col = edadColor(c.created_at)
                  const urgente = col===K.red
                  const pct = total>0?Math.round((listos/total)*100):0
                  return (
                    <div key={c.id} style={{ background:allDone?'rgba(63,125,68,.12)':urgente?'rgba(217,68,43,.06)':K.c1, border:'1px solid '+(allDone?K.gr:urgente?'rgba(217,68,43,.35)':K.rule), borderRadius:0, padding:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                        <span style={{ fontFamily:SE, fontSize:44, fontWeight:500, color:allDone?K.gr:K.fg, lineHeight:1, minWidth:90 }}>
                          {c.mesa?.codigo}
                        </span>
                        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontFamily:SM, fontSize:10, color:K.fg3 }}>
                            <span>{listos}/{total} listos</span>
                            <span style={{ color:col, animation:urgente?'pulse 1.5s ease-in-out infinite':'none' }}>{edadStr(c.created_at)}</span>
                          </div>
                          <div style={{ height:5, background:K.rule, borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:pct+'%', background:allDone?K.gr:col, borderRadius:2, transition:'width .3s ease' }}/>
                          </div>
                          <div style={{ fontFamily:SN, fontSize:10, color:K.fg3 }}>{c.camarero?.nombre} · {new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                        {allDone ? (
                          <button onClick={()=>cerrar(c.id,c.mesa_id,c.camarero_id,c.mesa?.codigo)}
                            style={{ background:K.gr, border:'none', color:'#fff', padding:'14px 20px', borderRadius:4, fontFamily:SM, fontSize:13, fontWeight:700, letterSpacing:'.08em', cursor:'pointer', minWidth:110, flexShrink:0 }}>
                            MARCHAR
                          </button>
                        ):(
                          <div style={{ fontFamily:SM, fontSize:18, fontWeight:700, color:K.fg3, minWidth:50, textAlign:'right' }}>{pct}%</div>
                        )}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {items.map(it=>(
                          <div key={it.id} onClick={()=>toggle(it.id,it.estado)}
                            style={{ padding:'6px 12px', borderRadius:3, cursor:'pointer', userSelect:'none',
                              background:it.estado==='listo'?'rgba(63,125,68,.15)':K.rule,
                              border:'1px solid '+(it.estado==='listo'?K.gr:K.rS),
                              fontFamily:SM, fontSize:12, fontWeight:700,
                              color:it.estado==='listo'?K.gr:K.fg,
                              textDecoration:it.estado==='listo'?'line-through':'none',
                              opacity:it.estado==='listo'?0.55:1,
                              letterSpacing:'.04em', textTransform:'uppercase', transition:'all .15s' }}>
                            {it.cantidad}× {it.nombre}{it.formato_nombre?' ('+it.formato_nombre+')':''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        ) : (
          /* ══════ VISTA NORMAL KDS ══════ */
          comandasFiltradas.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:10 }}>
            <span style={{ fontFamily:SE, fontSize:28, color:K.fg3, fontStyle:'italic' }}>Cocina libre.</span>
            {seccionActiva && (
              <span style={{ fontFamily:SM, fontSize:10, color:K.fg3, letterSpacing:'.1em' }}>
                {seccionActiva.nombre.toUpperCase()} · SIN PENDIENTES
              </span>
            )}
          </div>
        ) : (
          <div className="kds-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
            {comandasFiltradas.map(c => {
              const allDone = (c.items||[]).every(it=>it.estado==='listo')
              const col = edadColor(c.created_at)
              const urgente = col===K.red
              return (
                <div key={c.id} style={{ position:'relative', background:urgente?'rgba(217,68,43,.08)':col===K.amb?'rgba(232,163,59,.08)':'rgba(63,125,68,.06)', border:`1px solid ${urgente?'rgba(217,68,43,.35)':col===K.amb?'rgba(232,163,59,.3)':'rgba(63,125,68,.25)'}`, borderRadius:0, padding:14, animation:'slideIn .3s ease' }}>
                  {allDone && (
                    <div onClick={()=>cerrar(c.id,c.mesa_id,c.camarero_id,c.mesa?.codigo)} style={{ position:'absolute', inset:0, background:'rgba(13,11,8,.75)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:2 }}>
                      <span style={{ fontFamily:SM, fontSize:14, fontWeight:700, letterSpacing:'.1em', color:K.gr }}>LISTO — TAP</span>
                    </div>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'baseline' }}>
                      <span style={{ fontFamily:SE, fontSize:36, fontWeight:500, color:K.fg, lineHeight:1 }}>{c.mesa?.codigo}</span>
                      <span style={{ fontFamily:SM, fontSize:10, color:K.fg3 }}>#{c.numero_ticket}</span>
                      {(c as unknown as {num_comensales?:number}).num_comensales && (
                        <span style={{ fontFamily:SM, fontSize:9, fontWeight:700, color:K.amb, letterSpacing:'.08em', background:'rgba(232,163,59,.12)', border:'1px solid rgba(232,163,59,.3)', borderRadius:999, padding:'2px 7px' }}>
                          {(c as unknown as {num_comensales:number}).num_comensales} pax
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily:SM, fontSize:22, fontWeight:700, color:col, animation:urgente?'pulse 1.5s ease-in-out infinite':'none' }}>{edadStr(c.created_at)}</span>
                  </div>
                  <div style={{ borderTop:`1px solid ${K.rS}`, paddingTop:10 }}>
                    {(c.items||[]).map(it=>(
                      <div key={it.id} onClick={()=>toggle(it.id,it.estado)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${K.rule}`, cursor:'pointer', opacity:it.estado==='listo'?.4:1, transition:'opacity .15s', minHeight:44 }}>
                        <div style={{ width:20, height:20, borderRadius:3, border:`2px solid ${it.estado==='listo'?K.gr:K.rS}`, background:it.estado==='listo'?K.gr:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                          {it.estado==='listo'&&<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1 5 4 8 9 2" stroke={K.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontFamily:SM, fontSize:14, fontWeight:700, letterSpacing:'.05em', color:K.fg, textTransform:'uppercase', textDecoration:it.estado==='listo'?'line-through':'none' }}>
                            {it.nombre}
                            {it.formato_nombre&&(
                              <span style={{ fontFamily:SM, fontSize:10, fontWeight:600, marginLeft:6, padding:'1px 5px', borderRadius:2, background:K.rule, color:K.fg3, letterSpacing:'.06em', verticalAlign:'middle' }}>
                                {it.formato_nombre.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {it.notas&&<div style={{ fontFamily:SN, fontSize:11, color:K.amb, marginTop:2 }}>{it.notas}</div>}
                        </div>
                        <span style={{ fontFamily:SM, fontSize:13, color:K.fg3 }}>{it.cantidad}x</span>
                        {!seccionFiltro&&it.seccion_id&&(
                          <span style={{ fontFamily:SM, fontSize:8, padding:'2px 5px', borderRadius:2, background:K.rule, color:K.fg3, letterSpacing:'.06em' }}>
                            {it.seccion_id.toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontFamily:SN, fontSize:10, color:K.fg3 }}>
                    <span>{c.camarero?.nombre}</span>
                    <span>{new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
        )}
      </div>

      <PttButton
        seccionId={seccionFiltro}
        session={session}
        onConfirmed={handleVozConfirmada}
      />
    </div>
  )
}

export default function KDSPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100dvh', background:'#0D0B08' }}/>}>
      <KDSInner />
    </Suspense>
  )
}
