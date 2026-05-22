'use client'
import { SE, SN, SM } from '@/lib/colors'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Comanda } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import SugerenciaButton from '@/components/SugerenciaButton'
import ChuletaVoz from '@/components/ChuletaVoz'
import { useMensajes } from '@/hooks/useMensajes'
import FicharSalidaBtn from '@/components/FicharSalidaBtn'
import AsistenteCocinaPanel from '@/components/AsistenteCocinaPanel'
import ElaboracionesPanel from '@/components/kds/ElaboracionesPanel'
import PesarModal from '@/components/kds/PesarModal'

const K={bg:'#F6F1E7',c1:'#FBF8F1',fg:'#1A1714',fg2:'#3A332C',fg3:'#6B5F52',rule:'#D8CDB6',rS:'#B8A98B',red:'#D9442B',amb:'#E8A33B',gr:'#3F7D44',tl:'#2B6A6E'}

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
            : `rgba(184,169,139,0.5) 0px 0px 0px 1px, rgba(184,169,139,0.2) 0px 4px 12px`,
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
  const searchParams = useSearchParams()
  const paramToken   = searchParams.get('token')
  const paramSeccion = searchParams.get('seccion')

  const { session: _pinSession, checking: _pinChecking } = useAuth(paramToken ? [] as never[] : ['jefe_sala', 'cocina', 'super_admin'])

  // Si hay ?token= en URL, sobreescribir la sesión con la del token (pantalla permanente sin login)
  const [tokenSession, setTokenSession] = useState<import('@/hooks/useAuth').Session | null>(null)
  const [tokenReady, setTokenReady]     = useState(false)

  useEffect(() => {
    if (!paramToken) { setTokenReady(true); return }
    fetch(`/api/kds/validate-token?token=${paramToken}`)
      .then(r => r.json())
      .then(d => {
        if (d.session) {
          localStorage.setItem('ia_rest_session', JSON.stringify(d.session))
          setTokenSession(d.session)
        } else {
          window.location.href = '/login'
        }
      })
      .catch(() => { window.location.href = '/login' })
      .finally(() => setTokenReady(true))
  }, [paramToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveSession  = paramToken ? tokenSession  : _pinSession
  const effectiveChecking = paramToken ? !tokenReady   : _pinChecking

  const seccionFiltro = paramSeccion ?? effectiveSession?.seccion_id ?? null

  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [time, setTime] = useState(new Date())
  const [vistaPase, setVistaPase] = useState(false)
  const [vistaProduccion, setVistaProduccion] = useState(false)
  const [vistaCompacta, setVistaCompacta] = useState(false)
  const [sonidoOn, setSonidoOn] = useState(true)
  const [chatAbierto, setChatAbierto] = useState(false)
  const [chuleteAbierto, setChuleteAbierto] = useState(false)
  const [chatTexto, setChatTexto] = useState('')
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)
  const [elaborAbierto, setElaborAbierto]       = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [bannerMensaje, setBannerMensaje] = useState<{ texto: string; origen: string } | null>(null)
  const [itemAPesar, setItemAPesar] = useState<{ id: string; nombre: string; precio_por_kg?: number | null } | null>(null)
  const [pesarLoading, setPesarLoading] = useState(false)
  const prevCountRef = useRef(0)
  // Map zona_id → nombre del running que la cubre (para preview en botón MARCHAR)
  const [runningPorZona, setRunningPorZona] = useState<Record<string, string>>({})

  const fetchRunnings = useCallback(async () => {
    if (!effectiveSession) return
    try {
      const res = await fetch('/api/owner/running-zonas', {
        headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
      })
      if (!res.ok) return
      const data = await res.json()
      // Construir mapa zona_id → nombre running
      const map: Record<string, string> = {}
      for (const rz of data ?? []) {
        if (rz.activo) {
          // Necesitamos el nombre del running — fetch camarero
          const { data: cam } = await supabase
            .from('personal')
            .select('nombre')
            .eq('id', rz.camarero_id)
            .single()
          if (cam) map[rz.zona_id] = cam.nombre
        }
      }
      setRunningPorZona(map)
    } catch { /* silencioso */ }
  }, [effectiveSession])

  const fetchSecciones = useCallback(async () => {
    if (!effectiveSession) return
    const { data } = await supabase
      .from('secciones_cocina')
      .select('id,nombre,color_kds')
      .eq('restaurante_id', effectiveSession.restaurante_id)
      .order('orden', { ascending: true })
    if (data) setSecciones(data)
  }, [effectiveSession])

  const beep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } catch { /* silencioso si no hay contexto de audio */ }
  }, [])

  const fetchData = useCallback(async () => {
    if (!effectiveSession) return
    const { data } = await supabase
      .from('comandas')
      .select('*,mesa:mesas(codigo,nombre),camarero:camareros(nombre),items:comanda_items(*)')
      .eq('restaurante_id', effectiveSession.restaurante_id)
      .in('tipo', ['comanda', 'marchar'])
      .in('estado', ['nueva', 'en_cocina'])
      .order('created_at', { ascending: true })
    if (data) {
      const newCount = data.length
      if (sonidoOn && newCount > prevCountRef.current && prevCountRef.current > 0) {
        beep()
      }
      prevCountRef.current = newCount
      setComandasState(data as unknown as Comanda[])
    }
  }, [effectiveSession, sonidoOn, beep])

  useEffect(() => {
    if (!effectiveSession) return
    fetchSecciones()
    fetchData()
    fetchRunnings()
    // Refrescar runnings cada 30s (pueden cambiar de zonas)
    const r = setInterval(fetchRunnings, 30000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel(`kds-${effectiveSession.restaurante_id}`) as any)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, fetchData)
      .subscribe()
    const t = setInterval(() => { fetchData(); setTime(new Date()) }, 5000)
    const c = setInterval(() => setTime(new Date()), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t); clearInterval(c); clearInterval(r) }
  }, [effectiveSession, fetchData, fetchSecciones, fetchRunnings])

  const toggle = async (itemId: string, estado: string) => {
    await supabase.from('comanda_items')
      .update({ estado: estado === 'listo' ? 'pendiente' : 'listo' })
      .eq('id', itemId)
      .eq('restaurante_id', effectiveSession!.restaurante_id)
    fetchData()
  }

  const confirmarPeso = async (pesoGramos: number) => {
    if (!itemAPesar) return
    setPesarLoading(true)
    try {
      await fetch('/api/kds/pesar-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comanda_item_id: itemAPesar.id, peso_gramos: pesoGramos }),
      })
      setItemAPesar(null)
      fetchData()
    } finally {
      setPesarLoading(false)
    }
  }

  const cerrar = async (id: string, mesaId: string, camareroId?: string, mesaCodigo?: string) => {
    // Obtener items de la comanda para el resumen
    const comanda = comandas.find(c => c.id === id)
    const items = (comanda?.items || [])
      .filter(it => it.estado !== 'cancelado')
      .map(it => ({ nombre: it.nombre, cantidad: it.cantidad }))

    // Llamar al agente MARCHAR centralizado (notificaciones configurables)
    await fetch('/api/marchar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ia-session': localStorage.getItem('ia_rest_session') ?? '',
      },
      body: JSON.stringify({
        comanda_id:  id,
        mesa_codigo: mesaCodigo ?? 'Mesa',
        items,
      }),
    }).catch(() => {
      // Fallback: push directo si /api/marchar falla
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
    })

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
  const esAdmin = effectiveSession?.rol === 'jefe_sala' || effectiveSession?.rol === 'super_admin'

  const handleMensajeNuevoKds = useCallback((m: import('@/hooks/useMensajes').Mensaje) => {
    setBannerMensaje({ texto: m.texto, origen: m.nombre_origen ?? m.rol_origen })
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { mensajes, noLeidos, enviar: enviarMensaje, marcarLeido: marcarMensajeLeido } =
    useMensajes(effectiveSession?.restaurante_id ?? '', effectiveSession?.id ?? '', effectiveSession?.rol ?? 'cocina', undefined, handleMensajeNuevoKds)

  if (effectiveChecking || !effectiveSession) return <div style={{ minHeight: '100dvh', background: K.bg }} />

  return (
    <>
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
        .sec-tab{cursor:pointer;padding:4px 10px;border-radius:3px;font-family:${SM};font-size:9px;font-weight:700;letter-spacing:.1em;text-decoration:none;transition:background .15s,color .15s;-webkit-tap-highlight-color:transparent;}
        .kds-view-tab{cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;padding:9px 14px;font-family:${SN};font-size:12px;font-weight:500;color:${K.fg3};letter-spacing:.02em;transition:color .15s,border-color .15s;white-space:nowrap;margin-bottom:-1px;-webkit-tap-highlight-color:transparent;}
        .kds-view-tab.kds-vact{color:${K.fg};font-weight:600;border-bottom-color:${K.red}}
        .kds-view-tab:hover:not(.kds-vact){color:${K.fg2}}
        button{touch-action:manipulation;}
        input, select{font-size:16px;}
      `}</style>

      {/* ══ HEADER ══ */}
      <div style={{ background:K.c1, flexShrink:0, position:'sticky', top:0, zIndex:10, borderBottom:`1px solid ${K.rule}` }}>
        {/* Fila 1: logo + filtros sección + controles */}
        <div style={{ padding:'6px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg width="22" height="22" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1A1714"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
            <span style={{ fontFamily:SN, fontSize:12, color:K.fg2, fontWeight:600 }}>KDS</span>
            {/* Filtros de sección — solo en vista Línea */}
            {esAdmin && secciones.length > 0 && !vistaPase && !vistaProduccion && (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                <a href="/kds" className="sec-tab"
                  style={{ background:!seccionFiltro ? '#2F2820' : 'transparent', color:!seccionFiltro ? K.fg : K.fg3 }}>
                  TODAS
                </a>
                {secciones.map(s => (
                  <a key={s.id} href={`/kds?seccion=${s.id}`} className="sec-tab"
                    style={{ background:seccionFiltro===s.id ? '#2F2820' : 'transparent', color:seccionFiltro===s.id ? s.color_kds : K.fg3 }}>
                    {s.nombre.toUpperCase()}
                  </a>
                ))}
              </div>
            )}
          </div>
          {/* Derecha: controles audio, reloj, chat, etc. */}
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          {/* Parte derecha de fila-1: controles de audio, reloj, chat, etc. */}
          <button onClick={()=>setSonidoOn(v=>!v)} title={sonidoOn?'Silenciar':'Activar sonido'}
            style={{ cursor:'pointer', padding:'3px 8px', borderRadius:3, fontFamily:SM, fontSize:9, fontWeight:700, letterSpacing:'.08em', border:'none',
              background:sonidoOn?'rgba(43,106,110,.2)':'transparent', color:sonidoOn?K.tl:K.fg3, transition:'background .15s,color .15s' }}>
            {sonidoOn?'🔔':'🔕'}
          </button>
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
          <SugerenciaButton session={effectiveSession} tema="dark" variant="inline" />
          {/* Botón Elaboraciones propias */}
          <button
            onClick={() => { setElaborAbierto(v => !v); setAsistenteAbierto(false); setChatAbierto(false) }}
            title="Elaboraciones propias"
            style={{ cursor:'pointer', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', background: elaborAbierto ? K.amb : 'transparent', border:`1px solid ${elaborAbierto ? K.amb : K.rule}`, borderRadius:6, color: elaborAbierto ? '#fff' : K.fg3, flexShrink:0, fontSize:14 }}
          >🏷️</button>
          {/* Botón Asistente IA Cocina */}
          <button
            onClick={() => setAsistenteAbierto(v => !v)}
            title="Asistente IA cocina"
            style={{
              cursor: 'pointer', width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: asistenteAbierto ? K.gr : 'transparent',
              border: `1px solid ${asistenteAbierto ? K.gr : K.rule}`,
              borderRadius: 6, color: asistenteAbierto ? '#fff' : K.fg3, flexShrink: 0,
              fontSize: 14,
            }}
          >
            🍳
          </button>
          {/* Botón chat con badge */}
          <button
            onClick={() => { setChatAbierto(v => !v); if (!chatAbierto) mensajes.filter(m => !m.leido_por?.includes(effectiveSession!.id)).forEach(m => marcarMensajeLeido(m.id)) }}
            title="Mensajes"
            style={{ position:'relative', cursor:'pointer', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', background: chatAbierto ? K.red : 'transparent', border:`1px solid ${chatAbierto ? K.red : K.rule}`, borderRadius:6, color: chatAbierto ? '#fff' : K.fg3, flexShrink:0 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {noLeidos > 0 && !chatAbierto && (
              <div style={{ position:'absolute', top:-4, right:-4, minWidth:14, height:14, borderRadius:7, background:K.red, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
                <span style={{ fontFamily:SN, fontSize:8, fontWeight:700, color:'#fff' }}>{noLeidos > 9 ? '9+' : noLeidos}</span>
              </div>
            )}
          </button>
          <button onClick={() => setChuleteAbierto(v => !v)} title="Chuleta Voz"
            style={{ cursor:'pointer', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', background: chuleteAbierto ? K.amb : 'transparent', border:`1px solid ${chuleteAbierto ? K.amb : K.rule}`, borderRadius:6, color: chuleteAbierto ? '#fff' : K.fg3, flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </button>
          <button
            onClick={() => {
              const sesStr = localStorage.getItem('ia_rest_session')
              if (sesStr) {
                fetch('/api/turnos/activo', { headers: { 'x-ia-session': sesStr } })
                  .then(r => r.json())
                  .then(d => {
                    if (d.turno) {
                      const ok = window.confirm('¿Fichar salida antes de cerrar sesión?')
                      if (ok) {
                        fetch('/api/turnos/fichar', { method: 'DELETE', headers: { 'x-ia-session': sesStr } })
                          .finally(() => { localStorage.removeItem('ia_rest_session'); localStorage.removeItem('ia_kds_token'); window.location.href = '/login' })
                      } else {
                        localStorage.removeItem('ia_rest_session'); localStorage.removeItem('ia_kds_token'); window.location.href = '/login'
                      }
                    } else {
                      localStorage.removeItem('ia_rest_session'); localStorage.removeItem('ia_kds_token'); window.location.href = '/login'
                    }
                  })
              } else {
                window.location.href = '/login'
              }
            }}
            title="Salir"
            style={{ cursor:'pointer', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:`1px solid ${K.rule}`, borderRadius:6, color:K.fg3, fontSize:13, flexShrink:0 }}
          >
            ⏏
          </button>
          </div>{/* cierra controles */}
        </div>{/* cierra fila-1 */}
        {/* Fila 2: tabs de vista — siempre visibles */}
        <div style={{ display:'flex', alignItems:'center', borderTop:`1px solid ${K.rule}`, paddingLeft:8, overflow:'auto', scrollbarWidth:'none' }}>
          {(['linea','pase','produccion','compacto'] as const).map(v => {
            const labels: Record<string,string> = { linea:'Línea', pase:'Pase', produccion:'Producción', compacto:'Compacto' }
            const active =
              v==='linea'      ? (!vistaPase && !vistaProduccion && !vistaCompacta) :
              v==='pase'       ? vistaPase :
              v==='produccion' ? vistaProduccion :
                                 (!vistaPase && !vistaProduccion && vistaCompacta)
            return (
              <button key={v}
                className={`kds-view-tab${active?' kds-vact':''}`}
                onClick={()=>{
                  if(v==='pase')       { setVistaPase(true);  setVistaProduccion(false); setVistaCompacta(false) }
                  else if(v==='produccion') { setVistaPase(false); setVistaProduccion(true);  setVistaCompacta(false) }
                  else if(v==='compacto')   { setVistaPase(false); setVistaProduccion(false); setVistaCompacta(true)  }
                  else                      { setVistaPase(false); setVistaProduccion(false); setVistaCompacta(false) }
                }}>
                {labels[v]}
              </button>
            )
          })}
        </div>
      </div>{/* cierra header-wrapper */}

      <div style={{ flex:1, padding:10, overflowY:'auto' }}>
        {vistaProduccion ? (
          /* ══════ VISTA PRODUCCIÓN — All-Day Count ══════ */
          (() => {
            // Agregar items por nombre de producto, filtrado por sección si aplica
            const conteoMap: Record<string, { total: number; listos: number; secciones: Set<string> }> = {}
            for (const c of comandas) {
              const items = seccionFiltro
                ? (c.items||[]).filter(it=>it.seccion_id===seccionFiltro)
                : (c.items||[])
              for (const it of items) {
                const key = it.nombre + (it.formato_nombre ? ` (${it.formato_nombre})` : '')
                if (!conteoMap[key]) conteoMap[key] = { total:0, listos:0, secciones: new Set() }
                conteoMap[key].total += it.cantidad
                if (it.estado==='listo') conteoMap[key].listos += it.cantidad
                if (it.seccion_id) conteoMap[key].secciones.add(it.seccion_id)
              }
            }
            const entradas = Object.entries(conteoMap)
              .filter(([,v])=>v.total>0)
              .sort((a,b)=>b[1].total-a[1].total)
            if (entradas.length===0) return (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:10 }}>
                <span style={{ fontFamily:SE, fontSize:28, color:K.fg3, fontStyle:'italic' }}>Cocina libre.</span>
                <span style={{ fontFamily:SM, fontSize:10, color:K.fg3, letterSpacing:'.1em' }}>PRODUCCIÓN · SIN PENDIENTES</span>
              </div>
            )
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ fontFamily:SM, fontSize:9, color:K.fg3, letterSpacing:'.12em', padding:'4px 2px 10px', borderBottom:'1px solid '+K.rule, marginBottom:4 }}>
                  PRODUCCIÓN{seccionFiltro?' · '+seccionFiltro.toUpperCase():''} · {entradas.length} PRODUCTOS · {entradas.reduce((s,[,v])=>s+v.total,0)} UNIDADES
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
                  {entradas.map(([nombre, v])=>{
                    const pendientes = v.total - v.listos
                    const pct = Math.round((v.listos/v.total)*100)
                    const urgent = pendientes > 8
                    return (
                      <div key={nombre} style={{
                        background: v.listos===v.total?'rgba(63,125,68,.1)':urgent?'rgba(217,68,43,.08)':K.c1,
                        border:'1px solid '+(v.listos===v.total?K.gr:urgent?'rgba(217,68,43,.4)':K.rule),
                        borderRadius:10, padding:14,
                        display:'flex', flexDirection:'column', gap:8,
                      }}>
                        {/* Número grande de pendientes */}
                        <div style={{ fontFamily:SE, fontSize:52, fontWeight:500, lineHeight:1,
                          color: v.listos===v.total?K.gr:urgent?K.red:K.fg }}>
                          {pendientes}
                        </div>
                        {/* Nombre del producto */}
                        <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.04em',
                          textTransform:'uppercase', color:K.fg2, lineHeight:1.2 }}>
                          {nombre}
                        </div>
                        {/* Mini barra + ratio */}
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          <div style={{ height:3, background:K.rule, borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:pct+'%',
                              background:v.listos===v.total?K.gr:K.amb,
                              borderRadius:2, transition:'width .3s' }}/>
                          </div>
                          <div style={{ fontFamily:SM, fontSize:9, color:K.fg3 }}>
                            {v.listos}/{v.total} listos
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()
        ) : vistaPase ? (
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
                    <div key={c.id} style={{ background:allDone?'rgba(63,125,68,.12)':urgente?'rgba(217,68,43,.06)':K.c1, border:'1px solid '+(allDone?K.gr:urgente?'rgba(217,68,43,.35)':K.rule), borderRadius:10, padding:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                        <span style={{ fontFamily:SE, fontSize:44, fontWeight:500, color:allDone?K.gr:K.fg, lineHeight:1, minWidth:90 }}>
                          {c.mesa?.codigo}{c.mesa?.nombre ? <span style={{display:'block',fontFamily:"'Newsreader',serif",fontSize:12,opacity:.7,fontStyle:'italic',lineHeight:1.3,marginTop:2}}>{c.mesa.nombre}</span> : null}
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
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
                            <button onClick={()=>cerrar(c.id,c.mesa_id,c.camarero_id,c.mesa?.codigo)}
                              style={{ background:K.gr, border:'none', color:'#fff', padding:'14px 20px', borderRadius:4, fontFamily:SM, fontSize:13, fontWeight:700, letterSpacing:'.08em', cursor:'pointer', minWidth:110 }}>
                              MARCHAR
                            </button>
                            {/* Preview receptor */}
                            {(() => {
                              const zonaId = (c.mesa as unknown as { zona_id?: string })?.zona_id
                              const runningNombre = zonaId ? runningPorZona[zonaId] : null
                              return runningNombre ? (
                                <div style={{ fontFamily:SM, fontSize:9, color:K.gr, letterSpacing:'.06em' }}>
                                  → {runningNombre} (running)
                                </div>
                              ) : (
                                <div style={{ fontFamily:SM, fontSize:9, color:K.fg3, letterSpacing:'.06em' }}>
                                  → {c.camarero?.nombre}
                                </div>
                              )
                            })()}
                          </div>
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
        ) : vistaCompacta ? (
          /* ── VISTA COMPACTA ── */
          <div className="kds-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:6 }}>
            {comandasFiltradas.map(c => {
              const allDone = (c.items||[]).every(it=>it.estado==='listo')
              const col = edadColor(c.created_at)
              const urgente = col===K.red
              const pendientes = (c.items||[]).filter(it=>it.estado!=='listo')
              return (
                <div key={c.id} style={{ position:'relative', background:urgente?'rgba(217,68,43,.06)':col===K.amb?'rgba(232,163,59,.06)':'rgba(63,125,68,.04)', border:`1px solid ${urgente?'rgba(217,68,43,.3)':col===K.amb?'rgba(232,163,59,.25)':'rgba(63,125,68,.2)'}`, borderRadius:10, padding:'8px 12px', animation:'slideIn .3s ease' }}>
                  {allDone && (
                    <div onClick={()=>cerrar(c.id,c.mesa_id,c.camarero_id,c.mesa?.codigo)} style={{ position:'absolute', inset:0, background:'rgba(13,11,8,.8)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:2 }}>
                      <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, letterSpacing:'.1em', color:K.gr }}>LISTO — TAP</span>
                    </div>
                  )}
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontFamily:SE, fontSize:22, fontWeight:500, color:K.fg, lineHeight:1, minWidth:50 }}>{c.mesa?.codigo}</span>
                    <span style={{ fontFamily:SM, fontSize:11, color:col, fontWeight:700, animation:urgente?'pulse 1.5s ease-in-out infinite':'none' }}>{edadStr(c.created_at)}</span>
                    {(c as unknown as {nota_general?:string}).nota_general&&(
                      <span style={{ fontFamily:SN, fontSize:10, fontWeight:700, color:K.amb, background:"rgba(232,163,59,.15)", border:"1px solid rgba(232,163,59,.4)", borderRadius:4, padding:"2px 7px", letterSpacing:".03em" }}>
                        ⚠ {(c as unknown as {nota_general:string}).nota_general}
                      </span>
                    )}
                    <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:4 }}>
                      {(c.items||[]).map(it=>(
                        <span key={it.id} onClick={()=>toggle(it.id,it.estado)}
                          style={{ cursor:'pointer', padding:'3px 8px', borderRadius:3, fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase',
                            background:it.estado==='listo'?'rgba(63,125,68,.15)':K.rS,
                            border:`1px solid ${it.estado==='listo'?K.gr:K.rule}`,
                            color:it.estado==='listo'?K.gr:K.fg,
                            textDecoration:it.estado==='listo'?'line-through':'none',
                            opacity:it.estado==='listo'?0.5:1, transition:'all .15s' }}>
                          {it.cantidad}× {it.nombre}
                          {it.notas&&<span style={{ color:K.amb, fontWeight:400 }}> ·{it.notas}</span>}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontFamily:SM, fontSize:9, color:K.fg3 }}>{pendientes.length}/{(c.items||[]).length}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="kds-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
            {comandasFiltradas.map(c => {
              const allDone = (c.items||[]).every(it=>it.estado==='listo')
              const col = edadColor(c.created_at)
              const urgente = col===K.red
              const minutosComanda = Math.floor((Date.now()-new Date(c.created_at).getTime())/60000)
              return (
                <div key={c.id} style={{ position:'relative', background:urgente?'rgba(217,68,43,.08)':col===K.amb?'rgba(232,163,59,.08)':'rgba(63,125,68,.06)', border:`1px solid ${urgente?'rgba(217,68,43,.35)':col===K.amb?'rgba(232,163,59,.3)':'rgba(63,125,68,.25)'}`, borderRadius:10, padding:14, animation:'slideIn .3s ease' }}>
                  {(() => {
                    const hayPendientesPesar = (c.items||[]).some(it => (it as unknown as {peso_gramos:number|null;precio_kg_en_venta:number|null}).peso_gramos === null && (it as unknown as {precio_kg_en_venta:number|null}).precio_kg_en_venta)
                    return allDone && !hayPendientesPesar ? (
                      <div onClick={()=>cerrar(c.id,c.mesa_id,c.camarero_id,c.mesa?.codigo)} style={{ position:'absolute', inset:0, background:'rgba(13,11,8,.75)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:2 }}>
                        <span style={{ fontFamily:SM, fontSize:14, fontWeight:700, letterSpacing:'.1em', color:K.gr }}>LISTO — TAP</span>
                      </div>
                    ) : allDone && hayPendientesPesar ? (
                      <div style={{ position:'absolute', inset:0, background:'rgba(13,11,8,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2 }}>
                        <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, letterSpacing:'.08em', color:K.amb }}>⚖ PESAR ANTES DE MARCHAR</span>
                      </div>
                    ) : null
                  })()}
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
                  {(c as unknown as {nota_general?:string}).nota_general&&(
                    <div style={{ margin:"0 0 10px 0", padding:"7px 12px", background:"rgba(232,163,59,.12)", border:"1px solid rgba(232,163,59,.4)", borderRadius:6, fontFamily:SN, fontSize:12, fontWeight:700, color:K.amb, letterSpacing:".03em" }}>
                      ⚠ NOTA · {(c as unknown as {nota_general:string}).nota_general}
                    </div>
                  )}
                    {(c.items||[]).map(it=>{
                      const itEx = it as unknown as {peso_gramos:number|null;pesado_en_cocina:boolean;precio_kg_en_venta:number|null;producto_id:string|null}
                      const pendientePesar = itEx.peso_gramos === null && !!itEx.precio_kg_en_venta
                      return (
                      <div key={it.id}
                        onClick={()=> pendientePesar
                          ? setItemAPesar({ id: it.id, nombre: it.nombre, precio_por_kg: itEx.precio_kg_en_venta })
                          : toggle(it.id,it.estado)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${K.rule}`, cursor:'pointer',
                          opacity: pendientePesar ? 1 : it.estado==='listo' ? .4 : 1,
                          transition:'opacity .15s', minHeight:44,
                          background: pendientePesar ? 'rgba(232,163,59,.06)' : 'transparent',
                        }}>
                        {pendientePesar ? (
                          <div style={{ width:20, height:20, borderRadius:3, border:`2px solid ${K.amb}`, background:'rgba(232,163,59,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11 }}>⚖</div>
                        ) : (
                          <div style={{ width:20, height:20, borderRadius:3, border:`2px solid ${it.estado==='listo'?K.gr:K.rS}`, background:it.estado==='listo'?K.gr:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                            {it.estado==='listo'&&<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1 5 4 8 9 2" stroke={K.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        )}
                        <div style={{ flex:1 }}>
                          <div style={{ fontFamily:SM, fontSize:14, fontWeight:700, letterSpacing:'.05em', color: pendientePesar ? K.amb : K.fg, textTransform:'uppercase', textDecoration:it.estado==='listo'?'line-through':'none' }}>
                            {it.nombre}
                            {it.formato_nombre&&(
                              <span style={{ fontFamily:SM, fontSize:10, fontWeight:600, marginLeft:6, padding:'1px 5px', borderRadius:2, background:K.rule, color:K.fg3, letterSpacing:'.06em', verticalAlign:'middle' }}>
                                {it.formato_nombre.toUpperCase()}
                              </span>
                            )}
                            {pendientePesar && (
                              <span style={{ fontFamily:SM, fontSize:9, fontWeight:700, marginLeft:6, padding:'1px 6px', borderRadius:2, background:'rgba(232,163,59,.2)', color:K.amb, letterSpacing:'.08em', verticalAlign:'middle' }}>
                                PESAR
                              </span>
                            )}
                            {itEx.pesado_en_cocina && itEx.peso_gramos && (
                              <span style={{ fontFamily:SM, fontSize:9, fontWeight:700, marginLeft:6, padding:'1px 6px', borderRadius:2, background:'rgba(63,125,68,.15)', color:K.gr, letterSpacing:'.06em', verticalAlign:'middle' }}>
                                {itEx.peso_gramos}g
                              </span>
                            )}
                          </div>
                          {it.notas&&<div style={{ fontFamily:SN, fontSize:11, color:K.amb, marginTop:2 }}>{it.notas}</div>}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, flexShrink:0 }}>
                          <span style={{ fontFamily:SM, fontSize:13, color:K.fg3 }}>{it.cantidad}x</span>
                          {minutosComanda > 0 && it.estado !== 'listo' && (
                            <span style={{ fontFamily:SM, fontSize:8, color:minutosComanda>20?K.red:minutosComanda>10?K.amb:K.fg3, letterSpacing:'.06em' }}>+{minutosComanda}m</span>
                          )}
                        </div>
                        {!seccionFiltro&&it.seccion_id&&(
                          <span style={{ fontFamily:SM, fontSize:8, padding:'2px 5px', borderRadius:2, background:K.rule, color:K.fg3, letterSpacing:'.06em' }}>
                            {it.seccion_id.toUpperCase()}
                          </span>
                        )}
                      </div>
                    )})}
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
        session={effectiveSession}
        onConfirmed={handleVozConfirmada}
      />


      {/* ══ MODAL CHULETA VOZ ══════════════════ */}
      {chuleteAbierto && (
        <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.6)',
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setChuleteAbierto(false)}>
          <div style={{ background:K.bg, borderRadius:'16px 16px 0 0', width:'100%', maxWidth:480,
            maxHeight:'85vh', overflowY:'auto', scrollbarWidth:'none' as const }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'14px 16px 10px', borderBottom:`0.5px solid ${K.rule}` }}>
              <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:15, color:K.fg }}>Chuleta Voz</span>
              <button onClick={() => setChuleteAbierto(false)} style={{ background:'none', border:'none',
                color:K.fg3, cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
            </div>
            <ChuletaVoz rol="cocina" />
          </div>
        </div>
      )}

      {/* ══ BANNER MENSAJE BLOQUEANTE ══════════ */}
      {bannerMensaje && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: '#1F1A15', border: `2px solid ${K.amb}`,
            borderRadius: 16, padding: '32px 28px', maxWidth: 480, width: '100%',
            boxShadow: `0 0 40px ${K.amb}44`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>📢</span>
              <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, fontWeight: 700,
                color: K.amb, letterSpacing: 1, textTransform: 'uppercase' }}>
                Mensaje de sala
              </span>
            </div>
            <div style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: K.fg3,
              marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {bannerMensaje.origen}
            </div>
            <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 26,
              fontStyle: 'italic', color: K.fg, lineHeight: 1.3, marginBottom: 28 }}>
              &ldquo;{bannerMensaje.texto}&rdquo;
            </div>
            <button
              onClick={() => setBannerMensaje(null)}
              style={{
                width: '100%', padding: '14px 0',
                background: K.red, border: 'none', borderRadius: 10,
                fontFamily: 'Inter Tight, sans-serif', fontSize: 16, fontWeight: 700,
                color: '#fff', cursor: 'pointer', letterSpacing: 0.5,
              }}
            >
              ENTENDIDO
            </button>
          </div>
        </div>
      )}

      {/* ══ PANEL CHAT — slide-in desde la derecha ══════════ */}
      {chatAbierto && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 320, maxWidth: '90vw',
          background: K.c1, borderLeft: `1px solid ${K.rule}`, zIndex: 200,
          display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,.15)',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${K.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: K.bg }}>
            <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: K.fg, letterSpacing: '.05em' }}>MENSAJES DEL TURNO</span>
            <button onClick={() => setChatAbierto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: K.fg3, fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mensajes.length === 0 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: SE, fontStyle: 'italic', color: K.fg3, fontSize: 14, textAlign: 'center' }}>Sin mensajes aún</span>
              </div>
            )}
            {mensajes.map(m => {
              const esMio = m.camarero_id === effectiveSession?.id
              const rolColor = ({ camarero: K.tl, cocina: K.red, jefe_sala: K.amb, running: K.gr } as Record<string,string>)[m.rol_origen] ?? K.fg3
              const rolLabel = ({ camarero: 'Sala', cocina: 'Cocina', jefe_sala: 'Jefe', running: 'Running' } as Record<string,string>)[m.rol_origen] ?? m.rol_origen
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: esMio ? 'flex-end' : 'flex-start' }}>
                  {!esMio && (
                    <span style={{ fontFamily: SN, fontSize: 10, color: rolColor, marginBottom: 2, paddingLeft: 4 }}>
                      {m.nombre_origen} · {rolLabel}{m.mesa_ref ? ` · ${m.mesa_ref}` : ''}
                    </span>
                  )}
                  <div style={{
                    maxWidth: '85%', padding: '7px 11px',
                    borderRadius: esMio ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: esMio ? K.red : K.bg,
                    border: esMio ? 'none' : `1px solid ${K.rule}`,
                    color: esMio ? '#fff' : K.fg,
                    fontFamily: SN, fontSize: 13, lineHeight: 1.4,
                  }}>
                    {m.texto}
                  </div>
                  <span style={{ fontFamily: SM, fontSize: 9, color: K.fg3, marginTop: 2, paddingLeft: esMio ? 0 : 4, paddingRight: esMio ? 4 : 0 }}>
                    {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Plantillas rápidas */}
          <div style={{ padding: '6px 10px', borderTop: `1px solid ${K.rule}`, display: 'flex', gap: 5, flexWrap: 'wrap', background: K.bg }}>
            {['86 un producto', 'La mesa está lista', 'Falta guarnición', '¿Cuánto falta?'].map(t => (
              <button key={t} onClick={() => setChatTexto(t)} style={{
                padding: '3px 8px', borderRadius: 14, border: `1px solid ${K.rule}`,
                background: K.c1, fontFamily: SN, fontSize: 11, color: K.fg2, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: `1px solid ${K.rule}`, display: 'flex', gap: 8, alignItems: 'flex-end', background: K.c1 }}>
            <textarea
              value={chatTexto}
              onChange={e => setChatTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (chatTexto.trim()) { enviarMensaje(chatTexto.trim(), { rol_destino: 'camarero' }); setChatTexto('') } } }}
              placeholder="Mensaje a sala..."
              rows={1}
              style={{
                flex: 1, padding: '7px 11px', borderRadius: 16,
                border: `1px solid ${K.rule}`, background: K.bg,
                fontFamily: SN, fontSize: 13, color: K.fg, resize: 'none', outline: 'none', lineHeight: 1.4,
              }}
            />
            <button
              onClick={() => { if (chatTexto.trim()) { enviarMensaje(chatTexto.trim(), { rol_destino: 'camarero' }); setChatTexto('') } }}
              disabled={!chatTexto.trim()}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: chatTexto.trim() ? K.red : K.rule, cursor: chatTexto.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={chatTexto.trim() ? '#fff' : K.fg3} strokeWidth={2}>
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Asistente IA Cocina */}
      <AsistenteCocinaPanel
        open={asistenteAbierto}
        onClose={() => setAsistenteAbierto(false)}
      />

      {/* Elaboraciones propias */}
      {elaborAbierto && (
        <div style={{
          position:'fixed', top:0, right:0, bottom:0, width:380, maxWidth:'95vw',
          background:K.c1, borderLeft:`1px solid ${K.rule}`, zIndex:200,
          display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px rgba(0,0,0,.12)',
        }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${K.rule}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:K.bg, flexShrink:0 }}>
            <span style={{ fontFamily:'Inter Tight,sans-serif', fontSize:13, fontWeight:700, color:K.amb }}>🏷️ ELABORACIONES</span>
            <button onClick={() => setElaborAbierto(false)} style={{ background:'none', border:'none', cursor:'pointer', color:K.fg3, fontSize:18 }}>✕</button>
          </div>
          <div style={{ flex:1, padding:'16px', overflowY:'auto' }}>
            <ElaboracionesPanel
              session={{ id: effectiveSession?.id ?? '', nombre: effectiveSession?.nombre ?? 'Cocina', restaurante_id: effectiveSession?.restaurante_id ?? '' }}
              sh={() => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })}
            />
          </div>
        </div>
      )}
    </div>

    {/* ── Modal pesar item ── */}
    {itemAPesar && (
      <PesarModal
        item={itemAPesar}
        onConfirm={(g) => confirmarPeso(g)}
        onClose={() => setItemAPesar(null)}
        loading={pesarLoading}
      />
    )}
    </>
  )
}

export default function KDSPage() {
  return (
    <>
    <Suspense fallback={<div style={{ minHeight:'100dvh', background:'#F6F1E7' }}/>}>
      <KDSInner />
    </Suspense>
    </>
  )
}
