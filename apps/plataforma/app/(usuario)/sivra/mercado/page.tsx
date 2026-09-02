'use client'
import { useState, useEffect, useCallback } from "react"
import { PageHeader, ThinBar } from "@/components/ui"

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
  { id: "prop_duplex_center",    label: "Duplex Center",   emoji: "🏢", color: "var(--positive)", normal: 121, corpus: 200 },
  { id: "prop_luxury_busto",     label: "Luxury Busto",    emoji: "✨", color: "var(--negative)", normal: 150, corpus: 235 },
  { id: "prop_busto_reform",     label: "Busto Reform",    emoji: "🏠", color: "var(--warning)", normal: 80,  corpus: 132 },
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
    id: "prop_duplex_center", label: "Duplex Center", color: "var(--positive)", emoji: "🏢",
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
    id: "prop_luxury_busto", label: "Luxury Busto", color: "var(--negative)", emoji: "✨",
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
    id: "prop_busto_reform", label: "Busto Reform", color: "var(--warning)", emoji: "🏠",
    beds: 1, baths: 1, maxGuests: 2, m2: 60,
    zona: "Zona Bustos Tavera · Sevilla",
    tags: ["1 hab","2 pax","Reformado"],
    ourPrice: 80,
    comp: [
      { name:"Singular Metropol",            price:144, score:8.7 },
      { name:"Panther Home Luxury Dreams",   price:146, score:8.3 },
      { name:"Stay Unique Apts Eslava",      price:170, score:9.0 },
    ],
    insight: "Busto Reform significativamente por debajo del mercado: 80€ vs 144-170€/noche. Acción prioritaria: subir base a 95-100€.",
  },
]

const fmtEUR = (n: number) => `${Math.round(n).toLocaleString("es-ES")}€`
const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })

function getPosition(price: number, stats: ScenarioStats) {
  if (price < stats.p25)  return { label: "Bajo mercado ⬇", color: "var(--negative)" }
  if (price < stats.p50)  return { label: "Mercado medio",  color: "var(--warning)" }
  if (price <= stats.p75) return { label: "Mercado alto",   color: "var(--positive)" }
  return { label: "Premium ⬆", color: "#6366f1" }
}

const PORTAL_COLORS: Record<string,string> = {
  booking: "#003580", tripadvisor: "#00aa6c", expedia: "var(--warning)", all: "#6B7F96"
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
    fetch("/api/sivra/mercado/stats")
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setLiveData(d.data || {}); setLivePortals(d.portals || []) }
      })
      .finally(() => setLoading(false))
  }, [])

  const runRefresh = useCallback(async (p: string) => {
    setRefreshing(true); setRefreshMsg(null)
    try {
      const r = await fetch(`/api/sivra/mercado/search?scenario=${scenario}&portal=${p}`)
      const d = await r.json()
      if (d.ok) {
        const portalesBuscados = d.portals?.join(", ") || p
        const totalInserted = d.totalInserted ?? 0
        setRefreshMsg(`✅ ${totalInserted} registros · portales: ${portalesBuscados} · ${d.checkin}`)
        const stats = await fetch("/api/sivra/mercado/stats").then(r => r.json())
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
  const ourPosColor = ourPos === "bajo" ? "var(--negative)" : ourPos === "medio" ? "var(--warning)" : "var(--positive)"

  const portalStats = PORTALS.filter(p => p.id !== "all").map(pt => {
    const key = `${scenario}_${pt.id}`
    const s = liveData[key]?.stats
    return { ...pt, avg: s?.avg ?? null, p50: s?.p50 ?? null, count: s?.count ?? 0, hasData: !!s }
  })

  return (
    <div style={{ padding: '16px 24px', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <PageHeader
        titulo="Mercado · Comp-set"
        sub={`Benchmarking multi-portal en Sevilla centro · ${livePortals.length > 0 ? livePortals.join(" + ") : "Booking · Tripadvisor · Expedia"}`}
        acciones={
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 4, padding: 4 }}>
            {([ ["normal","📅 Fin de semana"], ["corpus","✝️ Corpus Christi"] ] as const).map(([v,lbl]) => (
              <button key={v} onClick={() => setScenario(v)}
                style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: scenario === v ? 'white' : 'transparent',
                  color: scenario === v ? '#09090b' : 'var(--muted)',
                  boxShadow: scenario === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        }
      />

      {/* Comparativa multi-portal */}
      <div className="mercado-portal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {portalStats.map(pt => (
          <div key={pt.id}
            onClick={() => setPortal(pt.hasData ? pt.id : "all")}
            style={{
              background: 'var(--surface)', borderRadius: 6,
              border: `1px solid var(--border)`, borderLeft: `3px solid ${pt.color}`,
              padding: 16, cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{pt.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{pt.label}</span>
              </div>
              {pt.hasData
                ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: 'var(--positive-bg)', color: 'var(--positive)', fontWeight: 600 }}>LIVE</span>
                : <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: 'var(--surface)', color: 'var(--muted)' }}>sin datos</span>
              }
            </div>
            {pt.hasData ? (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: pt.color }}>{fmtEUR(pt.avg!)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>media · p50: {fmtEUR(pt.p50!)} · {pt.count} aptos</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin datos todavía</div>
            )}
          </div>
        ))}
      </div>

      {/* Panel benchmarking */}
      <div style={{ background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>📊 Benchmarking en vivo</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {PORTALS.map(pt => (
                <button key={pt.id} onClick={() => setPortal(pt.id)}
                  style={{
                    padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: portal === pt.id ? pt.color : 'transparent',
                    color: portal === pt.id ? 'white' : 'var(--muted)',
                    border: `1px solid ${portal === pt.id ? pt.color : 'var(--border)'}`,
                  }}>
                  {pt.icon} {pt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {refreshMsg && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{refreshMsg}</span>}
            <button onClick={() => runRefresh("all")} disabled={refreshing}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 4, cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.4 : 1, background: 'var(--text)', border: 'none', color: 'var(--muted)' }}>
              {refreshing ? "Actualizando…" : "🔄 Actualizar todos"}
            </button>
            {["booking","tripadvisor","expedia"].map(pt => (
              <button key={pt} onClick={() => runRefresh(pt)} disabled={refreshing}
                style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, borderRadius: 4, cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.4 : 1, background: 'white', border: `1px solid ${PORTAL_COLORS[pt]}`, color: PORTAL_COLORS[pt] }}>
                {pt}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>Cargando…</div>
        ) : !stats ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
            Pulsa "Actualizar todos" para obtener datos de los 3 portales en tiempo real
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
              {live
                ? `${live.apartments?.length ?? "—"} alojamientos · ${fmtDate(live.search_date)} · Portal: ${portal.toUpperCase()}`
                : `Datos combinados (${stats.count} alojamientos)`
              }
            </div>

            {/* Stats */}
            <div className="mercado-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label:"Mínimo", val:stats.min, color:"#6B7F96" },
                { label:"P25",    val:stats.p25, color:"var(--warning)" },
                { label:"Mediana",val:stats.p50, color:"var(--positive)" },
                { label:"P75",    val:stats.p75, color:"#6366f1" },
                { label:"Máximo", val:stats.max, color:"var(--negative)" },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface)', borderRadius: 6, padding: 12, textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{fmtEUR(s.val)}</div>
                </div>
              ))}
            </div>

            {/* Barra */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ position: 'relative', height: 20, background: 'var(--surface)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, height: '100%', opacity: 0.2, background: 'var(--positive)', borderRadius: 999,
                  left: `${((stats.p25-stats.min)/(stats.max-stats.min))*100}%`,
                  width: `${((stats.p75-stats.p25)/(stats.max-stats.min))*100}%`
                }}/>
                <div style={{
                  position: 'absolute', top: 2, height: 16, width: 2, background: 'var(--positive)', opacity: 0.6, borderRadius: 999,
                  left: `${((stats.p50-stats.min)/(stats.max-stats.min))*100}%`
                }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                <span>{fmtEUR(stats.min)}</span>
                <span>p50: {fmtEUR(stats.p50)} · p75: {fmtEUR(stats.p75)} · {stats.count} alojamientos</span>
                <span>{fmtEUR(stats.max)}</span>
              </div>
            </div>

            {/* Posición nuestros pisos */}
            <div className="mercado-pos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {OUR_PRICES.map(p => {
                const price = scenario === "normal" ? p.normal : (p as any)[scenario]
                const pos = getPosition(price, stats)
                const pct = ((price - stats.min) / (stats.max - stats.min)) * 100
                return (
                  <div key={p.id} style={{ background: 'var(--surface)', borderRadius: 6, padding: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                      <span>{p.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: p.color }}>{fmtEUR(price)}</div>
                    <div style={{ marginBottom: 4 }}>
                      <ThinBar pct={Math.max(4, pct)} color={p.color} alto={6} track="var(--border)" />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: pos.color }}>{pos.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Mercado p50: {fmtEUR(stats.p50)}</div>
                  </div>
                )
              })}
            </div>

            {/* Lista competidores */}
            {live?.apartments && live.apartments.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                  Alojamientos · {portal.toUpperCase()}
                </div>
                <div className="mercado-apt-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[...live.apartments].sort((a,b) => a.price_night - b.price_night).map((apt,i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
                      <ThinBar
                        pct={((apt.price_night-stats.min)/(stats.max-stats.min))*100}
                        color={PORTAL_COLORS[portal] ?? "#6B7F96"}
                        width={80} alto={6} track="var(--border)"
                      />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', width: 56, flexShrink: 0 }}>{fmtEUR(apt.price_night)}</span>
                      {apt.score && <span style={{ fontSize: 10, color: 'var(--warning)' }}>★{apt.score}</span>}
                      <span style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Análisis por piso */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Análisis por alojamiento</div>
        <div className="mercado-prop-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {FALLBACK_PROPS.map((p,i) => (
            <button key={p.id} onClick={() => setPropIdx(i)}
              style={{
                padding: '6px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: propIdx === i ? p.color : 'white',
                color: propIdx === i ? 'white' : '#3f3f46',
                border: `1px solid ${propIdx === i ? p.color : 'var(--border)'}`,
                boxShadow: propIdx === i ? `0 4px 12px ${p.color}40` : 'none',
              }}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        <div className="mercado-bench-layout" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{prop.emoji} {prop.label}</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{prop.zona} · {prop.beds} hab · máx {prop.maxGuests} pax</p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {prop.tags.map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{t}</span>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtEUR(gMin)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: ourPosColor }}>
                  Nuestro precio: {fmtEUR(ourPrice)} · posición {ourPos.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtEUR(gMax)}</span>
              </div>
              <div style={{ position: 'relative', height: 24, background: 'var(--surface)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, height: '100%', opacity: 0.2, background: 'var(--positive)', borderRadius: 999, left: `${((p50-gMin)/(gMax-gMin))*100}%`, width: `${((p75-p50)/(gMax-gMin))*100}%` }}/>
                {comp.map((c,i) => (
                  <div key={i} style={{ position: 'absolute', top: 4, width: 8, height: 16, borderRadius: 2, opacity: 0.6, background: 'var(--muted)', left: `${((c.price-gMin)/(gMax-gMin))*100}%`, transform: 'translateX(-50%)' }}/>
                ))}
                <div style={{ position: 'absolute', top: 0, width: 4, height: 24, borderRadius: 999, left: `${((ourPrice-gMin)/(gMax-gMin))*100}%`, background: prop.color, transform: 'translateX(-50%)', boxShadow: `0 0 8px ${prop.color}` }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                <span>p50: {fmtEUR(p50)}</span><span>p75: {fmtEUR(p75)}</span><span>max: {fmtEUR(Math.max(...prices))}</span>
              </div>
            </div>

            <div className="mercado-table-wrap">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>Competidor</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }}>Score</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }}>€/noche</th>
                </tr>
              </thead>
              <tbody>
                {[...comp].sort((a,b) => a.price-b.price).map((c,i) => {
                  const bar = Math.round(((c.price-gMin)/(gMax-gMin))*100)
                  const isAbove = c.price > ourPrice
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text)' }}>{c.name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}><span style={{ color: 'var(--warning)', fontWeight: 600 }}>★ {c.score}</span></td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <ThinBar
                            pct={bar}
                            color={isAbove ? 'var(--negative)' : 'var(--positive)'}
                            width={64} alto={6} track="var(--surface)"
                          />
                          <span style={{ fontWeight: 700, width: 56, textAlign: 'right', color: isAbove ? 'var(--negative)' : 'var(--positive)' }}>{fmtEUR(c.price)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: `2px solid ${prop.color}`, background: `${prop.color}08` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: prop.color }}>{prop.emoji} {prop.label} (nosotros)</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>—</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: prop.color }}>{fmtEUR(ourPrice)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Posicionamiento</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label:"Nuestro precio",  val:fmtEUR(ourPrice),           color:prop.color },
                  { label:"Mínimo comp-set", val:fmtEUR(Math.min(...prices)),color:"#6B7F96"  },
                  { label:"Mediana (p50)",   val:fmtEUR(p50),                color:"var(--warning)"  },
                  { label:"Percentil 75",    val:fmtEUR(p75),                color:"var(--positive)"  },
                  { label:"Máximo comp-set", val:fmtEUR(Math.max(...prices)),color:"var(--negative)"  },
                ].map(k => (
                  <div key={k.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{k.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: k.color }}>{k.val}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Posición actual</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${ourPosColor}15`, color: ourPosColor }}>
                    {ourPos === "bajo" ? "⬇ Bajo mercado" : ourPos === "medio" ? "→ En mercado" : "⬆ Premium"}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>📊 Análisis</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{prop.insight}</p>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 12, fontSize: 10, color: 'var(--muted)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Fuentes de datos</div>
              <div>Portales: Booking · Tripadvisor · Expedia</div>
              <div>Último update: {livePortals.length > 0 ? "hoy" : "pendiente"}</div>
              <div style={{ marginTop: 4, color: 'var(--muted)' }}>4 pax · Sevilla centro histórico</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
