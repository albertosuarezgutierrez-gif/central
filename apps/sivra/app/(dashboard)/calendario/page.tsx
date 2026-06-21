"use client"
import { useState, useEffect, useMemo } from "react"

const PROPS = [
  { id: "prop_house_sevillana", label: "House Sevillana",  color: "var(--lime-d)", short: "HS" },
  { id: "prop_busto_reform",    label: "Busto Reform",     color: "#f59e0b", short: "BR" },
  { id: "prop_duplex_center",   label: "Duplex Center",    color: "#10b981", short: "DC" },
  { id: "prop_luxury_busto",    label: "Luxury Busto",     color: "#ef4444", short: "LB" },
]

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                     "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DAY_SHORT   = ["L","M","X","J","V","S","D"]

type Income = {
  id: string; propertyId: string; guestName: string | null
  checkIn: string; checkOut: string; portal: string; amount: number
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(date: Date, n: number) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

// Returns Set of "YYYY-MM-DD" strings between checkIn (inclusive) and checkOut (exclusive)
function getOccupiedDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = []
  const start = new Date(checkIn)
  const end   = new Date(checkOut)
  const cur   = new Date(start)
  while (cur < end) {
    dates.push(isoDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export default function CalendarioPage() {
  const now = new Date()
  const [incomes, setIncomes]   = useState<Income[]>([])
  const [loading, setLoading]   = useState(true)
  const [baseYear, setBaseYear] = useState(now.getFullYear())
  const [baseMonth, setBaseMonth] = useState(now.getMonth())
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/incomes")
      .then(r => r.json())
      .then(d => { setIncomes(d.incomes || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Build occupation map: date → [{ propId, income }]
  const occMap = useMemo(() => {
    const map: Record<string, { propId: string; income: Income }[]> = {}
    incomes.forEach(inc => {
      if (!inc.checkIn || !inc.checkOut) return
      const dates = getOccupiedDates(inc.checkIn, inc.checkOut)
      dates.forEach(d => {
        if (!map[d]) map[d] = []
        map[d].push({ propId: inc.propertyId, income: inc })
      })
    })
    return map
  }, [incomes])

  // Show 3 months: current + next 2
  const months = [0, 1, 2].map(offset => {
    const m = (baseMonth + offset) % 12
    const y = baseYear + Math.floor((baseMonth + offset) / 12)
    return { year: y, month: m }
  })

  // Occupancy stats next 30 days per property
  const stats = useMemo(() => {
    const today = isoDate(now)
    const horizon = isoDate(addDays(now, 30))
    return PROPS.map(p => {
      let count = 0
      for (let i = 0; i < 30; i++) {
        const d = isoDate(addDays(now, i))
        if (occMap[d]?.some(o => o.propId === p.id)) count++
      }
      return { ...p, days: count, pct: Math.round((count / 30) * 100) }
    })
  }, [occMap])

  // Upcoming check-ins next 14 days
  const upcoming = useMemo(() => {
    const today = isoDate(now)
    const limit = isoDate(addDays(now, 14))
    return incomes
      .filter(inc => inc.checkIn >= today && inc.checkIn <= limit)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 12)
  }, [incomes])

  function prevMonths() {
    if (baseMonth === 0) { setBaseYear(y => y - 1); setBaseMonth(10) }
    else setBaseMonth(m => m - 1)
  }
  function nextMonths() {
    if (baseMonth >= 10) { setBaseYear(y => y + 1); setBaseMonth((baseMonth + 1) % 12) }
    else setBaseMonth(m => m + 1)
  }

  function getPropColor(propId: string) {
    return PROPS.find(p => p.id === propId)?.color ?? "#94a3b8"
  }
  function getPropLabel(propId: string) {
    return PROPS.find(p => p.id === propId)?.short ?? "?"
  }

  const fmtCheckIn = (d: string) => {
    const [y, m, day] = d.split("-")
    return `${day}/${m}`
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A2535] tracking-tight">Calendario de ocupación</h1>
          <p className="text-sm text-[#9898A8] mt-0.5">Vista unificada · 6 propiedades · datos Smoobu</p>
        </div>
        <div className="flex gap-2">
          <button onClick={prevMonths}
            className="w-8 h-8 rounded-[4px] border border-[#E8EDF3] flex items-center justify-center text-[#9898A8] hover:bg-[#F4F6F9] transition-colors text-lg">‹</button>
          <button onClick={() => { setBaseYear(now.getFullYear()); setBaseMonth(now.getMonth()) }}
            className="px-3 py-1 rounded-[4px] border border-[#E8EDF3] text-xs font-medium text-[#9898A8] hover:bg-[#F4F6F9] transition-colors">Hoy</button>
          <button onClick={nextMonths}
            className="w-8 h-8 rounded-[4px] border border-[#E8EDF3] flex items-center justify-center text-[#9898A8] hover:bg-[#F4F6F9] transition-colors text-lg">›</button>
        </div>
      </div>

      {/* Property legend + occupancy stats */}
      <div className="flex flex-wrap gap-2 mb-5">
        {stats.map(p => (
          <div key={p.id} className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] px-3 py-2.5 flex items-center gap-3 min-w-[160px]">
            <div className="w-3 h-3 rounded-full shrink-0" style={{background: p.color}}/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#1A2535] truncate">{p.label}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="flex-1 h-1.5 rounded-full bg-[#F4F6F9] w-16">
                  <div className="h-full rounded-full transition-all" style={{width:`${p.pct}%`,background:p.color}}/>
                </div>
                <span className="text-[10px] font-bold" style={{color:p.color}}>{p.pct}%</span>
                <span className="text-[10px] text-[#6B7F96]">/30d</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3-month calendars */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#6B7F96] text-sm">Cargando reservas…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {months.map(({ year, month }) => {
            const daysInMonth = new Date(year, month + 1, 0).getDate()
            const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1 })()
            const todayStr = isoDate(now)

            return (
              <div key={`${year}-${month}`} className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#E8EDF3]">
                  <span className="font-semibold text-sm text-[#1A2535]">{MONTH_NAMES[month]} {year}</span>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 px-3 pt-2">
                  {DAY_SHORT.map(d => (
                    <div key={d} className="text-center text-[9px] font-semibold text-[#6B7F96] py-1 uppercase tracking-wide">{d}</div>
                  ))}
                </div>
                {/* Day grid */}
                <div className="grid grid-cols-7 gap-px px-2 pb-3">
                  {Array.from({length: firstDow}).map((_,i) => <div key={`e-${i}`}/>)}
                  {Array.from({length: daysInMonth}, (_, i) => {
                    const day = i + 1
                    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`
                    const occ = occMap[dateStr] || []
                    const isToday = dateStr === todayStr
                    const isPast  = dateStr < todayStr
                    const isHover = hoverDate === dateStr

                    // Deduplicate by propId
                    const propIds = [...new Set(occ.map(o => o.propId))]

                    return (
                      <div key={day}
                        className="relative rounded-md flex flex-col items-center py-1 cursor-default transition-all"
                        style={{
                          background: isHover && propIds.length > 0 ? "#f5f3ff" : "transparent",
                          opacity: isPast ? 0.5 : 1,
                        }}
                        onMouseEnter={() => setHoverDate(dateStr)}
                        onMouseLeave={() => setHoverDate(null)}
                      >
                        <span className="text-[10px] font-medium leading-none mb-0.5"
                          style={{
                            color: isToday ? "var(--lime-d)" : "#09090b",
                            fontWeight: isToday ? "800" : propIds.length > 0 ? "600" : "400"
                          }}>
                          {day}
                        </span>
                        {/* Property dots */}
                        {propIds.length > 0 && (
                          <div className="flex gap-px flex-wrap justify-center" style={{maxWidth:"24px"}}>
                            {propIds.slice(0, 3).map(pid => (
                              <div key={pid} className="w-1.5 h-1.5 rounded-full" style={{background: getPropColor(pid)}}/>
                            ))}
                            {propIds.length > 3 && (
                              <div className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa]"/>
                            )}
                          </div>
                        )}
                        {/* Hover tooltip */}
                        {isHover && propIds.length > 0 && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 bg-[#09090b] text-[9px] rounded-md px-2 py-1 whitespace-nowrap  pointer-events-none">
                            {occ.slice(0,3).map((o,i) => (
                              <div key={i}>{getPropLabel(o.propId)} · {o.income.guestName?.split(" ")[0] || "?"}</div>
                            ))}
                            {occ.length > 3 && <div>+{occ.length-3} más</div>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Month occupancy footer */}
                <div className="px-4 py-2 border-t border-[#E8EDF3]">
                  {(() => {
                    const daysInM = new Date(year, month+1, 0).getDate()
                    const occupiedDays = new Set(
                      Object.keys(occMap).filter(d => d.startsWith(`${year}-${String(month+1).padStart(2,"0")}`))
                    ).size
                    const pct = Math.round((occupiedDays / daysInM) * 100)
                    return (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[#F4F6F9]">
                          <div className="h-full rounded-full bg-[#BBFF44]" style={{width:`${pct}%`}}/>
                        </div>
                        <span className="text-[10px] text-[#9898A8] shrink-0">{pct}% ocupación</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upcoming check-ins */}
      <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E8EDF3] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1A2535]">Próximas llegadas · 14 días</h3>
          <span className="text-xs text-[#6B7F96]">{upcoming.length} reservas</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#6B7F96]">
            {loading ? "Cargando…" : "No hay llegadas en los próximos 14 días"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8EDF3]">
                  {["Entrada","Propiedad","Huésped","Portal","Noches","Importe"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-[#9898A8]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcoming.map((inc, i) => {
                  const prop = PROPS.find(p => p.id === inc.propertyId)
                  const nights = inc.checkOut
                    ? Math.round((new Date(inc.checkOut).getTime() - new Date(inc.checkIn).getTime()) / 86400000)
                    : 1
                  const isToday = inc.checkIn === isoDate(now)
                  const isTomorrow = inc.checkIn === isoDate(addDays(now, 1))

                  return (
                    <tr key={inc.id || i}
                      className="border-b border-[#f9f9f9] hover:bg-[#f9f9fb] transition-colors"
                      style={{background: isToday ? "#f5f3ff" : "white"}}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#1A2535]">{fmtCheckIn(inc.checkIn)}</span>
                          {isToday && <span className="px-1.5 py-0.5 rounded-full bg-[#BBFF44] text-[9px] font-bold">HOY</span>}
                          {isTomorrow && <span className="px-1.5 py-0.5 rounded-full bg-[#f59e0b] text-[9px] font-bold">MAÑANA</span>}
                        </div>
                        <div className="text-[10px] text-[#6B7F96]">
                          hasta {inc.checkOut ? fmtCheckIn(inc.checkOut) : "?"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{background: prop?.color ?? "#94a3b8"}}/>
                          <span className="font-medium text-[#1A2535] truncate max-w-[110px]">{prop?.label ?? inc.propertyId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[#1A2535]">
                        {inc.guestName || <span className="text-[#6B7F96]">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{background: inc.portal === "AIRBNB" ? "#FF5A5F" : inc.portal === "BOOKING" ? "#003580" : "#BBFF44"}}>
                          {inc.portal}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#9898A8]">{nights}n</td>
                      <td className="px-4 py-2.5 font-semibold text-[#1A2535]">
                        {inc.amount ? new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(inc.amount) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
