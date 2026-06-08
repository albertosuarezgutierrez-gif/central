"use client"
import { useState, useEffect, useRef } from "react"

type Data = {
  timestamp: string
  summary: { ytd: { total: number; reservas: number; beneficio: number; gastos: number }; ytdPrev: { total: number; reservas: number }; yoyPct: number|null; monthYoY: number|null; avgBooking: number; currentMonth: number; currentYear: number }
  byYear: { year: number; reservas: number; total: number; avg_nights: number }[]
  byPortal: { portal: string; reservas: number; total: number; avg_amount: number; avg_nights: number }[]
  byProperty: { propertyId: string; name: string; reservas: number; total: number; avg_amount: number }[]
  alerts: string[]; insights: string[]; MESES: string[]
}
type ChatMsg = { role: "user"|"assistant"; content: string }

const fmt = (n: number) => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n)
const PORTAL_COLORS: Record<string,string> = {BOOKING:"#003580",AIRBNB:"#ff5a5f",EXPEDIA:"#ffc72c",AGODA:"#e84142",DIRECTO:"var(--lime-d)",VRBO:"#1a5276",OTRO:"#71717a"}
const PROP_COLORS = ["var(--lime-d)","#f59e0b","#10b981","#ef4444"]

const QUICK = [
  "¿Cuánto hemos ingresado este año?",
  "¿Qué propiedad rentó más en 2025?",
  "¿Cuántas reservas tenemos en junio?",
  "¿Cuál es el ADR medio por propiedad?",
  "Compara ingresos 2024 vs 2025",
  "¿Qué portal genera más revenue?",
]

export default function AgentePage() {
  const [data, setData]       = useState<Data|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string|null>(null)
  const [chat, setChat]       = useState<ChatMsg[]>([])
  const [input, setInput]     = useState("")
  const [asking, setAsking]   = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/agente").then(r=>r.json())
      .then(d => { if(d.error) setError(d.error); else setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:"smooth"}) }, [chat])

  async function ask(q: string) {
    if (!q.trim() || asking) return
    const question = q.trim()
    setInput("")
    setChat(prev => [...prev, {role:"user", content: question}])
    setAsking(true)
    try {
      const res = await fetch("/api/agente/chat", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ question, history: chat.slice(-6) })
      })
      const d = await res.json()
      setChat(prev => [...prev, {role:"assistant", content: d.answer || d.error || "Sin respuesta"}])
    } catch {
      setChat(prev => [...prev, {role:"assistant", content:"Error conectando con la IA"}])
    } finally { setAsking(false) }
  }

  if (loading) return <div className="p-6 text-[#9898A8] text-sm">Analizando datos…</div>
  if (error)   return <div className="p-6 text-[#ef4444] text-sm">Error: {error}</div>
  if (!data)   return null

  const { summary: s, byYear, byPortal, byProperty, alerts, insights, MESES } = data
  const maxProp = Math.max(...byProperty.map(p=>p.total))
  const maxPortal = Math.max(...byPortal.map(p=>p.total))

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#1A2535] tracking-tight">Agente IA</h1>
        <p className="text-sm text-[#9898A8] mt-0.5">Análisis financiero + chat con datos reales de BD</p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a,i) => (
            <div key={i} className="text-xs px-4 py-2.5 rounded-[6px] border"
              style={{background: a.startsWith("✅") ? "#f0fdf4" : "#fef3c7", borderColor: a.startsWith("✅") ? "#bbf7d0" : "#fde68a", color: a.startsWith("✅") ? "#166534" : "#92400e"}}>
              {a}
            </div>
          ))}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          {label:`Ingresos ${s.currentYear} YTD`, val:fmt(s.ytd.total), delta: s.yoyPct !== null ? `${s.yoyPct > 0?"+":""}${s.yoyPct}% vs ${s.currentYear-1}` : null, color:"var(--lime-d)"},
          {label:"Reservas YTD",  val:String(s.ytd.reservas), delta: s.ytdPrev.reservas ? `${s.ytdPrev.reservas} en ${s.currentYear-1}` : null, color:"#10b981"},
          {label:"Ticket medio",  val:`${fmt(s.avgBooking)}`, delta:"por reserva", color:"#f59e0b"},
          {label:"Beneficio YTD", val:fmt(s.ytd.beneficio), delta:`Gastos: ${fmt(s.ytd.gastos)}`, color: s.ytd.beneficio >= 0 ? "#10b981" : "#ef4444"},
        ].map(k => (
          <div key={k.label} className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4">
            <div className="text-xs text-[#9898A8] mb-1">{k.label}</div>
            <div className="text-xl font-bold" style={{color:k.color}}>{k.val}</div>
            {k.delta && <div className="text-xs text-[#6B7F96] mt-0.5">{k.delta}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* By property */}
        <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4">
          <h3 className="text-sm font-semibold text-[#1A2535] mb-3">Revenue por propiedad</h3>
          <div className="space-y-3">
            {byProperty.map((p,i) => (
              <div key={p.propertyId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[#1A2535] truncate max-w-[160px]">{p.name}</span>
                  <span className="text-xs font-bold text-[#1A2535]">{fmt(p.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-[#F4F6F9] overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${Math.round((p.total/maxProp)*100)}%`, background: PROP_COLORS[i]||"#94a3b8"}}/>
                </div>
                <div className="text-[10px] text-[#6B7F96] mt-0.5">{p.reservas} res · ADR {fmt(p.avg_amount)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* By portal */}
        <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4">
          <h3 className="text-sm font-semibold text-[#1A2535] mb-3">Revenue por portal</h3>
          <div className="space-y-3">
            {byPortal.map(p => (
              <div key={p.portal}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[#1A2535]">{p.portal}</span>
                  <span className="text-xs font-bold text-[#1A2535]">{fmt(p.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-[#F4F6F9] overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${Math.round((p.total/maxPortal)*100)}%`, background: PORTAL_COLORS[p.portal]||"#94a3b8"}}/>
                </div>
                <div className="text-[10px] text-[#6B7F96] mt-0.5">{p.reservas} res · ADR {fmt(p.avg_amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Year comparison */}
      <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4 mb-5">
        <h3 className="text-sm font-semibold text-[#1A2535] mb-3">Ingresos anuales</h3>
        <div className="flex gap-3 flex-wrap">
          {byYear.map(y => {
            const max = Math.max(...byYear.map(b=>b.total))
            return (
              <div key={y.year} className="flex-1 min-w-[80px]">
                <div className="text-xs text-[#9898A8] mb-1 text-center">{y.year}</div>
                <div className="h-20 bg-[#F4F6F9] rounded-[4px] overflow-hidden flex items-end">
                  <div className="w-full rounded-[4px] transition-all bg-[#BBFF44]" style={{height:`${Math.round((y.total/max)*100)}%`}}/>
                </div>
                <div className="text-[10px] font-semibold text-center mt-1 text-[#1A2535]">{(y.total/1000).toFixed(0)}k€</div>
                <div className="text-[9px] text-[#6B7F96] text-center">{y.reservas} res</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-[#f5f3ff] border border-[#c4b5fd] rounded-[6px] p-4 mb-5">
          <div className="text-xs font-semibold text-[#5A9A12] mb-2">💡 Insights automáticos</div>
          <div className="space-y-1">
            {insights.map((ins,i) => <div key={i} className="text-xs text-[#4c1d95]">{ins}</div>)}
          </div>
        </div>
      )}

      {/* Chat IA */}
      <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E8EDF3] flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10b981]"/>
          <h3 className="text-sm font-semibold text-[#1A2535]">Chat con tus datos</h3>
          <span className="text-xs text-[#6B7F96]">Pregunta cualquier cosa sobre el portfolio</span>
        </div>

        {/* Quick questions */}
        <div className="px-4 pt-3 pb-2 flex gap-2 flex-wrap border-b border-[#f9f9f9]">
          {QUICK.map(q => (
            <button key={q} onClick={() => ask(q)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-[#E8EDF3] text-[#9898A8] hover:border-[#BBFF44] hover:text-[#BBFF44] transition-colors">
              {q}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="px-5 py-4 min-h-[120px] max-h-80 overflow-y-auto space-y-3">
          {chat.length === 0 && (
            <p className="text-sm text-[#6B7F96] text-center py-4">Haz una pregunta sobre tus reservas, ingresos o propiedades…</p>
          )}
          {chat.map((m,i) => (
            <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
              <div className={`max-w-[80%] rounded-[6px] px-4 py-2.5 text-sm leading-relaxed ${
                m.role==="user"
                  ? "bg-[#BBFF44] text-[#1A2535] rounded-br-none"
                  : "bg-[#F4F6F9] text-[#1A2535] rounded-bl-none"
              }`} style={{whiteSpace:"pre-wrap"}}>
                {m.content}
              </div>
            </div>
          ))}
          {asking && (
            <div className="flex justify-start">
              <div className="bg-[#F4F6F9] rounded-[6px] rounded-bl-none px-4 py-2.5 flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-[#BBFF44] border-t-transparent rounded-full animate-spin inline-block"/>
                <span className="text-sm text-[#9898A8]">Analizando…</span>
              </div>
            </div>
          )}
          <div ref={chatEnd}/>
        </div>

        {/* Input */}
        <div className="px-4 pb-4 flex gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&ask(input)}
            placeholder="¿Cuánto ingresamos en junio 2025?"
            className="flex-1 text-sm border border-[#E8EDF3] rounded-[6px] px-4 py-2.5 outline-none focus:border-[#BBFF44] transition-colors text-[#1A2535] placeholder:text-[#6B7F96] bg-[#fafafa]"
          />
          <button onClick={()=>ask(input)} disabled={!input.trim()||asking}
            className="px-4 py-2 bg-[#BBFF44] text-sm font-semibold rounded-[6px] hover:bg-[#BBFF44] transition-colors disabled:opacity-40">
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
