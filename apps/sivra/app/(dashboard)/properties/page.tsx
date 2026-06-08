"use client"
import { useState, useEffect } from "react"

const PROP_META: Record<string, { color: string; emoji: string }> = {
  "prop_house_sevillana":    { color: "var(--lime-d, #84cc16)", emoji: "🏛️" },
  "prop_busto_reform":       { color: "#f59e0b", emoji: "🏠" },
  "prop_duplex_center":      { color: "#10b981", emoji: "🏢" },
  "prop_luxury_busto":       { color: "#ef4444", emoji: "✨" },
  "prop_multi_apartamentos": { color: "#94a3b8", emoji: "🔗" },
}

type Property = {
  id: string; name: string; location: string
  smoobuId: number | null
  bedrooms: number | null; beds: number | null
  bathrooms: number | null; maxGuests: number | null
}
type Stat = { name: string; amount: number; count: number; nights?: number }

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)

function RoomBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-[#9898A8] bg-[#F4F6F9] rounded-full px-2 py-0.5">
      <span>{icon}</span>{label}
    </span>
  )
}

export default function PropertiesPage() {
  const [props, setProps]   = useState<Property[]>([])
  const [stats, setStats]   = useState<Stat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/properties").then(r => r.json()),
      fetch("/api/dashboard").then(r => r.json()),
    ]).then(([pData, dData]) => {
      setProps(pData.properties || [])
      setStats(dData.byProperty || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const activePropIds = ["prop_house_sevillana","prop_busto_reform","prop_duplex_center","prop_luxury_busto"]
  const mainProps  = props.filter(p => activePropIds.includes(p.id))
  const sharedProp = props.find(p => p.id === "prop_multi_apartamentos")

  const getStat = (name: string) => stats.find(s => s.name === name)
  const totalRevenue  = stats.filter(s => activePropIds.some(id => props.find(p=>p.id===id)?.name===s.name)).reduce((a, s) => a + (s.amount || 0), 0)
  const totalBookings = stats.filter(s => activePropIds.some(id => props.find(p=>p.id===id)?.name===s.name)).reduce((a, s) => a + (s.count  || 0), 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A2535] tracking-tight">Propiedades</h1>
          <p className="text-sm text-[#9898A8] mt-0.5">Portafolio · {mainProps.length} alojamientos activos · Sevilla</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] px-4 py-2.5 text-center">
            <div className="text-lg font-bold text-[#5A9A12]">{fmtEUR(totalRevenue)}</div>
            <div className="text-[10px] text-[#6B7F96]">ingresos históricos</div>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] px-4 py-2.5 text-center">
            <div className="text-lg font-bold text-[#10b981]">{totalBookings}</div>
            <div className="text-[10px] text-[#6B7F96]">reservas totales</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#6B7F96] text-sm">Cargando propiedades…</div>
      ) : (
        <>
          {/* Main properties grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {mainProps.map(prop => {
              const meta = PROP_META[prop.id] ?? { color: "#94a3b8", emoji: "🏠" }
              const stat = getStat(prop.name)

              return (
                <div key={prop.id} className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] overflow-hidden">
                  <div className="h-1.5" style={{background:`linear-gradient(90deg,${meta.color},${meta.color}88)`}}/>

                  <div className="p-5">
                    {/* Title row */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[6px] flex items-center justify-center text-xl"
                          style={{background:`${meta.color}18`}}>
                          {meta.emoji}
                        </div>
                        <div>
                          <h3 className="font-bold text-[#1A2535] text-sm leading-tight">{prop.name}</h3>
                          <p className="text-xs text-[#9898A8] mt-0.5 max-w-[200px] truncate">{prop.location}</p>
                        </div>
                      </div>
                      {prop.smoobuId ? (
                        <a href={`https://login.smoobu.com/es/cockpit/apartments/overview/${prop.smoobuId}`}
                          target="_blank" rel="noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors hover:text-[#BBFF44] hover:border-[#BBFF44]"
                          style={{borderColor:"#252530",color:"#9898A8"}}>
                          #{prop.smoobuId}
                        </a>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Sin ID Smoobu</span>
                      )}
                    </div>

                    {/* Room badges — from DB */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {prop.bedrooms != null && (
                        <RoomBadge icon="🛏" label={`${prop.bedrooms} hab.`} />
                      )}
                      {prop.beds != null && prop.beds !== prop.bedrooms && (
                        <RoomBadge icon="🛋" label={`${prop.beds} camas`} />
                      )}
                      {prop.bathrooms != null && (
                        <RoomBadge icon="🚿" label={`${prop.bathrooms} baño${prop.bathrooms > 1 ? "s" : ""}`} />
                      )}
                      {prop.maxGuests != null && (
                        <RoomBadge icon="👥" label={`máx. ${prop.maxGuests} pers.`} />
                      )}
                      {prop.id === "prop_house_sevillana" && (
                        <RoomBadge icon="🅿️" label="Parking" />
                      )}
                    </div>

                    {/* Financial stats */}
                    {stat ? (
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#E8EDF3]">
                        <div>
                          <div className="text-xs text-[#9898A8] mb-0.5">Ingresos históricos</div>
                          <div className="text-base font-bold" style={{color:meta.color}}>{fmtEUR(stat.amount)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#9898A8] mb-0.5">Reservas totales</div>
                          <div className="text-base font-bold text-[#1A2535]">{stat.count}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#9898A8] mb-0.5">ADR medio</div>
                          <div className="text-sm font-semibold text-[#1A2535]">
                            {stat.count > 0 ? fmtEUR(stat.amount / stat.count) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-[#9898A8] mb-0.5">% del portfolio</div>
                          <div className="text-sm font-semibold text-[#1A2535]">
                            {totalRevenue > 0 ? `${Math.round((stat.amount / totalRevenue) * 100)}%` : "—"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-[#E8EDF3] text-xs text-[#6B7F96]">Sin datos de ingresos</div>
                    )}

                    {/* Revenue bar */}
                    {stat && totalRevenue > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full bg-[#F4F6F9] overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{width:`${Math.round((stat.amount/totalRevenue)*100)}%`,background:meta.color}}/>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Shared expenses row */}
          {sharedProp && (
            <div className="bg-[#FFFFFF] rounded-[6px] border border-[#E8EDF3] p-4 flex items-center gap-4">
              <div className="w-8 h-8 rounded-[4px] flex items-center justify-center text-lg bg-[#F4F6F9]">🔗</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#1A2535]">{sharedProp.name}</div>
                <div className="text-xs text-[#9898A8]">{sharedProp.location}</div>
              </div>
              <span className="text-xs text-[#6B7F96]">Gastos comunes · no genera ingresos</span>
            </div>
          )}

          {/* Smoobu status */}
          <div className="mt-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[6px] p-4 flex items-start gap-3">
            <span className="text-lg">✅</span>
            <div>
              <div className="text-sm font-semibold text-[#166534]">smoobuId mapeado en 4 propiedades</div>
              <div className="text-xs text-[#16a34a] mt-0.5">
                House Sevillana #352007 · Busto Reform #352418 · Duplex Center #352928 · Luxury Busto #352943
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
