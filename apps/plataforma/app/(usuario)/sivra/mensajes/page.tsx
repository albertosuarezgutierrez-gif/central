'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { resumenOrdenes } from '@/lib/sivra/extras/orden-texto'

type Msg    = { id: string; from: 'guest'|'host'; text: string; ts: string }
// 🧹 Orden a la limpieza de esta reserva. `enviadoAt` null = el email se intentó y NO salió (motivo
// en `error`); `tareaId` null = NO está en /invitado/limpieza, la única pantalla que mira Sique
// Brilla; la lista entera a `null` = no se pudo leer.
type Orden  = { instruccion: string; enviadoAt: string|null; error: string|null; tareaId: string|null }
type Thread = {
  id: string; guestName: string; property: string; propertyId?: string
  checkIn: string; checkOut: string; portal: string
  status: 'pendiente'|'respondido'|'urgente'; lastMsg: string; lastTs: string
  messages: Msg[]
  lang?: string; smoobuReservationId?: string
  classification?: 'trivial'|'info'|'importante'
  ordenes?: Orden[]|null    // undefined = todavía no se ha cargado el hilo
}

const STATUS_CONFIG = {
  pendiente:  { label:'Pendiente',  bg:'#fef3c7', text:'#92400e', dot:'#f59e0b' },
  urgente:    { label:'Urgente',    bg:'#fee2e2', text:'#991b1b', dot:'#ef4444' },
  respondido: { label:'Respondido', bg:'#dcfce7', text:'#166534', dot:'#22c55e' },
}
const PORTAL_COLOR: Record<string,string> = {
  BOOKING:'#003580', AIRBNB:'#FF5A5F', VRBO:'#3B5998',
  DIRECTO:'#10B981', EXPEDIA:'#FFC72C', AGODA:'#E84142', OTRO:'#5A9A12',
}
// Tonos del chip de órdenes a la limpieza. El de «no se ha podido consultar» es ÁMBAR a propósito:
// en verde se leería como «comprobado y todo en orden», que es justo lo que no se sabe.
const ORDEN_TONO: Record<string, { bg:string; color:string }> = {
  ok:     { bg:'#dcfce7', color:'#166534' },
  aviso:  { bg:'#fef3c7', color:'#92400e' },
  error:  { bg:'#fee2e2', color:'#991b1b' },
  neutro: { bg:'#f4f4f5', color:'#52525b' },
}

const CLASS_CONFIG = {
  trivial:    { icon:'✅', label:'Trivial',    color:'#22c55e', bg:'#dcfce7' },
  info:       { icon:'💬', label:'Info',       color:'#3b82f6', bg:'#dbeafe' },
  importante: { icon:'🔴', label:'Importante', color:'#ef4444', bg:'#fee2e2' },
}

// Sivra brand colors
const C = {
  lime: '#BBFF44',
  limeD: '#5A9A12',
  dark: '#1A2535',
  darkBg: '#1F1F28',
  border: '#E8EDF3',
  white: '#FFFFFF',
  muted: '#9898A8',
  muted2: '#6B7F96',
  red: '#ef4444',
}

function fmtTime(ts: string) {
  const d = new Date(ts); const now = new Date()
  const diffH = Math.floor((now.getTime()-d.getTime())/3600000)
  if(diffH<1) return 'Ahora'
  if(diffH<24) return `${diffH}h`
  return `${Math.floor(diffH/24)}d`
}
function fmtFull(ts: string) {
  return new Date(ts).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
}

function useResizable(defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(defaultWidth)
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(defaultWidth)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      setWidth(Math.max(min, Math.min(max, startW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [min, max])

  return { width, onMouseDown }
}

function useResizableV(defaultHeight: number, min: number, max: number) {
  const [height, setHeight] = useState(defaultHeight)
  const dragging = useRef(false)
  const startY   = useRef(0)
  const startH   = useRef(defaultHeight)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [height])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY.current - e.clientY
      setHeight(Math.max(min, Math.min(max, startH.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [min, max])

  return { height, onMouseDown }
}

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid ${C.lime}`, borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }}/>
  )
}

export default function MensajesPage() {
  const [threads, setThreads]     = useState<Thread[]>([])
  const [active, setActive]       = useState<string>('')
  const [filter, setFilter]       = useState<'activos'|'respondido'|'todos'|'trivial'>('activos')
  const [reply, setReply]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDraft, setAiDraft]     = useState('')
  const [aiSource, setAiSource]   = useState<'knowledge_base'|'claude'|'business_rule'>('claude')
  const [aiAlert, setAiAlert]     = useState<string|null>(null)
  const [aiCategory, setAiCategory] = useState<string|null>(null)
  const [aiLang, setAiLang]       = useState<string>('es')
  const [guestUrl, setGuestUrl]   = useState<string|null>(null)
  const [mobileView, setMobileView] = useState<'list'|'chat'>('list')
  const [isMobile, setIsMobile]   = useState(false)

  const [hint, setHint]           = useState('')
  const [kbSaved, setKbSaved]     = useState(false)

  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMsgs, setLoadingMsgs]       = useState(false)
  const [copied, setCopied]                  = useState(false)
  const [gmailLoading, setGmailLoading]      = useState(false)

  const [translatedThreads, setTranslatedThreads] = useState<Set<string>>(new Set())
  const [translating, setTranslating]             = useState(false)
  const [translations, setTranslations]           = useState<Record<string, Record<string,string>>>({})

  const msgEnd = useRef<HTMLDivElement>(null)
  const listPanel   = useResizable(300, 200, 520)
  const bottomPanel = useResizableV(200, 120, 500)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setLoadingThreads(true)
    try {
      const res = await fetch('/api/sivra/mensajes', { cache: 'no-store' })
      const d = await res.json()
      if (d.threads) {
        setThreads(prev => {
          const cache = new Map(prev.map(t => [t.id, t.messages]))
          return d.threads.map((t: Thread) => ({ ...t, messages: cache.get(t.id) || [] }))
        })
        setActive(prev => prev || (d.threads.find((t:Thread) => t.status==='urgente')?.id || (d.threads[0]?.id ?? '')))
      }
    } catch {}
    finally { if (!silent) setLoadingThreads(false) }
  }, [])

  useEffect(() => {
    loadThreads()
    const iv = setInterval(() => loadThreads(true), 120_000)
    return () => clearInterval(iv)
  // eslint-disable-next-line
  }, [])

  useEffect(() => {
    if (!active) return
    setThreads(prev => {
      const t = prev.find(x => x.id === active)
      if (!t || t.messages.length > 0) return prev
      setLoadingMsgs(true)
      fetch(`/api/sivra/mensajes/${active}`)
        .then(r => r.json())
        .then(d => {
          if (d.messages) {
            setThreads(cur => cur.map(x => x.id === active ? { ...x, messages: d.messages, ordenes: d.ordenes ?? null } : x))
          }
        })
        .finally(() => setLoadingMsgs(false))
      return prev
    })
  // eslint-disable-next-line
  }, [active])

  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [active, threads])
  useEffect(() => { setHint(''); setKbSaved(false); setAiDraft(''); setAiAlert(null) }, [active])

  const thread = threads.find(t => t.id === active)
  const ORDER = { urgente:0, pendiente:1, respondido:2 }
  const filtered = threads
    .filter(t =>
      filter === 'todos' ? true :
      filter === 'trivial' ? t.classification === 'trivial' :
      filter === 'activos' ? (t.status === 'pendiente' || t.status === 'urgente') :
      t.status === filter
    )
    .sort((a,b) => ORDER[a.status] - ORDER[b.status])

  const urgentCount  = threads.filter(t => t.status === 'urgente').length
  const pendCount    = threads.filter(t => t.status === 'pendiente' || t.status === 'urgente').length
  const trivialCount = threads.filter(t => t.classification === 'trivial').length

  async function translateThread() {
    if(!thread) return
    const isShowing = translatedThreads.has(thread.id)
    if(isShowing) { setTranslatedThreads(prev=>{const s=new Set(prev);s.delete(thread.id);return s}); return }
    if(translations[thread.id]) { setTranslatedThreads(prev=>new Set(prev).add(thread.id)); return }
    setTranslating(true)
    const lang = (thread.lang || 'EN').toLowerCase()
    const guestMsgs = thread.messages.filter(m=>m.from==='guest')
    const results: Record<string,string> = {}
    for(const msg of guestMsgs) {
      try {
        const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(msg.text)}&langpair=${lang}|es`
        const res = await fetch(apiUrl)
        const d = await res.json()
        const translated = d?.responseData?.translatedText
        if(translated && translated !== msg.text) results[msg.id] = translated
      } catch {}
    }
    setTranslations(prev=>({...prev,[thread.id]:results}))
    setTranslatedThreads(prev=>new Set(prev).add(thread.id))
    setTranslating(false)
  }

  function getDisplayText(msg: Msg): { text: string; isTranslated: boolean } {
    const isShowing = translatedThreads.has(thread?.id ?? '')
    if(isShowing && msg.from==='guest' && translations[thread?.id ?? '']?.[msg.id]) {
      return { text: translations[thread!.id][msg.id], isTranslated: true }
    }
    return { text: msg.text, isTranslated: false }
  }

  async function persistStatus(bookingId: string, status: string) {
    try {
      await fetch(`/api/sivra/mensajes/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    } catch {}
  }

  function sendReply(text: string) {
    if(!text.trim()) return
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
    persistStatus(active, 'respondido')
    const msg: Msg = { id:`m${Date.now()}`, from:'host', text:text.trim(), ts:new Date().toISOString() }
    setThreads(prev=>{
      const updated = prev.map(t=>t.id===active
        ? {...t, status:'respondido' as const, messages:[...t.messages,msg], lastMsg:text.trim(), lastTs:msg.ts}
        : t
      )
      const nextActive = updated.find(t=>t.id!==active&&(t.status==='pendiente'||t.status==='urgente'))
      if(nextActive) setTimeout(()=>setActive(nextActive.id),150)
      return updated
    })
    setReply('')
    setAiDraft('')
    setAiAlert(null)
    setHint('')
  }

  async function saveToKB(text: string, lang: string, category: string | null) {
    if (!thread || !text.trim()) return
    try {
      const field = lang === 'en' ? 'answer_en' : lang === 'fr' ? 'answer_fr' : lang === 'de' ? 'answer_de' : lang === 'it' ? 'answer_it' : 'answer_es'
      const kws = [thread.guestName.split(' ')[0].toLowerCase(), category || 'faq', thread.property.split(' ')[0].toLowerCase()]
      await fetch('/api/sivra/mensajes/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category || 'faq',
          keywords: kws,
          property_id: thread.propertyId || 'all',
          [field]: text.trim(),
        })
      })
      setKbSaved(true)
      setTimeout(() => setKbSaved(false), 4000)
    } catch {}
  }

  async function openGmailDraft(text: string) {
    if (!thread || !text.trim()) return
    setGmailLoading(true)
    try {
      const res = await fetch(`/api/sivra/mensajes/${thread.smoobuReservationId}`)
      const data = await res.json()
      const email     = data.email || ''
      const guestName = data.guestName || thread.guestName
      const reference = data.reference || thread.smoobuReservationId || thread.id
      const subject   = `Re: Reserva ${reference} - ${guestName}`
      const gmailUrl  = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
      window.open(gmailUrl, '_blank')
      if (text === aiDraft && aiSource === 'claude' && hint.trim()) {
        saveToKB(text, aiLang, aiCategory)
      }
    } catch {
      alert('Error obteniendo email del huésped')
    }
    setGmailLoading(false)
  }

  async function generateAI() {
    if(!thread) return
    setAiLoading(true)
    setAiDraft('')
    setAiAlert(null)
    setKbSaved(false)
    try {
      const res = await fetch('/api/sivra/mensajes/reply', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          guestName:           thread.guestName,
          property:            thread.property,
          propertyId:          thread.propertyId || 'all',
          checkIn:             thread.checkIn,
          checkOut:            thread.checkOut,
          portal:              thread.portal,
          messages:            thread.messages,
          smoobuReservationId: thread.smoobuReservationId || null,
          hint:                hint.trim() || undefined,
        })
      })
      const data = await res.json()

      if (data.action === 'needs_decision') {
        setAiAlert(data.alert || '⚠️ Este mensaje requiere tu atención personal.')
        setAiSource('business_rule')
      } else if(data.reply) {
        setAiDraft(data.reply)
        setReply(data.reply)
        setAiSource(data.source === 'knowledge_base' ? 'knowledge_base' : data.source === 'business_rule' ? 'business_rule' : 'claude')
        setAiCategory(data.category || null)
        setAiLang(data.lang || 'es')
        setGuestUrl(data.guestAppUrl || null)
      } else {
        setAiDraft('⚠️ ' + (data.error || 'Error generando respuesta'))
      }
    } catch {
      setAiDraft('⚠️ Error de conexión con la API')
    } finally { setAiLoading(false) }
  }

  const hasNonSpanish = thread && thread.lang && thread.lang !== 'ES'
  const showList = !isMobile || mobileView === 'list'
  const showChat = !isMobile || mobileView === 'chat'

  if (loadingThreads) return (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <Spinner size={32}/>
        <p style={{ fontSize:14, color:C.muted, marginTop:12 }}>Cargando mensajes…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @media (max-width: 768px) {
          .msg-bubble { max-width: 90% !important; }
          .msg-actions { flex-wrap: wrap !important; }
          .msg-reply-row { flex-direction: column !important; }
          .msg-reply-row > div:last-child { flex-direction: row !important; }
          .msg-hint-row { flex-wrap: wrap !important; }
        }
      `}</style>
      <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden' }}>

        {/* ── Thread list ── */}
        {showList && (
          <div style={{
            display:'flex', flexDirection:'column',
            borderRight:`1px solid ${C.border}`, background:C.white,
            width: isMobile ? '100%' : listPanel.width,
            minWidth: isMobile ? undefined : 200,
            maxWidth: isMobile ? undefined : 520,
            flexShrink: 0,
          }}>
            <div style={{ padding:'16px', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <h1 style={{ fontSize:15, fontWeight:700, color:C.dark }}>Mensajes</h1>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {urgentCount>0&&(
                    <span style={{ padding:'2px 8px', borderRadius:20, background:C.red, fontSize:11, fontWeight:700, animation:'pulse 1.5s infinite' }}>{urgentCount} 🔴</span>
                  )}
                  {pendCount>0&&urgentCount===0&&(
                    <span style={{ padding:'2px 8px', borderRadius:20, background:'#f59e0b', fontSize:11, fontWeight:700 }}>{pendCount}</span>
                  )}
                  <button onClick={()=>loadThreads()} title="Actualizar" style={{
                    width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                    borderRadius:'50%', border:`1px solid ${C.border}`, color:C.muted, background:'none',
                    fontSize:16, cursor:'pointer',
                  }}>↻</button>
                </div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {([
                  {id:'activos',    label:'Activos',     color:C.lime,    count: pendCount},
                  {id:'respondido', label:'Respondidos', color:'#22c55e', count: 0},
                  {id:'trivial',    label:`Trivial${trivialCount>0?` (${trivialCount})`:''}`, color:C.muted, count: 0},
                  {id:'todos',      label:'Todos',       color:C.muted,   count: 0},
                ] as const).map(f=>(
                  <button key={f.id} onClick={()=>setFilter(f.id)} style={{
                    padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:500,
                    background: filter===f.id ? f.color : 'transparent',
                    color: filter===f.id ? (f.color===C.lime?C.dark:C.white) : '#71717a',
                    border: `1px solid ${filter===f.id ? 'transparent' : C.border}`,
                    cursor:'pointer',
                  }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto' }}>
              {filtered.length===0&&(
                <div style={{ padding:'32px', textAlign:'center' }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>✅</div>
                  <p style={{ fontSize:14, fontWeight:500, color:C.dark }}>Todo al día</p>
                  <p style={{ fontSize:12, color:C.muted2, marginTop:4 }}>No hay mensajes pendientes</p>
                </div>
              )}
              {filtered.map(t=>{
                const s = STATUS_CONFIG[t.status]
                const cls = t.classification ? CLASS_CONFIG[t.classification] : null
                const isUrgent = t.status === 'urgente'
                return (
                  <button key={t.id} onClick={()=>{setActive(t.id);setMobileView('chat')}}
                    style={{
                      width:'100%', textAlign:'left', padding:'14px 16px',
                      borderBottom:`1px solid ${C.border}`,
                      borderLeft:`3px solid ${isUrgent ? C.red : 'transparent'}`,
                      background: active===t.id ? C.darkBg : isUrgent ? 'rgba(239,68,68,0.04)' : 'transparent',
                      cursor:'pointer',
                    }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:600, color:C.dark }}>{t.guestName}</span>
                      <span style={{ fontSize:10, color:C.muted2, flexShrink:0, marginLeft:8 }}>{fmtTime(t.lastTs)}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, fontWeight:500, padding:'2px 6px', borderRadius:4, background:PORTAL_COLOR[t.portal]||C.limeD, color:'#fff' }}>{t.portal}</span>
                      <span style={{ fontSize:10, color:C.muted }}>{t.property}</span>
                      {cls && (
                        <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:20, background:cls.bg, color:cls.color }}>
                          {cls.icon}
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, color:C.muted, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.lastMsg}</span>
                      <span style={{ marginLeft:8, width:8, height:8, borderRadius:'50%', background:s.dot, flexShrink:0, display:'inline-block' }}/>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Drag handle (solo desktop) ── */}
        {!isMobile && (
          <div
            onMouseDown={listPanel.onMouseDown}
            style={{ width:6, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', cursor:'col-resize', background:'transparent', position:'relative' }}
            title="Arrastra para redimensionar"
          >
            <div style={{ width:1, height:'100%', background:C.border }}/>
          </div>
        )}

        {/* ── Chat panel ── */}
        {showChat && (
          thread ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', background:C.white, minWidth:0 }}>
              {/* Chat header */}
              <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:'14px 20px', display:'flex', alignItems:'center', gap:12 }}>
                {isMobile && (
                  <button onClick={()=>setMobileView('list')} style={{
                    width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                    borderRadius:4, border:`1px solid ${C.border}`, background:'none', color:C.muted, fontSize:18, cursor:'pointer', flexShrink:0,
                  }}>←</button>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, color:C.dark }}>{thread.guestName}</span>
                    <span style={{ fontSize:12, padding:'2px 8px', borderRadius:4, fontWeight:500, background:PORTAL_COLOR[thread.portal]||C.limeD, color:'#fff' }}>{thread.portal}</span>
                    {thread.lang&&<span style={{ fontSize:12, color:C.muted, border:`1px solid ${C.border}`, padding:'2px 6px', borderRadius:4 }}>{thread.lang}</span>}
                    <span style={{ fontSize:12, padding:'2px 8px', borderRadius:20, fontWeight:500, background:STATUS_CONFIG[thread.status].bg, color:STATUS_CONFIG[thread.status].text }}>
                      {STATUS_CONFIG[thread.status].label}
                    </span>
                    {thread.classification && (
                      <span style={{ fontSize:12, padding:'2px 8px', borderRadius:20, fontWeight:500, background:CLASS_CONFIG[thread.classification].bg, color:CLASS_CONFIG[thread.classification].color }}>
                        {CLASS_CONFIG[thread.classification].icon} {CLASS_CONFIG[thread.classification].label}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
                    {thread.property}
                    {thread.checkIn ? ` · Entrada ${thread.checkIn}` : ''}
                    {thread.checkOut ? ` · Salida ${thread.checkOut}` : ''}
                  </div>
                  {(() => {
                    const r = resumenOrdenes(thread.ordenes)
                    if (!r) return null
                    return (
                      <div style={{
                        marginTop:4, fontSize:12, fontWeight:500, padding:'3px 8px', borderRadius:6,
                        background:ORDEN_TONO[r.tono].bg, color:ORDEN_TONO[r.tono].color,
                        display:'inline-block', maxWidth:'100%', overflowWrap:'anywhere',
                      }}>{r.texto}</div>
                    )
                  })()}
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  {hasNonSpanish&&(
                    <button
                      onClick={translateThread}
                      disabled={translating}
                      style={{
                        display:'flex', alignItems:'center', gap:4, fontSize:10, padding:'4px 8px',
                        borderRadius:4, border:`1px solid ${translatedThreads.has(thread.id)?C.lime:C.border}`,
                        color: translatedThreads.has(thread.id)?C.limeD:'#71717a',
                        background:'transparent', cursor:'pointer', opacity: translating ? 0.5 : 1,
                      }}>
                      {translating
                        ? <><Spinner size={10}/>Traduciendo…</>
                        : <>{translatedThreads.has(thread.id)?'🌐 Ver original':'🌐 Traducir ES'}</>
                      }
                    </button>
                  )}
                  {thread.smoobuReservationId && (
                    <a
                      href={`https://login.smoobu.com/reservation/${thread.smoobuReservationId}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:C.limeD, background:'#f0fff4', padding:'3px 10px', borderRadius:20, textDecoration:'none', fontWeight:600 }}
                    >
                      🔗 Smoobu
                    </a>
                  )}
                  {(['pendiente','respondido','urgente'] as const).filter(s=>s!==thread.status).map(s=>(
                    <button key={s} onClick={()=>{ setThreads(prev=>prev.map(t=>t.id===active?{...t,status:s}:t)); persistStatus(active, s) }}
                      style={{ fontSize:10, padding:'4px 8px', borderRadius:4, border:`1px solid ${C.border}`, color:C.muted, background:'none', cursor:'pointer' }}>
                      → {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>
                {loadingMsgs&&(
                  <div style={{ display:'flex', justifyContent:'center', padding:'32px 0' }}>
                    <Spinner size={20}/>
                  </div>
                )}
                {!loadingMsgs && thread.messages.length === 0 && (
                  <div style={{ textAlign:'center', fontSize:12, color:C.muted2, padding:'32px 0' }}>No hay mensajes en este hilo</div>
                )}
                {thread.messages.map(msg=>{
                  const { text: displayText, isTranslated } = getDisplayText(msg)
                  const isHost = msg.from === 'host'
                  return (
                    <div key={msg.id} style={{ display:'flex', justifyContent: isHost ? 'flex-end' : 'flex-start' }}>
                      <div className="msg-bubble" style={{ maxWidth:'75%' }}>
                        <div style={{
                          borderRadius: isHost ? '6px 6px 0 6px' : '6px 6px 6px 0',
                          padding:'10px 16px', fontSize:14, lineHeight:1.5,
                          background: isHost ? C.lime : C.white,
                          color: C.dark,
                          border: isHost ? 'none' : `1px solid ${C.border}`,
                        }}>
                          <span style={{ whiteSpace:'pre-wrap' }}>{displayText}</span>
                        </div>
                        <div style={{ fontSize:10, color:C.muted2, marginTop:4, display:'flex', alignItems:'center', gap:4, justifyContent: isHost ? 'flex-end' : 'flex-start' }}>
                          {isHost?'Tú':'Huésped'} · {fmtFull(msg.ts)}
                          {isTranslated&&<span style={{ fontSize:9, background:'#ede9fe', color:'#7c3aed', padding:'1px 4px', borderRadius:4 }}>🌐 ES</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {aiLoading&&(
                  <div style={{ display:'flex', justifyContent:'flex-start' }}>
                    <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:6, padding:'10px 16px', fontSize:14, color:C.muted, display:'flex', alignItems:'center', gap:8 }}>
                      <Spinner size={16}/>
                      {hint.trim() ? 'Redactando con tu idea…' : 'Analizando con reglas + IA…'}
                    </div>
                  </div>
                )}
                <div ref={msgEnd}/>
              </div>

              {/* Alert banner */}
              {aiAlert&&!aiLoading&&(
                <div style={{ margin:'0 20px 8px', padding:12, background:'#7f1d1d', border:'1px solid #ef4444', borderRadius:6 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <span style={{ fontSize:14, color:'#fecaca', lineHeight:1.5 }}>{aiAlert}</span>
                    <button onClick={()=>setAiAlert(null)} style={{ fontSize:10, color:'#fca5a5', background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>✕</button>
                  </div>
                  <p style={{ fontSize:12, color:'#f87171', marginTop:6 }}>Decide y responde manualmente.</p>
                </div>
              )}

              {/* AI draft banner */}
              {aiDraft&&!aiLoading&&(
                <div style={{ margin:'0 20px 8px', padding:12, background:C.white, border:`1px solid ${C.border}`, borderRadius:6 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, fontWeight:600, color:C.limeD }}>
                        {aiSource==='knowledge_base' ? '🧠 Base de conocimiento propia' :
                         aiSource==='business_rule'  ? '📋 Regla de negocio' :
                         hint.trim() ? '✏️ Borrador IA (con tu idea)' : '✨ Borrador IA (Claude)'}
                      </span>
                      {hint.trim() && aiSource === 'claude' && (
                        <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0' }}>
                          💡 {hint.length > 30 ? hint.slice(0,30)+'…' : hint}
                        </span>
                      )}
                    </div>
                    <button onClick={()=>{setAiDraft('');setReply('');setHint('')}}
                      style={{ fontSize:10, color:C.muted2, background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>descartar</button>
                  </div>
                  <p style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>{aiDraft}</p>
                  {guestUrl&&(
                    <a href={guestUrl} target="_blank" rel="noreferrer"
                      style={{ display:'block', marginTop:6, fontSize:10, color:C.limeD, textDecoration:'underline', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      🔗 Guía personalizada huésped
                    </a>
                  )}
                  <div className="msg-actions" style={{ display:'flex', gap:8, marginTop:8, alignItems:'center', flexWrap:'wrap' }}>
                    <button onClick={()=>sendReply(aiDraft)} style={{ padding:'4px 12px', background:C.lime, color:C.dark, fontSize:12, fontWeight:600, borderRadius:4, border:'none', cursor:'pointer' }}>
                      Copiar
                    </button>
                    <button onClick={()=>openGmailDraft(aiDraft)} disabled={gmailLoading} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 12px', background:'#1a73e8', color:'#fff', fontSize:12, fontWeight:600, borderRadius:4, border:'none', cursor:'pointer', opacity: gmailLoading ? 0.4 : 1 }}>
                      {gmailLoading ? '…' : '✉ Gmail'}
                    </button>
                    {hint.trim() && aiSource === 'claude' && !kbSaved && (
                      <button onClick={()=>saveToKB(aiDraft, aiLang, aiCategory)} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 12px', fontSize:12, fontWeight:600, borderRadius:4, border:`1px solid ${C.border}`, color:C.limeD, background:'none', cursor:'pointer' }}>
                        💾 Guardar en KB
                      </button>
                    )}
                    {kbSaved && (
                      <span style={{ fontSize:10, color:C.limeD, fontWeight:500 }}>✅ Guardado en Knowledge Base</span>
                    )}
                  </div>
                </div>
              )}

              {/* Copy toast */}
              {copied&&(
                <div style={{ margin:'0 20px 4px', padding:'6px 12px', background:'#14532d', border:'1px solid #166534', borderRadius:4, fontSize:12, color:'#86efac', fontWeight:500 }}>
                  ✅ Mensaje copiado — pégalo en el portal de reserva
                </div>
              )}

              {/* Vertical drag handle */}
              <div
                onMouseDown={bottomPanel.onMouseDown}
                style={{ height:6, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', cursor:'row-resize', borderTop:`1px solid ${C.border}`, background:'transparent' }}
                title="Arrastra para redimensionar"
              />

              {/* Reply input */}
              <div style={{ background:C.white, padding:'16px 20px', overflowY:'auto', height:bottomPanel.height, flexShrink:0 }}>
                <div className="msg-hint-row" style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                  <button onClick={generateAI} disabled={aiLoading} style={{
                    display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:4, fontSize:12,
                    fontWeight:600, border:`1px solid ${C.border}`, color:C.limeD, background:'transparent',
                    cursor:'pointer', flexShrink:0, opacity: aiLoading ? 0.5 : 1,
                  }}>
                    <span>✨</span>
                    {aiLoading ? (hint.trim() ? 'Redactando…' : 'Analizando…') : 'Sugerir IA'}
                  </button>
                  <input
                    value={hint}
                    onChange={e=>setHint(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); generateAI() } }}
                    placeholder="💡 Tu idea (Enter para redactar)…"
                    style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:4, padding:'6px 12px', outline:'none', color:C.dark, background:C.white, minWidth:0 }}
                  />
                  <span style={{ fontSize:10, color:C.muted, flexShrink:0 }}>
                    {thread.classification === 'trivial' ? '💤 Trivial' :
                     thread.classification === 'importante' ? '🔴 Importante' :
                     thread.lang && thread.lang !== 'ES' ? `🌐 ${thread.lang}` : ''}
                  </span>
                </div>
                <div className="msg-reply-row" style={{ display:'flex', gap:8 }}>
                  <textarea
                    value={reply}
                    onChange={e=>setReply(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendReply(reply)}}}
                    placeholder="Escribe un mensaje… (Enter para copiar, Shift+Enter nueva línea)"
                    rows={3}
                    style={{ flex:1, fontSize:14, border:`1px solid ${C.border}`, borderRadius:6, padding:'10px 16px', outline:'none', resize:'none', color:C.dark, background:C.white }}
                  />
                  <div style={{ display:'flex', flexDirection:'column', gap:8, justifyContent:'flex-end' }}>
                    <button onClick={()=>sendReply(reply)} disabled={!reply.trim()||loading} style={{ padding:'8px 16px', borderRadius:6, background:C.lime, color:C.dark, fontSize:14, fontWeight:600, border:'none', cursor:'pointer', opacity: (!reply.trim()||loading)?0.4:1 }}>
                      Copiar
                    </button>
                    <button onClick={()=>openGmailDraft(reply)} disabled={!reply.trim()||gmailLoading} style={{ padding:'8px 16px', borderRadius:6, background:'#1a73e8', color:'#fff', fontSize:14, fontWeight:600, border:'none', cursor:'pointer', opacity: (!reply.trim()||gmailLoading)?0.4:1 }}>
                      {gmailLoading ? '…' : '✉ Gmail'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            !isMobile && (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:C.white }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
                  <p style={{ fontSize:14, fontWeight:500, color:C.dark }}>Selecciona un hilo</p>
                  <p style={{ fontSize:12, color:C.muted2, marginTop:4 }}>Elige una conversación de la lista</p>
                </div>
              </div>
            )
          )
        )}
      </div>
    </>
  )
}
