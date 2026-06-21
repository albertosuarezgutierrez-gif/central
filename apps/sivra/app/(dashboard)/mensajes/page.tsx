"use client"
import { useState, useRef, useEffect, useCallback } from "react"

type Msg    = { id: string; from: "guest"|"host"; text: string; ts: string }
type Thread = {
  id: string; guestName: string; property: string; propertyId?: string
  checkIn: string; checkOut: string; portal: string
  status: "pendiente"|"respondido"|"urgente"; lastMsg: string; lastTs: string
  messages: Msg[]
  lang?: string; smoobuReservationId?: string
  classification?: "trivial"|"info"|"importante"
}

const STATUS_CONFIG = {
  pendiente:  { label:"Pendiente",  bg:"#fef3c7", text:"#92400e", dot:"#f59e0b" },
  urgente:    { label:"Urgente",    bg:"#fee2e2", text:"#991b1b", dot:"#ef4444" },
  respondido: { label:"Respondido", bg:"#dcfce7", text:"#166534", dot:"#22c55e" },
}
const PORTAL_COLOR: Record<string,string> = {
  BOOKING:"#003580", AIRBNB:"#FF5A5F", VRBO:"#3B5998",
  DIRECTO:"#10B981", EXPEDIA:"#FFC72C", AGODA:"#E84142", OTRO:"var(--lime-d)"
}
const CLASS_CONFIG = {
  trivial:    { icon:"✅", label:"Trivial",    color:"#22c55e", bg:"#dcfce7" },
  info:       { icon:"💬", label:"Info",       color:"#3b82f6", bg:"#dbeafe" },
  importante: { icon:"🔴", label:"Importante", color:"#ef4444", bg:"#fee2e2" },
}

function fmtTime(ts: string) {
  const d = new Date(ts); const now = new Date()
  const diffH = Math.floor((now.getTime()-d.getTime())/3600000)
  if(diffH<1) return "Ahora"
  if(diffH<24) return `${diffH}h`
  return `${Math.floor(diffH/24)}d`
}
function fmtFull(ts: string) {
  return new Date(ts).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})
}

// ── Resizable panel hooks ──
function useResizable(defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(defaultWidth)
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(defaultWidth)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [width])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      setWidth(Math.max(min, Math.min(max, startW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
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
    document.body.style.cursor = "row-resize"
    document.body.style.userSelect = "none"
  }, [height])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      // dragging up = bigger bottom panel
      const delta = startY.current - e.clientY
      setHeight(Math.max(min, Math.min(max, startH.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [min, max])

  return { height, onMouseDown }
}

export default function MensajesPage() {
  const [threads, setThreads]     = useState<Thread[]>([])
  const [active, setActive]       = useState<string>("")
  const [filter, setFilter]       = useState<"activos"|"respondido"|"todos"|"trivial">("activos")
  const [reply, setReply]         = useState("")
  const [loading, setLoading]     = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDraft, setAiDraft]     = useState("")
  const [aiSource, setAiSource]   = useState<"knowledge_base"|"claude"|"business_rule">("claude")
  const [aiAlert, setAiAlert]     = useState<string|null>(null)
  const [aiCategory, setAiCategory] = useState<string|null>(null)
  const [aiLang, setAiLang]       = useState<string>("es")
  const [guestUrl, setGuestUrl]   = useState<string|null>(null)
  const [mobileView, setMobileView] = useState<"list"|"chat">("list")

  const [hint, setHint]           = useState("")
  const [kbSaved, setKbSaved]     = useState(false)

  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMsgs, setLoadingMsgs]       = useState(false)
  const [copied, setCopied]                  = useState(false)
  const [gmailLoading, setGmailLoading]      = useState(false)

  const [translatedThreads, setTranslatedThreads] = useState<Set<string>>(new Set())
  const [translating, setTranslating]             = useState(false)
  const [translations, setTranslations]           = useState<Record<string, Record<string,string>>>({})

  const msgEnd = useRef<HTMLDivElement>(null)

  // ── Resize paneles ──
  const listPanel   = useResizable(300, 200, 520)
  const bottomPanel = useResizableV(200, 120, 500)

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setLoadingThreads(true)
    try {
      const res = await fetch("/api/mensajes", { cache: "no-store" })
      const d = await res.json()
      if (d.threads) {
        setThreads(prev => {
          const cache = new Map(prev.map(t => [t.id, t.messages]))
          return d.threads.map((t: Thread) => ({ ...t, messages: cache.get(t.id) || [] }))
        })
        setActive(prev => prev || (d.threads.find((t:Thread) => t.status==="urgente")?.id || (d.threads[0]?.id ?? "")))
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
      fetch(`/api/mensajes/${active}`)
        .then(r => r.json())
        .then(d => {
          if (d.messages) {
            setThreads(cur => cur.map(x => x.id === active ? { ...x, messages: d.messages } : x))
          }
        })
        .finally(() => setLoadingMsgs(false))
      return prev
    })
  // eslint-disable-next-line
  }, [active])

  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: "smooth" }) }, [active, threads])
  useEffect(() => { setHint(""); setKbSaved(false); setAiDraft(""); setAiAlert(null) }, [active])

  const thread = threads.find(t => t.id === active)
  const ORDER = { urgente:0, pendiente:1, respondido:2 }
  const filtered = threads
    .filter(t =>
      filter === "todos" ? true :
      filter === "trivial" ? t.classification === "trivial" :
      filter === "activos" ? (t.status === "pendiente" || t.status === "urgente") :
      t.status === filter
    )
    .sort((a,b) => ORDER[a.status] - ORDER[b.status])

  const urgentCount  = threads.filter(t => t.status === "urgente").length
  const pendCount    = threads.filter(t => t.status === "pendiente" || t.status === "urgente").length
  const trivialCount = threads.filter(t => t.classification === "trivial").length

  async function translateThread() {
    if(!thread) return
    const isShowing = translatedThreads.has(thread.id)
    if(isShowing) { setTranslatedThreads(prev=>{const s=new Set(prev);s.delete(thread.id);return s}); return }
    if(translations[thread.id]) { setTranslatedThreads(prev=>new Set(prev).add(thread.id)); return }
    setTranslating(true)
    const lang = (thread.lang || "EN").toLowerCase()
    const guestMsgs = thread.messages.filter(m=>m.from==="guest")
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
    const isShowing = translatedThreads.has(thread?.id ?? "")
    if(isShowing && msg.from==="guest" && translations[thread?.id ?? ""]?.[msg.id]) {
      return { text: translations[thread!.id][msg.id], isTranslated: true }
    }
    return { text: msg.text, isTranslated: false }
  }

  async function persistStatus(bookingId: string, status: string) {
    try {
      await fetch(`/api/mensajes/${bookingId}`, {
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
    const msg: Msg = { id:`m${Date.now()}`, from:"host", text:text.trim(), ts:new Date().toISOString() }
    setThreads(prev=>{
      const updated = prev.map(t=>t.id===active
        ? {...t, status:"respondido" as const, messages:[...t.messages,msg], lastMsg:text.trim(), lastTs:msg.ts}
        : t
      )
      const nextActive = updated.find(t=>t.id!==active&&(t.status==="pendiente"||t.status==="urgente"))
      if(nextActive) setTimeout(()=>setActive(nextActive.id),150)
      return updated
    })
    setReply("")
    setAiDraft("")
    setAiAlert(null)
    setHint("")
  }

  async function saveToKB(text: string, lang: string, category: string | null) {
    if (!thread || !text.trim()) return
    try {
      const field = lang === "en" ? "answer_en" : lang === "fr" ? "answer_fr" : lang === "de" ? "answer_de" : lang === "it" ? "answer_it" : "answer_es"
      const kws = [thread.guestName.split(" ")[0].toLowerCase(), category || "faq", thread.property.split(" ")[0].toLowerCase()]
      await fetch("/api/mensajes/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category || "faq",
          keywords: kws,
          property_id: thread.propertyId || "all",
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
      const res = await fetch(`/api/mensajes/${thread.smoobuReservationId}/email`)
      const data = await res.json()
      const email     = data.email || ""
      const guestName = data.guestName || thread.guestName
      const reference = data.reference || thread.smoobuReservationId || thread.id
      const subject   = `Re: Reserva ${reference} - ${guestName}`
      const gmailUrl  = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
      window.open(gmailUrl, "_blank")
      if (text === aiDraft && aiSource === "claude" && hint.trim()) {
        saveToKB(text, aiLang, aiCategory)
      }
    } catch {
      alert("Error obteniendo email del huésped")
    }
    setGmailLoading(false)
  }

  async function generateAI() {
    if(!thread) return
    setAiLoading(true)
    setAiDraft("")
    setAiAlert(null)
    setKbSaved(false)
    try {
      const res = await fetch("/api/mensajes/reply", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          guestName:           thread.guestName,
          property:            thread.property,
          propertyId:          thread.propertyId || "all",
          checkIn:             thread.checkIn,
          checkOut:            thread.checkOut,
          portal:              thread.portal,
          messages:            thread.messages,
          smoobuReservationId: thread.smoobuReservationId || null,
          hint:                hint.trim() || undefined,
        })
      })
      const data = await res.json()

      if (data.action === "needs_decision") {
        setAiAlert(data.alert || "⚠️ Este mensaje requiere tu atención personal.")
        setAiSource("business_rule")
      } else if(data.reply) {
        setAiDraft(data.reply)
        setReply(data.reply)
        setAiSource(data.source === "knowledge_base" ? "knowledge_base" : data.source === "business_rule" ? "business_rule" : "claude")
        setAiCategory(data.category || null)
        setAiLang(data.lang || "es")
        setGuestUrl(data.guestAppUrl || null)
      } else {
        setAiDraft("⚠️ " + (data.error || "Error generando respuesta"))
      }
    } catch {
      setAiDraft("⚠️ Error de conexión con la API")
    } finally { setAiLoading(false) }
  }

  const hasNonSpanish = thread && thread.lang && thread.lang !== "ES"

  if (loadingThreads) return (
    <div className="flex h-[calc(100vh-56px)] md:h-screen items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-[#BBFF44] border-t-transparent rounded-full animate-spin mb-3"/>
        <p className="text-sm text-[#9898A8]">Cargando mensajes…</p>
      </div>
              {/* Chekin link */}
              {thread?.smoobuReservationId && (
                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
                  <a
                    href={`https://login.smoobu.com/reservation/${thread?.smoobuReservationId}`}
                    target="_blank" rel="noreferrer"
                    style={{fontSize:11,color:"var(--brand)",background:"var(--lime-l)",padding:"3px 10px",borderRadius:20,textDecoration:"none",fontWeight:600}}
                  >
                    🔗 Smoobu
                  </a>
                  <button
                    onClick={() => {
                      const url = `https://guest.chekin.com/booking/${thread?.smoobuReservationId}`
                      navigator.clipboard?.writeText(url).catch(()=>{})
                      alert("Link Chekin copiado")
                    }}
                    style={{fontSize:11,color:"#7c3aed",background:"#faf5ff",padding:"3px 10px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:600}}
                  >
                    📋 Chekin
                  </button>
                </div>
              )}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-56px)] md:h-screen overflow-hidden">
      {/* ── Thread list ── */}
      <div
        className={(mobileView==="chat"?"hidden md:flex ":"flex ")+"flex-col border-r border-[#E8EDF3] bg-[#FFFFFF] shrink-0"}
        style={{ width: mobileView==="chat" ? listPanel.width : "100%", minWidth: 200, maxWidth: 520 }}
      >
        <div className="px-4 py-4 border-b border-[#E8EDF3]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-[#1A2535]">Mensajes</h1>
            <div className="flex items-center gap-2">
              {urgentCount>0&&(
                <span className="px-2 py-0.5 rounded-full bg-[#ef4444] text-xs font-bold animate-pulse">{urgentCount} 🔴</span>
              )}
              {pendCount>0&&urgentCount===0&&(
                <span className="px-2 py-0.5 rounded-full bg-[#f59e0b] text-xs font-bold">{pendCount}</span>
              )}
              <button onClick={()=>loadThreads()} title="Actualizar"
                className="w-7 h-7 flex items-center justify-center rounded-full border border-[#E8EDF3] text-[#9898A8] hover:border-[#BBFF44] hover:text-[#BBFF44] transition-colors text-base">
                ↻
              </button>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {([
              {id:"activos",    label:"Activos",     color:"var(--lime-d)",  count: pendCount},
              {id:"respondido", label:"Respondidos",  color:"#22c55e",  count: 0},
              {id:"trivial",    label:`Trivial${trivialCount>0?` (${trivialCount})`:""}`, color:"#9898A8", count: 0},
              {id:"todos",      label:"Todos",        color:"#9898A8",  count: 0},
            ] as const).map(f=>(
              <button key={f.id} onClick={()=>setFilter(f.id)}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all"
                style={{
                  background: filter===f.id ? f.color : "transparent",
                  color: filter===f.id ? ((f.color as string)==="#BBFF44"?"#060609":"#1A2535") : "#71717a",
                  borderColor: filter===f.id ? "transparent" : "var(--border)"
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length===0&&(
            <div className="p-8 text-center">
              <div className="text-2xl mb-2">✅</div>
              <p className="text-sm font-medium text-[#1A2535]">Todo al día</p>
              <p className="text-xs text-[#6B7F96] mt-1">No hay mensajes pendientes</p>
            </div>
          )}
          {filtered.map(t=>{
            const s = STATUS_CONFIG[t.status]
            const cls = t.classification ? CLASS_CONFIG[t.classification] : null
            const isUrgent = t.status === "urgente"
            return (
              <button key={t.id} onClick={()=>{setActive(t.id);setMobileView("chat")}}
                className="w-full text-left px-4 py-3.5 border-b border-[#E8EDF3] hover:bg-[#1F1F28] transition-colors"
                style={{
                  background: active===t.id ? "#1F1F28" : isUrgent ? "rgba(239,68,68,0.04)" : "transparent",
                  borderLeft: isUrgent ? "3px solid #ef4444" : "3px solid transparent",
                }}>
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-semibold text-[#1A2535] truncate">{t.guestName}</span>
                  <span className="text-[10px] text-[#6B7F96] shrink-0 ml-2">{fmtTime(t.lastTs)}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{background:PORTAL_COLOR[t.portal]||"var(--lime-d)"}}>{t.portal}</span>
                  <span className="text-[10px] text-[#9898A8] truncate">{t.property}</span>
                  {cls && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{background:cls.bg, color:cls.color}}>
                      {cls.icon}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9898A8] truncate flex-1">{t.lastMsg}</span>
                  <span className="ml-2 w-2 h-2 rounded-full shrink-0" style={{background:s.dot}}/>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Drag handle (solo desktop) ── */}
      <div
        onMouseDown={listPanel.onMouseDown}
        className="hidden md:flex w-1.5 shrink-0 items-center justify-center cursor-col-resize group relative"
        style={{ background: "transparent" }}
        title="Arrastra para redimensionar"
      >
        <div className="w-0.5 h-full bg-[#E8EDF3] group-hover:bg-[#BBFF44] transition-colors"/>
        {/* grip dots */}
        <div className="absolute flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {[0,1,2,3].map(i=>(
            <div key={i} className="w-1 h-1 rounded-full bg-[#BBFF44]"/>
          ))}
        </div>
      </div>

      {/* ── Chat panel ── */}
      {thread ? (
        <div className={(mobileView==="list"?"hidden md:flex ":"flex ")+"flex-1 flex-col bg-[#FFFFFF] min-w-0"}>
          {/* Chat header */}
          <div className="bg-[#FFFFFF] border-b border-[#E8EDF3] px-5 py-3.5 flex items-center gap-3">
            <button onClick={()=>setMobileView("list")} className="md:hidden w-7 h-7 flex items-center justify-center rounded-[4px] hover:bg-[#F4F6F9] text-[#9898A8] text-lg shrink-0">←</button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#1A2535]">{thread.guestName}</span>
                <span className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{background:PORTAL_COLOR[thread.portal]||"var(--lime-d)"}}>{thread.portal}</span>
                {thread.lang&&<span className="text-xs text-[#9898A8] border border-[#E8EDF3] px-1.5 py-0.5 rounded">{thread.lang}</span>}
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{background:STATUS_CONFIG[thread.status].bg, color:STATUS_CONFIG[thread.status].text}}>
                  {STATUS_CONFIG[thread.status].label}
                </span>
                {thread.classification && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{background:CLASS_CONFIG[thread.classification].bg, color:CLASS_CONFIG[thread.classification].color}}>
                    {CLASS_CONFIG[thread.classification].icon} {CLASS_CONFIG[thread.classification].label}
                  </span>
                )}
              </div>
              <div className="text-xs text-[#9898A8] mt-0.5">
                {thread.property}
                {thread.checkIn ? ` · Entrada ${thread.checkIn}` : ""}
                {thread.checkOut ? ` · Salida ${thread.checkOut}` : ""}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              {hasNonSpanish&&(
                <button
                  onClick={translateThread}
                  disabled={translating}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: translatedThreads.has(thread.id)?"var(--lime-d)":"var(--border)",
                    color: translatedThreads.has(thread.id)?"var(--lime-d)":"#71717a",
                    background: "transparent",
                  }}>
                  {translating
                    ? <><span className="inline-block w-2.5 h-2.5 border border-[#BBFF44] border-t-transparent rounded-full animate-spin"/>Traduciendo…</>
                    : <>{translatedThreads.has(thread.id)?"🌐 Ver original":"🌐 Traducir ES"}</>
                  }
                </button>
              )}
              {(["pendiente","respondido","urgente"] as const).map(s=>s!==thread.status&&(
                <button key={s} onClick={()=>{ setThreads(prev=>prev.map(t=>t.id===active?{...t,status:s}:t)); persistStatus(active, s) }}
                  className="text-[10px] px-2 py-1 rounded border border-[#E8EDF3] text-[#9898A8] hover:border-[#BBFF44] hover:text-[#BBFF44] transition-colors">
                  → {s}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loadingMsgs&&(
              <div className="flex justify-center py-8">
                <span className="inline-block w-5 h-5 border-2 border-[#BBFF44] border-t-transparent rounded-full animate-spin"/>
              </div>
            )}
            {!loadingMsgs && thread.messages.length === 0 && (
              <div className="text-center text-xs text-[#6B7F96] py-8">No hay mensajes en este hilo</div>
            )}
            {thread.messages.map(msg=>{
              const { text: displayText, isTranslated } = getDisplayText(msg)
              return (
                <div key={msg.id} className={`flex ${msg.from==="host"?"justify-end":"justify-start"}`}>
                  <div className="max-w-[75%]">
                    <div className={`rounded-[6px] px-4 py-2.5 text-sm leading-relaxed ${
                      msg.from==="host"
                        ? "bg-[#BBFF44] text-[#1A2535] rounded-br-none"
                        : "bg-[#FFFFFF] text-[#1A2535] rounded-bl-none border border-[#E8EDF3]"
                    }`}>
                      <span style={{whiteSpace:"pre-wrap"}}>{displayText}</span>
                    </div>
                    <div className={`text-[10px] text-[#6B7F96] mt-1 ${msg.from==="host"?"text-right":"text-left"} flex items-center gap-1 ${msg.from==="host"?"justify-end":""}`}>
                      {msg.from==="host"?"Tú":"Huésped"} · {fmtFull(msg.ts)}
                      {isTranslated&&<span className="text-[9px] bg-[#ede9fe] text-[#7c3aed] px-1 py-0.5 rounded">🌐 ES</span>}
                    </div>
                  </div>
                </div>
              )
            })}
            {aiLoading&&(
              <div className="flex justify-start">
                <div className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] px-4 py-2.5 text-sm text-[#9898A8] flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-[#BBFF44] border-t-transparent rounded-full animate-spin"/>
                  {hint.trim() ? "Redactando con tu idea…" : "Analizando con reglas + IA…"}
                </div>
              </div>
            )}
            <div ref={msgEnd}/>
          </div>

          {/* Alert banner */}
          {aiAlert&&!aiLoading&&(
            <div className="mx-5 mb-2 p-3 bg-[#7f1d1d] border border-[#ef4444] rounded-[6px]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-[#fecaca] leading-relaxed">{aiAlert}</span>
                <button onClick={()=>setAiAlert(null)} className="text-[10px] text-[#fca5a5] hover:shrink-0">✕</button>
              </div>
              <p className="text-xs text-[#f87171] mt-1.5">Decide y responde manualmente.</p>
            </div>
          )}

          {/* AI draft banner */}
          {aiDraft&&!aiLoading&&(
            <div className="mx-5 mb-2 p-3 bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px]">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-[#5A9A12]">
                    {aiSource==="knowledge_base" ? "🧠 Base de conocimiento propia" :
                     aiSource==="business_rule"  ? "📋 Regla de negocio" :
                     hint.trim() ? "✏️ Borrador IA (con tu idea)" : "✨ Borrador IA (Claude)"}
                  </span>
                  {hint.trim() && aiSource === "claude" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]">
                      💡 {hint.length > 30 ? hint.slice(0,30)+"…" : hint}
                    </span>
                  )}
                </div>
                <button onClick={()=>{setAiDraft("");setReply("");setHint("")}}
                  className="text-[10px] text-[#6B7F96] hover:text-[#9898A8] shrink-0">descartar</button>
              </div>
              <p className="text-xs text-[#9898A8] leading-relaxed">{aiDraft}</p>
              {guestUrl&&(
                <a href={guestUrl} target="_blank" rel="noreferrer"
                  className="block mt-1.5 text-[10px] text-[#5A9A12] underline truncate">
                  🔗 Guía personalizada huésped
                </a>
              )}
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                <button onClick={()=>sendReply(aiDraft)}
                  className="px-3 py-1 bg-[#BBFF44] text-[#1A2535] text-xs font-semibold rounded-[4px] hover:opacity-85 transition-opacity">
                  Copiar
                </button>
                <button onClick={()=>openGmailDraft(aiDraft)} disabled={gmailLoading}
                  className="flex items-center gap-1 px-3 py-1 bg-[#1a73e8] text-xs font-semibold rounded-[4px] hover:opacity-85 transition-opacity disabled:opacity-40">
                  {gmailLoading ? "…" : "✉ Gmail"}
                </button>
                {hint.trim() && aiSource === "claude" && !kbSaved && (
                  <button onClick={()=>saveToKB(aiDraft, aiLang, aiCategory)}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-[4px] border border-[#E8EDF3] text-[#5A9A12] hover:border-[#BBFF44] transition-colors">
                    💾 Guardar en KB
                  </button>
                )}
                {kbSaved && (
                  <span className="text-[10px] text-[#5A9A12] font-medium">✅ Guardado en Knowledge Base</span>
                )}
              </div>
            </div>
          )}

          {/* Copy toast */}
          {copied&&(
            <div className="mx-5 mb-1 px-3 py-1.5 bg-[#14532d] border border-[#166534] rounded-[4px] text-xs text-[#86efac] font-medium">
              ✅ Mensaje copiado — pégalo en el portal de reserva
            </div>
          )}

          {/* ── Vertical drag handle ── */}
          <div
            onMouseDown={bottomPanel.onMouseDown}
            className="h-1.5 shrink-0 flex items-center justify-center cursor-row-resize group relative border-t border-[#E8EDF3]"
            style={{ background: "transparent" }}
            title="Arrastra para redimensionar"
          >
            <div className="h-0.5 w-full bg-transparent group-hover:bg-[#BBFF44] transition-colors"/>
            <div className="absolute flex flex-row gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {[0,1,2,3].map(i=>(
                <div key={i} className="w-1 h-1 rounded-full bg-[#BBFF44]"/>
              ))}
            </div>
          </div>

          {/* Reply input */}
          <div className="bg-[#FFFFFF] px-5 py-4 overflow-y-auto" style={{height: bottomPanel.height}}>
            <div className="flex gap-2 mb-2 items-center">
              <button onClick={generateAI} disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-semibold border border-[#E8EDF3] text-[#5A9A12] bg-transparent hover:border-[#BBFF44] transition-colors disabled:opacity-50 shrink-0">
                <span>✨</span>
                {aiLoading ? (hint.trim() ? "Redactando…" : "Analizando…") : "Sugerir IA"}
              </button>
              <input
                value={hint}
                onChange={e=>setHint(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); generateAI() } }}
                placeholder="💡 Tu idea (Enter para redactar)…"
                className="flex-1 text-xs border border-[#E8EDF3] rounded-[4px] px-3 py-1.5 outline-none focus:border-[#BBFF44] transition-colors text-[#1A2535] placeholder:text-[#6B7F96] bg-[#FFFFFF] min-w-0"
              />
              <span className="text-[10px] text-[#6B7F96] shrink-0 hidden sm:block">
                {thread.classification === "trivial" ? "💤 Trivial" :
                 thread.classification === "importante" ? "🔴 Importante" :
                 thread.lang && thread.lang !== "ES" ? `🌐 ${thread.lang}` : ""}
              </span>
            </div>
            <div className="flex gap-2">
              <textarea
                value={reply}
                onChange={e=>setReply(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendReply(reply)}}}
                placeholder="Escribe un mensaje… (Enter para copiar, Shift+Enter nueva línea)"
                rows={3}
                className="flex-1 text-sm border border-[#E8EDF3] rounded-[6px] px-4 py-2.5 outline-none resize-none focus:border-[#BBFF44] transition-colors text-[#1A2535] placeholder:text-[#6B7F96] bg-[#FFFFFF]"
              />
              <div className="flex gap-2 self-end">
                <button onClick={()=>sendReply(reply)} disabled={!reply.trim()||loading}
                  className="px-4 py-2 rounded-[6px] bg-[#BBFF44] text-[#1A2535] text-sm font-semibold hover:opacity-85 transition-opacity disabled:opacity-40">
                  Copiar
                </button>
                <button onClick={()=>openGmailDraft(reply)} disabled={!reply.trim()||gmailLoading}
                  className="px-4 py-2 rounded-[6px] bg-[#1a73e8] text-sm font-semibold hover:opacity-85 transition-opacity disabled:opacity-40">
                  {gmailLoading ? "…" : "✉ Gmail"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#FFFFFF]">
          <div className="text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm font-medium text-[#1A2535]">Selecciona un hilo</p>
            <p className="text-xs text-[#6B7F96] mt-1">Elige una conversación de la lista</p>
          </div>
        </div>
      )}
    </div>
  )
}

