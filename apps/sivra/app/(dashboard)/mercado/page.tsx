"use client"
import { useState, useEffect, useCallback } from "react"

type Apartment = {
  name: string; price_night: number; price_total: number
  score: number | null; review_count: number; location: string
}
type ScenarioStats = {
  min: number; p25: number; p50: number; p75: number; max: number; avg: number; count: number
}
type ScenarioData = {
  scenario: string; portal: string
  checkin: string; checkout: string; search_date: string
  apartments: Apartment[]; stats?: ScenarioStats
}

const OUR_PRICES = [
  { id: "prop_house_sevillana",  label: "House Sevillana", emoji: "🏛️", color: "#6366f1", normal: 314, corpus: 570 },
  { id: "prop_duplex_center",    label: "Duplex Center",   emoji: "🏢", color: "#10b981", normal: 121, corpus: 200 },
  { id: "prop_luxury_busto",     label: "Luxury Busto",    emoji: "✨", color: "#ef4444", normal: 150, corpus: 235 },
  { id: "prop_busto_reform",     label: "Busto Reform",    emoji: "🏠", color: "#f59e0b", normal: 80,  corpus: 132 },
]

const PORTALS = [
  { id: "all",         label: "Todos",        color: "#6B7F96", icon: "🌐" },
  { id: "booking",     label: "Booking",      color: "#003580", icon: "🔵" },
  { id: "tripadvisor", label: "Tripadvisor",  color: "#00aa6c", icon: "🦉" },
  { id: "expedia",     label: "Expedia",      color: "#ffc72c", icon: "✈️" },
]

const FALLBACK_PROPS = [
  {
    id: "prop_house_sevillana", label: "House Sevillana", color: "#6366f1", emoji: "🏛️",
    beds: 6, baths: 4, maxGuests: 12, m2: 290,
    zona: "Casco Antiguo · C/ Bustos Tavera 22",
    tags: ["Parking privado","6 hab","290m²","Patio","12 pax"],
    ourPrice: 314,
    comp: [
      { name:"Apartamentos Setas Center",    price:183, score:8.8 },
      { name:"Singular Metropol",             price:144, score:8.7 },
      { name:"Panther Home Galera",           price:176, score:8.9 },
      { name:"Apartamentos Doña Elvira 7",    price:208, score:9.7 },
      { name:"Genteel Home San Pablo",        price:244, score:9.2 },
    ],
    insight: "House Sevillana es el único de 6 hab + parking + 290m² en casco antiguo. Nuestro precio (314€) ya supera el p75 del mercado 4 pax (217€). Producto diferencial sin competencia directa real.",
  },
  {
    id: "prop_duplex_center", label: "Duplex Center", color: "#10b981", emoji: "🏢",
    beds: 1, baths: 1, maxGuests: 4, m2: 95,
    zona: "Centro histórico · Sevilla",
    tags: ["1 hab + sofá","4 pax","95m²","Dúplex"],
    ourPrice: 121,
    comp: [
      { name:"Singular Metropol",            price:144, score:8.7 },
      { name:"Panther Home Luxury Dreams",   price:146, score:8.3 },
      { name:"Stay Unique Apts Eslava",      price:170, score:9.0 },
      { name:"Bright and new Conde Torrejón",price:176, score:8.2 },
      { name:"Panther Home Galera",          price:176, score:8.9 },
    ],
    insight: "Duplex Center en semana normal: precio (121€) está por debajo del p50 mercado (170€). Margen real de subida del 20-30%.",
  },
  {
    id: "prop_luxury_busto", label: "Luxury Busto", color: "#ef4444", emoji: "✨",
    beds: 2, baths: 1, maxGuests: 5, m2: 110,
    zona: "Zona Bustos Tavera · Sevilla",
    tags: ["2 hab","5 camas","110m²","Premium"],
    ourPrice: 150,
    comp: [
      { name:"Singular Metropol",            price:144, score:8.7 },
      { name:"Panther Home Luxury Dreams",   price:146, score:8.3 },
      { name:"Stay Unique Apts Eslava",      price:170, score:9.0 },
      { name:"Raíces Alameda Casa Palacio",  price:228, score:9.1 },
      { name:"Genteel Home San Pablo",       price:244, score:9.2 },
    ],
    insight: "Luxury Busto (2 hab, 5 camas): precio (150€) en el p25-p50 del mercado. Potencial de subida a 180-200€ sin perder competitividad.",
  },
  {
    id: "prop_busto_reform", label: "Busto Reform", color: "#f59e0b", emoji: "🏠",
    beds: 1, baths: 1, maxGuests: 2, m2: 60,
    zona: "Zona Bustos Tavera · Sevilla",
    tags: ["1 hab","2 pax","Reformado"],
    ourPrice: 80,
    comp: [
      { name:"Singular Metropol",            price:144, score:8.7 },
      { name:"Panther Home Luxury Dreams",   price:146, score:8.3 },
      { name:"Stay Unique Apts Eslava",      price:170, score:9.0 },
    ],
    insight: "🔴 Busto Reform significativamente por debajo del mercado: 80€ vs 144-170€/noche. Acción prioritaria: subir base a 95-100€.",
  },
]

const fmtEUR = (n: number) => `${Math.round(n).toLocaleString("es-ES")}€`
const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })

function getPosition(price: number, stats: ScenarioStats) {
  if (price < stats.p25)  return { label: "Bajo mercado ⬇", color: "#ef4444" }
  if (price < stats.p50)  return { label: "Mercado medio",  color: "#f59e0b" }
  if (price <= stats.p75) return { label: "Mercado alto",   color: "#10b981" }
  return { label: "Premium ⬆", color: "#6366f1" }
}

const PORTAL_COLORS: Record<string,string> = {
  booking: "#003580", tripadvisor: "#00aa6c", expedia: "#f59e0b", all: "#6B7F96"
}

export default function MercadoPage() {
  const [scenario,    setScenario]    = useState<"normal"|"corpus">("normal")
  const [portal,      setPortal]      = useState<string>("all")
  const [propIdx,     setPropIdx]     = useState(0)
  const [liveData,    setLiveData]    = useState<Record<string, ScenarioData>>({})
  const [livePortals, setLivePortals] = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [refreshMsg,  setRefreshMsg]  = useState<string|null>(null)

  useEffect(() => {
    fetch("/api/mercado/stats")
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setLiveData(d.data || {}); setLivePortals(d.portals || []) }
      })
      .finally(() => setLoading(false))
  }, [])

  const runRefresh = useCallback(async (p: string) => {
    setRefreshing(true); setRefreshMsg(null)
    try {
      const r = await fetch(`/api/mercado/search?scenario=${scenario}&portal=${p}`)
      const d = await r.json()
      if (d.ok) {
        const portalesBuscados = d.portals?.join(", ") || p
        const totalInserted = d.totalInserted ?? 0
        setRefreshMsg(`✅ ${totalInserted} registros · portales: ${portalesBuscados} · ${d.checkin}`)
        const stats = await fetch("/api/mercado/stats").then(r => r.json())
        if (stats.ok) { setLiveData(stats.data || {}); setLivePortals(stats.portals || []) }
      } else {
        setRefreshMsg(`⚠️ ${d.error || "Error al actualizar"}`)
      }
    } catch { setRefreshMsg("❌ Error de red") }
    setRefreshing(false)
  }, [scenario])

  const activeKey  = `${scenario}_${portal}`
  const live       = liveData[activeKey]
  const stats      = live?.stats

  const prop     = FALLBACK_PROPS[propIdx]
  const ourPrice = scenario === "normal" ? prop.ourPrice : (OUR_PRICES[propIdx] as any)[scenario]
  const comp     = prop.comp
  const prices   = comp.map(c => c.price)
  const allP     = [...prices, ourPrice].sort((a,b) => a-b)
  const gMin = allP[0]; const gMax = allP[allP.length-1]
  const sorted = [...prices].sort((a,b) => a-b)
  const p50 = sorted[Math.floor(sorted.length/2)]
  const p75 = sorted[Math.floor(sorted.length*0.75)]
  const ourPos = ourPrice < p50 ? "bajo" : ourPrice <= p75 ? "medio" : "alto"
  const ourPosColor = ourPos === "bajo" ? "#ef4444" : ourPos === "medio" ? "#f59e0b" : "#10b981"

  // Comparativa multi-portal (avg por portal para el escenario activo)
  const portalStats = PORTALS.filter(p => p.id !== "all").map(pt => {
    const key = `${scenario}_${pt.id}`
    const s = liveData[key]?.stats
    return { ...pt, avg: s?.avg ?? null, p50: s?.p50 ?? null, count: s?.count ?? 0, hasData: !!s }
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A2535] tracking-tight">Mercado · Comp-set</h1>
          <p className="text-xs text-[#9898A8] mt-0.5">
            Benchmarking multi-portal en Sevilla centro · {livePortals.length > 0 ? livePortals.join(" + ") : "Booking · Tripadvisor · Expedia"}
          </p>
        </div>
        <div className="flex gap-1 bg-[#F4F6F9] rounded-[4px] p-1">
          {([ ["normal","📅 Fin de semana"], ["corpus","✝️ Corpus Christi"] ] as const).map(([v,lbl]) => (
            <button key={v} onClick={() => setScenario(v)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{ background: scenario===v?"white":"transparent", color: scenario===v?"#09090b":"#71717a",
                boxShadow: scenario===v?"0 1px 3px rgba(0,0,0,0.1)":"none" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ── Comparativa multi-portal ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {portalStats.map(pt => (
          <div key={pt.id}
            className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4 cursor-pointer transition-all hover:border-[#CBD5E1]"
            style={{ borderLeftWidth: 3, borderLeftColor: pt.color }}
            onClick={() => setPortal(pt.hasData ? pt.id : "all")}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span>{pt.icon}</span>
                <span className="text-xs font-bold text-[#1A2535]">{pt.label}</span>
              </div>
              {pt.hasData
                ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#dcfce7] text-[#16a34a] font-semibold">LIVE</span>
                : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#F4F6F9] text-[#9898A8]">sin datos</span>
              }
            </div>
            {pt.hasData ? (
              <div>
                <div className="text-lg font-bold" style={{color: pt.color}}>{fmtEUR(pt.avg!)}</div>
                <div className="text-[10px] text-[#9898A8]">media · p50: {fmtEUR(pt.p50!)} · {pt.count} aptos</div>
              </div>
            ) : (
              <div className="text-xs text-[#9898A8]">Sin datos todavía</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Panel benchmarking ─────────────────────────────────── */}
      <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8EDF3] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#1A2535]">📊 Benchmarking en vivo</h2>
            {/* Selector portal */}
            <div className="flex gap-1">
              {PORTALS.map(pt => (
                <button key={pt.id} onClick={() => setPortal(pt.id)}
                  className="px-2 py-1 rounded text-[10px] font-semibold transition-all border"
                  style={{
                    background: portal===pt.id ? pt.color : "transparent",
                    color:      portal===pt.id ? "white" : "#6B7F96",
                    borderColor: portal===pt.id ? pt.color : "#E8EDF3",
                  }}>
                  {pt.icon} {pt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {refreshMsg && <span className="text-[11px] text-[#9898A8]">{refreshMsg}</span>}
            <button onClick={() => runRefresh("all")} disabled={refreshing}
              className="px-3 py-1.5 text-xs font-semibold rounded-[4px] border transition-all disabled:opacity-40"
              style={{ background:"#1A2535", borderColor:"#2d3d52", color:"#9898A8" }}>
              {refreshing ? "Actualizando…" : "🔄 Actualizar todos"}
            </button>
            {["booking","tripadvisor","expedia"].map(pt => (
              <button key={pt} onClick={() => runRefresh(pt)} disabled={refreshing}
                className="px-2 py-1 text-[10px] font-medium rounded border transition-all disabled:opacity-40"
                style={{ background:"white", borderColor:PORTAL_COLORS[pt], color:PORTAL_COLORS[pt] }}>
                {pt}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#9898A8]">Cargando…</div>
        ) : !stats ? (
          <div className="p-6 text-center text-xs text-[#9898A8]">
            Pulsa "Actualizar todos" para obtener datos de los 3 portales en tiempo real
          </div>
        ) : (
          <div className="p-5">
            <div className="text-[10px] text-[#9898A8] mb-3">
              {live
                ? `${live.apartments?.length ?? "—"} alojamientos · ${fmtDate(live.search_date)} · Portal: ${portal.toUpperCase()}`
                : `Datos combinados (${stats.count} alojamientos)`
              }
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-3 mb-5">
              {[
                { label:"Mínimo", val:stats.min, color:"#6B7F96" },
                { label:"P25",    val:stats.p25, color:"#f59e0b" },
                { label:"Mediana",val:stats.p50, color:"#10b981" },
                { label:"P75",    val:stats.p75, color:"#6366f1" },
                { label:"Máximo", val:stats.max, color:"#ef4444" },
              ].map(s => (
                <div key={s.label} className="bg-[#F4F6F9] rounded-[6px] p-3 text-center">
                  <div className="text-[10px] text-[#9898A8] mb-1">{s.label}</div>
                  <div className="text-sm font-bold" style={{color:s.color}}>{fmtEUR(s.val)}</div>
                </div>
              ))}
            </div>

            {/* Barra */}
            <div className="mb-4">
              <div className="relative h-5 bg-[#F4F6F9] rounded-full overflow-hidden">
                <div className="absolute top-0 h-full opacity-20 bg-[#10b981] rounded-full"
                  style={{ left:`${((stats.p25-stats.min)/(stats.max-stats.min))*100}%`,
                    width:`${((stats.p75-stats.p25)/(stats.max-stats.min))*100}%` }}/>
                <div className="absolute top-0.5 h-4 w-0.5 bg-[#10b981] opacity-60 rounded-full"
                  style={{ left:`${((stats.p50-stats.min)/(stats.max-stats.min))*100}%` }}/>
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-[#9898A8]">
                <span>{fmtEUR(stats.min)}</span>
                <span>p50: {fmtEUR(stats.p50)} · p75: {fmtEUR(stats.p75)} · {stats.count} alojamientos</span>
                <span>{fmtEUR(stats.max)}</span>
              </div>
            </div>

            {/* Posición nuestros pisos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {OUR_PRICES.map(p => {
                const price = scenario === "normal" ? p.normal : (p as any)[scenario]
                const pos = getPosition(price, stats)
                const pct = ((price - stats.min) / (stats.max - stats.min)) * 100
                return (
                  <div key={p.id} className="bg-[#F4F6F9] rounded-[6px] p-3 border border-[#E8EDF3]">
                    <div className="flex items-center gap-1 mb-2">
                      <span>{p.emoji}</span>
                      <span className="text-[11px] font-semibold text-[#1A2535] truncate">{p.label}</span>
                    </div>
                    <div className="text-base font-bold mb-1" style={{color:p.color}}>{fmtEUR(price)}</div>
                    <div className="relative h-1.5 bg-[#E8EDF3] rounded-full mb-1">
                      <div className="absolute top-0 left-0 h-full rounded-full"
                        style={{width:`${Math.max(4,pct)}%`, background:p.color}}/>
                    </div>
                    <div className="text-[10px] font-semibold" style={{color:pos.color}}>{pos.label}</div>
                    <div className="text-[9px] text-[#9898A8] mt-0.5">
                      Mercado p50: {fmtEUR(stats.p50)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Lista competidores */}
            {live?.apartments && live.apartments.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-[#1A2535] mb-2">
                  Alojamientos · {portal.toUpperCase()}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[...live.apartments].sort((a,b) => a.price_night - b.price_night).map((apt,i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#F4F6F9] rounded-[4px]">
                      <div className="relative w-20 h-1.5 bg-[#E8EDF3] rounded-full shrink-0">
                        <div className="absolute top-0 left-0 h-full rounded-full"
                          style={{background: PORTAL_COLORS[portal] ?? "#6B7F96",
                            width:`${((apt.price_night-stats.min)/(stats.max-stats.min))*100}%`}}/>
                      </div>
                      <span className="text-xs font-bold text-[#1A2535] w-14 shrink-0">{fmtEUR(apt.price_night)}</span>
                      {apt.score && <span className="text-[10px] text-[#f59e0b]">★{apt.score}</span>}
                      <span className="text-[10px] text-[#9898A8] truncate">{apt.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Análisis por piso ──────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-[#1A2535] mb-3">Análisis por alojamiento</div>
        <div className="flex gap-2 mb-4 flex-wrap">
          {FALLBACK_PROPS.map((p,i) => (
            <button key={p.id} onClick={() => setPropIdx(i)}
              className="px-3 py-1.5 rounded-[4px] text-xs font-semibold transition-all border"
              style={{ background:propIdx===i?p.color:"white", color:propIdx===i?"white":"#3f3f46",
                borderColor:propIdx===i?p.color:"var(--border)",
                boxShadow:propIdx===i?`0 4px 12px ${p.color}40`:"none" }}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8EDF3] flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#1A2535]">{prop.emoji} {prop.label}</h2>
                <p className="text-xs text-[#9898A8] mt-0.5">{prop.zona} · {prop.beds} hab · máx {prop.maxGuests} pax</p>
              </div>
              <div className="flex gap-1 flex-wrap">
                {prop.tags.map(t => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[#F4F6F9] text-[#6B7F96]">{t}</span>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-[#E8EDF3]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#9898A8]">{fmtEUR(gMin)}</span>
                <span className="text-xs font-semibold" style={{color:ourPosColor}}>
                  Nuestro precio: {fmtEUR(ourPrice)} · posición {ourPos.toUpperCase()}
                </span>
                <span className="text-xs text-[#9898A8]">{fmtEUR(gMax)}</span>
              </div>
              <div className="relative h-6 bg-[#F4F6F9] rounded-full overflow-hidden">
                <div className="absolute top-0 h-full opacity-20 bg-[#10b981] rounded-full"
                  style={{ left:`${((p50-gMin)/(gMax-gMin))*100}%`, width:`${((p75-p50)/(gMax-gMin))*100}%` }}/>
                {comp.map((c,i) => (
                  <div key={i} className="absolute top-1 w-2 h-4 rounded-sm opacity-60"
                    style={{ left:`${((c.price-gMin)/(gMax-gMin))*100}%`, background:"#94a3b8", transform:"translateX(-50%)" }}/>
                ))}
                <div className="absolute top-0 w-1 h-6 rounded-full"
                  style={{ left:`${((ourPrice-gMin)/(gMax-gMin))*100}%`, background:prop.color,
                    transform:"translateX(-50%)", boxShadow:`0 0 8px ${prop.color}` }}/>
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-[#9898A8]">
                <span>p50: {fmtEUR(p50)}</span><span>p75: {fmtEUR(p75)}</span><span>max: {fmtEUR(Math.max(...prices))}</span>
              </div>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8EDF3]">
                  <th className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">Competidor</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-[#9898A8]">Score</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-[#9898A8]">€/noche</th>
                </tr>
              </thead>
              <tbody>
                {[...comp].sort((a,b) => a.price-b.price).map((c,i) => {
                  const bar = Math.round(((c.price-gMin)/(gMax-gMin))*100)
                  const isAbove = c.price > ourPrice
                  return (
                    <tr key={i} className="border-b border-[#E8EDF3] hover:bg-[#F4F6F9]">
                      <td className="px-4 py-3 font-medium text-[#1A2535]">{c.name}</td>
                      <td className="px-4 py-3 text-right"><span className="text-[#f59e0b] font-semibold">★ {c.score}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-[#F4F6F9] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${bar}%`,background:isAbove?"#ef4444":"#10b981"}}/>
                          </div>
                          <span className="font-bold w-14 text-right" style={{color:isAbove?"#ef4444":"#10b981"}}>
                            {fmtEUR(c.price)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t-2" style={{borderColor:prop.color, background:`${prop.color}08`}}>
                  <td className="px-4 py-3 font-bold" style={{color:prop.color}}>{prop.emoji} {prop.label} (nosotros)</td>
                  <td className="px-4 py-3 text-right text-[#9898A8] text-xs">—</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-sm" style={{color:prop.color}}>{fmtEUR(ourPrice)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4">
              <h3 className="text-sm font-semibold text-[#1A2535] mb-3">Posicionamiento</h3>
              <div className="space-y-3">
                {[
                  { label:"Nuestro precio",  val:fmtEUR(ourPrice),           color:prop.color },
                  { label:"Mínimo comp-set", val:fmtEUR(Math.min(...prices)),color:"#6B7F96"  },
                  { label:"Mediana (p50)",   val:fmtEUR(p50),                color:"#f59e0b"  },
                  { label:"Percentil 75",    val:fmtEUR(p75),                color:"#10b981"  },
                  { label:"Máximo comp-set", val:fmtEUR(Math.max(...prices)),color:"#ef4444"  },
                ].map(k => (
                  <div key={k.label} className="flex items-center justify-between">
                    <span className="text-xs text-[#9898A8]">{k.label}</span>
                    <span className="text-sm font-bold" style={{color:k.color}}>{k.val}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#E8EDF3]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9898A8]">Posición actual</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{background:`${ourPosColor}15`, color:ourPosColor}}>
                    {ourPos === "bajo" ? "⬇ Bajo mercado" : ourPos === "medio" ? "→ En mercado" : "⬆ Premium"}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4">
              <h3 className="text-sm font-semibold text-[#1A2535] mb-2">📊 Análisis</h3>
              <p className="text-xs text-[#6B7F96] leading-relaxed">{prop.insight}</p>
            </div>
            <div className="bg-[#F4F6F9] rounded-[6px] p-3 text-[10px] text-[#9898A8]">
              <div className="font-semibold mb-1">Fuentes de datos</div>
              <div>Portales: Booking · Tripadvisor · Expedia</div>
              <div>Último update: {livePortals.length > 0 ? "hoy" : "pendiente"}</div>
              <div className="mt-1 text-[#6B7F96]">4 pax · Sevilla centro histórico</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
