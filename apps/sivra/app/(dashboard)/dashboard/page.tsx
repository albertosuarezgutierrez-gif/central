"use client"
import { useEffect, useState } from "react"
import { PricingAlertsWidget } from "@/components/pricing-alerts-widget"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
const MONTHS_LONG = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const PORTALS = ["AIRBNB","BOOKING","EXPEDIA","AGODA","VRBO","DIRECTO","OTRO"]
const PORTAL_COLORS: Record<string,string> = { AIRBNB:"#FF5A5F", BOOKING:"#003580", EXPEDIA:"#FFC72C", AGODA:"#E84142", VRBO:"#3B5998", DIRECTO:"#10B981", OTRO:"#94A3B8" }
const PROPERTY_COLORS = ["#d0f100","#001033","#1b2540","#596075","#b1b5c0","#6b7184"]

const fmtEUR = (n: number) => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n)
const fmtK   = (n: number) => Math.abs(n)>=1000 ? `€${(n/1000).toFixed(1)}k` : `€${Math.round(n)}`

const CARD = {
  background: '#ffffff',
  borderRadius: '20px',
  boxShadow: '0 1px 3px rgba(0,39,80,0.08), 0 0 0 1px rgba(0,39,80,0.06)',
  padding: '20px',
}

const CARD_SM = { ...CARD, borderRadius: '16px', padding: '16px' }

type Data = {
  filters: { year: number; month: number | null; propertyId: string; portal: string }
  properties: { id: string; name: string; location: string }[]
  kpis: { ingresos:number; ingresosPrev:number; ingresosDelta:number|null; reservas:number; reservasPrev:number; reservasDelta:number|null; noches:number; adr:number; gastos:number; gastosPrev:number; gastosCount:number; gastosDelta:number|null; beneficio:number; margen:number }
  monthly: any[]; byProperty: any[]; byPortal: any[]; expByCategory: any[]; expByProperty: any[]; recent: any[]; recentExpenses: any[]
}

function Delta({ v, suffix = "%" }: { v: number | null; suffix?: string }) {
  if (v === null || !isFinite(v)) return <span style={{ fontSize: 11, fontWeight: 500, color: '#6b7184', letterSpacing: '-0.01em' }}>nuevo</span>
  const up = v >= 0
  return (
    <span style={{ fontSize: 11, fontWeight: 500, color: up ? '#22c55e' : '#ef4444', letterSpacing: '-0.01em' }}>
      {up ? '↑' : '↓'} {Math.abs(v).toFixed(1)}{suffix}
    </span>
  )
}

function KpiCard({ label, value, prev, delta, accent }: { label: string; value: string; prev?: string; delta?: number | null; accent?: boolean }) {
  return (
    <div style={{
      ...CARD,
      borderTop: accent ? '3px solid #d0f100' : '3px solid transparent',
    }}>
      <div style={{ fontSize: 11, color: '#6b7184', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: '#1b2540', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {(prev !== undefined || delta !== undefined) && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          {prev && <span style={{ fontSize: 12, color: '#b1b5c0' }}>vs {prev}</span>}
          {delta !== undefined && <Delta v={delta} />}
        </div>
      )}
    </div>
  )
}


function TodayRow({ r }: { r: any }) {
  const piso = r.propertyName || r.propertyId || 'Piso sin asignar'
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 12, color: '#1b2540', fontWeight: 500 }}>{r.guestName || 'Huésped'}</div>
      <div style={{ fontSize: 11, color: '#6b7184', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span aria-hidden>🏠</span>{piso}
      </div>
    </div>
  )
}

function ForecastWidget({ data }: { data: any }) {
  if (!data) return null
  const fmtE = (n: number) => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n)
  return (
    <div style={CARD_SM}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <h3 style={{margin:0,fontSize:13,fontWeight:700,color:"#374151"}}>📈 Ingresos confirmados</h3>
        <span style={{fontSize:10,color:"#6b7280",background:"#f3f4f6",padding:"2px 8px",borderRadius:20}}>reservas futuras</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {[["30 días",data.forecast?.d30],["60 días",data.forecast?.d60],["90 días",data.forecast?.d90]].map(([l,v]:any)=>(
          <div key={l} style={{textAlign:"center",background:"#f0fdf4",borderRadius:8,padding:"10px 4px"}}>
            <div style={{fontSize:16,fontWeight:800,color:"#16a34a"}}>{fmtE(v||0)}</div>
            <div style={{fontSize:10,color:"#6b7280",marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{borderTop:"1px solid #e5e7eb",paddingTop:10}}>
        <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>Por propiedad (90 días)</div>
        {(data.por_piso||[]).slice(0,4).map((p:any)=>(
          <div key={p.name} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
            <span style={{color:"#374151"}}>{p.name?.split(" ").slice(-1)[0]}</span>
            <span style={{fontWeight:700,color:"#111827"}}>{fmtE(p.amount)} · {p.reservas} res</span>
          </div>
        ))}
      </div>
      {data.proximas?.length > 0 && (
        <div style={{marginTop:10,borderTop:"1px solid #e5e7eb",paddingTop:10}}>
          <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>Próximas salidas</div>
          {data.proximas.slice(0,3).map((p:any,i:number)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3,color:"#4b5563"}}>
              <span>{p.checkOut?.slice(5)} — {p.property?.split(" ").pop()}</span>
              <span style={{fontWeight:600,color:"#16a34a"}}>€{p.net}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState<number|null>(now.getMonth()+1)
  const [propertyId, setPropertyId] = useState("all")
  const [portal, setPortal] = useState("all")
  const [data, setData] = useState<Data|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [todayIn, setTodayIn] = useState<any[]>([])
  const [todayOut, setTodayOut] = useState<any[]>([])
  const [tomorrowIn, setTomorrowIn] = useState<any[]>([])

  const yrs = [now.getFullYear()+1, now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2]

  useEffect(() => {
    setLoading(true); setError(null)
    const p = new URLSearchParams({ year: String(year), propertyId, portal })
    if (month != null) p.set("month", String(month))
    fetch(`/api/dashboard?${p}`, { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year, month, propertyId, portal])

  useEffect(() => {
    fetch("/api/incomes/today").then(r=>r.json()).then(d=>{
      setTodayIn(d.todayCheckIn||[]); setTodayOut(d.todayCheckOut||[]); setTomorrowIn(d.tomorrowCheckIn||[])
    }).catch(()=>{})
  }, [])

  const sel = { fontSize: 13, color: '#1b2540', background: '#ffffff', border: '1px solid rgba(0,39,80,0.12)', borderRadius: 10, padding: '6px 10px', letterSpacing: '-0.016em', outline: 'none' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, letterSpacing: '-0.016em' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 8 }}><h1 style={{ fontSize: 22, fontWeight: 600, color: '#1b2540', letterSpacing: '-0.025em', marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#6b7184' }}>
            {month ? `${MONTHS_LONG[month-1]} ${year}` : `Año ${year}`} · {data?.properties.find(p=>p.id===propertyId)?.name || 'Todas las propiedades'}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={year} onChange={e=>setYear(+e.target.value)} style={sel}>
            {yrs.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month ?? ''} onChange={e=>setMonth(e.target.value ? +e.target.value : null)} style={sel}>
            <option value="">Año completo</option>
            {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={propertyId} onChange={e=>setPropertyId(e.target.value)} style={sel}>
            <option value="all">Todos los pisos</option>
            {data?.properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={portal} onChange={e=>setPortal(e.target.value)} style={sel}>
            <option value="all">Todos los portales</option>
            {PORTALS.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...CARD_SM, background: '#fef2f2', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          ⚠ Error cargando datos: {error}
        </div>
      )}

      {/* Today strip */}
      {(todayIn.length > 0 || todayOut.length > 0 || tomorrowIn.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
          {todayOut.length > 0 && (
            <div style={{ ...CARD_SM, borderLeft: '3px solid #ef4444' }}>
              <div style={{ fontSize: 10, color: '#6b7184', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Salidas hoy</div>
              {todayOut.map((r,i)=><TodayRow key={i} r={r} />)}
            </div>
          )}
          {todayIn.length > 0 && (
            <div style={{ ...CARD_SM, borderLeft: '3px solid #22c55e' }}>
              <div style={{ fontSize: 10, color: '#6b7184', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Entradas hoy</div>
              {todayIn.map((r,i)=><TodayRow key={i} r={r} />)}
            </div>
          )}
          {tomorrowIn.length > 0 && (
            <div style={{ ...CARD_SM, borderLeft: '3px solid #d0f100' }}>
              <div style={{ fontSize: 10, color: '#6b7184', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Entradas mañana</div>
              {tomorrowIn.map((r,i)=><TodayRow key={i} r={r} />)}
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[...Array(5)].map((_,i) => (
            <div key={i} style={{ ...CARD, height: 100, background: 'linear-gradient(90deg, #f8f9fc 0%, #eef0f5 50%, #f8f9fc 100%)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Ingresos netos" value={fmtK(data.kpis.ingresos)} prev={fmtK(data.kpis.ingresosPrev)} delta={data.kpis.ingresosDelta} accent />
          <KpiCard label="Beneficio" value={fmtK(data.kpis.beneficio)} prev={undefined} delta={undefined} />
          <KpiCard label="Margen" value={`${data.kpis.margen.toFixed(1)}%`} />
          <KpiCard label="Reservas" value={String(data.kpis.reservas)} prev={String(data.kpis.reservasPrev)} delta={data.kpis.reservasDelta} />
          <KpiCard label="ADR" value={fmtEUR(data.kpis.adr)} />
          <KpiCard label="Gastos" value={fmtK(data.kpis.gastos)} prev={fmtK(data.kpis.gastosPrev)} delta={data.kpis.gastosDelta} />
        </div>
      ) : null}

      {/* Charts row */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Monthly evolution */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1b2540', marginBottom: 16, letterSpacing: '-0.016em' }}>Evolución mensual</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthly} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,39,80,0.06)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={v => MONTHS[+v-1]} tick={{ fontSize: 11, fill: '#b1b5c0' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtK(v)} tick={{ fontSize: 11, fill: '#b1b5c0' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--border)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, letterSpacing: '-0.016em' }}
                  formatter={(v: number) => [fmtEUR(v)]}
                  labelFormatter={(l: any) => MONTHS[+l-1]}
                />
                <Bar dataKey={String(year)} fill="#d0f100" radius={[4,4,0,0]} name={String(year)} />
                <Bar dataKey={String(year-1)} fill="rgba(0,39,80,0.12)" radius={[4,4,0,0]} name={String(year-1)} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7184' }}>
                <div style={{ width: 10, height: 10, background: '#d0f100', borderRadius: 2 }} />{year}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7184' }}>
                <div style={{ width: 10, height: 10, background: 'rgba(0,39,80,0.15)', borderRadius: 2 }} />{year-1}
              </div>
            </div>
          </div>

          {/* By portal */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1b2540', marginBottom: 16, letterSpacing: '-0.016em' }}>Por portal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.byPortal.slice(0,6).map((p, i) => {
                const max = data.byPortal[0]?.amount || 1
                const pct = Math.round((p.amount / max) * 100)
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: '#1b2540', fontWeight: 500 }}>{p.portal}</span>
                      <span style={{ color: '#6b7184' }}>{fmtK(p.amount)}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(0,39,80,0.06)', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: 4, background: PORTAL_COLORS[p.portal] || '#d0f100', borderRadius: 2, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom row */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* By property */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1b2540', marginBottom: 16 }}>Por propiedad</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.byProperty.map((p,i) => {
                const max = data.byProperty[0]?.amount || 1
                const pct = Math.round((p.amount/max)*100)
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: '#1b2540', fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: '#6b7184' }}>{fmtK(p.amount)} · {p.count} res</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(0,39,80,0.06)', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: 4, background: PROPERTY_COLORS[i] || '#d0f100', borderRadius: 2 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent reservations */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1b2540', marginBottom: 16 }}>Últimas reservas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {data.recent.slice(0,6).map((r,i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 5 ? '1px solid rgba(0,39,80,0.06)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1b2540' }}>{r.guestName || 'Huésped'}</div>
                    <div style={{ fontSize: 11, color: '#b1b5c0' }}>{r.propertyName || r.propertyId} · {r.nights}n</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1b2540' }}>{fmtEUR(r.amount)}</div>
                    <div style={{ fontSize: 10, color: PORTAL_COLORS[r.portal] || '#94A3B8', fontWeight: 500 }}>{r.portal}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
