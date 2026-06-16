'use client'
import { useState, useEffect, useMemo } from 'react'

const PROPS = [
  { id: 'prop_house_sevillana', label: 'House Sevillana', color: '#84cc16', short: 'HS' },
  { id: 'prop_busto_reform',    label: 'Busto Reform',    color: '#f59e0b', short: 'BR' },
  { id: 'prop_duplex_center',   label: 'Duplex Center',   color: '#10b981', short: 'DC' },
  { id: 'prop_luxury_busto',    label: 'Luxury Busto',    color: '#ef4444', short: 'LB' },
]

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS   = ['L','M','X','J','V','S','D']

type Income = {
  id: string; propertyId: string; guestName: string | null
  checkIn: string; checkOut: string; portal: string | null; amount: number; nights: number | null
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d }

function getOccupiedDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = []
  const cur = new Date(checkIn)
  const end = new Date(checkOut)
  while (cur < end) { dates.push(isoDate(cur)); cur.setDate(cur.getDate() + 1) }
  return dates
}

function propColor(propId: string) { return PROPS.find(p => p.id === propId)?.color ?? '#94a3b8' }
function propShort(propId: string) { return PROPS.find(p => p.id === propId)?.short ?? '?' }
function propLabel(propId: string) { return PROPS.find(p => p.id === propId)?.label ?? propId }

function fmt(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

export default function CalendarioPage() {
  const now = new Date()
  const [incomes, setIncomes]     = useState<Income[]>([])
  const [loading, setLoading]     = useState(true)
  const [baseYear, setBaseYear]   = useState(now.getFullYear())
  const [baseMonth, setBaseMonth] = useState(now.getMonth())
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sivra/incomes')
      .then(r => r.json())
      .then(d => { setIncomes(d.incomes ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const occMap = useMemo(() => {
    const map: Record<string, { propId: string; income: Income }[]> = {}
    incomes.forEach(inc => {
      if (!inc.checkIn || !inc.checkOut) return
      getOccupiedDates(inc.checkIn, inc.checkOut).forEach(d => {
        if (!map[d]) map[d] = []
        map[d].push({ propId: inc.propertyId, income: inc })
      })
    })
    return map
  }, [incomes])

  const months = [0, 1, 2].map(offset => {
    const m = (baseMonth + offset) % 12
    const y = baseYear + Math.floor((baseMonth + offset) / 12)
    return { year: y, month: m }
  })

  const stats = useMemo(() => {
    return PROPS.map(p => {
      const count = Array.from({ length: 30 }, (_, i) => isoDate(addDays(now, i)))
        .filter(d => occMap[d]?.some(o => o.propId === p.id)).length
      return { ...p, days: count, pct: Math.round((count / 30) * 100) }
    })
  }, [occMap])

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

  return (
    <div style={{ padding: '24px', maxWidth: '80rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>Calendario de ocupación</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>Vista unificada · {PROPS.length} propiedades · datos Smoobu</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={prevMonths} style={btnStyle}>‹</button>
          <button onClick={() => { setBaseYear(now.getFullYear()); setBaseMonth(now.getMonth()) }} style={{ ...btnStyle, padding: '0 12px', fontSize: '12px' }}>Hoy</button>
          <button onClick={nextMonths} style={btnStyle}>›</button>
        </div>
      </div>

      {/* Leyenda + stats ocupación 30 días */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {stats.map(p => (
          <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '160px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg)', maxWidth: '64px' }}>
                  <div style={{ height: '100%', borderRadius: '2px', width: `${p.pct}%`, background: p.color, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: p.color }}>{p.pct}%</span>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>/30d</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Calendarios 3 meses */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '192px', color: 'var(--muted)', fontSize: '14px' }}>Cargando reservas…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {months.map(({ year, month }) => {
            const daysInMonth = new Date(year, month + 1, 0).getDate()
            const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1 })()
            const todayStr = isoDate(now)

            return (
              <div key={`${year}-${month}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{MONTHS[month]} {year}</span>
                </div>
                {/* Cabecera días */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px 12px 0' }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '9px', fontWeight: 600, color: 'var(--muted)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.04em' }}>{d}</div>
                  ))}
                </div>
                {/* Grid días */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px 12px', gap: '1px' }}>
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const occ = occMap[dateStr] || []
                    const propIds = [...new Set(occ.map(o => o.propId))]
                    const isToday = dateStr === todayStr
                    const isPast  = dateStr < todayStr
                    const isHover = hoverDate === dateStr

                    return (
                      <div key={day}
                        style={{
                          position: 'relative', borderRadius: '6px', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', padding: '4px 1px', cursor: 'default',
                          background: isHover && propIds.length > 0 ? 'var(--primary-light)' : 'transparent',
                          opacity: isPast ? 0.45 : 1,
                        }}
                        onMouseEnter={() => setHoverDate(dateStr)}
                        onMouseLeave={() => setHoverDate(null)}
                      >
                        <span style={{
                          fontSize: '10px', lineHeight: 1, marginBottom: '2px',
                          fontWeight: isToday ? 800 : propIds.length > 0 ? 600 : 400,
                          color: isToday ? 'var(--primary)' : 'var(--text)',
                        }}>{day}</span>
                        {propIds.length > 0 && (
                          <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '22px' }}>
                            {propIds.slice(0, 3).map(pid => (
                              <div key={pid} style={{ width: '5px', height: '5px', borderRadius: '50%', background: propColor(pid) }} />
                            ))}
                            {propIds.length > 3 && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#94a3b8' }} />}
                          </div>
                        )}
                        {isHover && propIds.length > 0 && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                            marginBottom: '4px', zIndex: 20, background: '#09090b', color: '#fff',
                            fontSize: '9px', borderRadius: '6px', padding: '4px 8px', whiteSpace: 'nowrap', pointerEvents: 'none',
                          }}>
                            {occ.slice(0, 3).map((o, idx) => (
                              <div key={idx}>{propShort(o.propId)} · {o.income.guestName?.split(' ')[0] || '?'}</div>
                            ))}
                            {occ.length > 3 && <div>+{occ.length - 3} más</div>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Footer ocupación del mes */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
                  {(() => {
                    const daysInM = new Date(year, month + 1, 0).getDate()
                    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
                    const occupiedDays = new Set(Object.keys(occMap).filter(d => d.startsWith(prefix))).size
                    const pct = Math.round((occupiedDays / daysInM) * 100)
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg)' }}>
                          <div style={{ height: '100%', borderRadius: '2px', background: 'var(--primary)', width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>{pct}% ocupación</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Próximas llegadas 14 días */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Próximas llegadas · 14 días</h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{upcoming.length} reservas</span>
        </div>
        {upcoming.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '14px', color: 'var(--muted)' }}>
            {loading ? 'Cargando…' : 'No hay llegadas en los próximos 14 días'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Entrada', 'Propiedad', 'Huésped', 'Portal', 'Noches', 'Importe'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcoming.map((inc, i) => {
                  const nights = inc.nights ?? (inc.checkOut
                    ? Math.round((new Date(inc.checkOut).getTime() - new Date(inc.checkIn).getTime()) / 86400000)
                    : 1)
                  const isToday    = inc.checkIn === isoDate(now)
                  const isTomorrow = inc.checkIn === isoDate(addDays(now, 1))

                  return (
                    <tr key={inc.id || i} style={{ borderBottom: '1px solid var(--bg)', background: isToday ? 'var(--primary-light)' : 'transparent' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{fmt(inc.checkIn)}</span>
                          {isToday && <span style={{ padding: '1px 6px', borderRadius: '20px', background: 'var(--primary)', color: '#fff', fontSize: '9px', fontWeight: 700 }}>HOY</span>}
                          {isTomorrow && <span style={{ padding: '1px 6px', borderRadius: '20px', background: '#f59e0b', color: '#fff', fontSize: '9px', fontWeight: 700 }}>MAÑANA</span>}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>hasta {inc.checkOut ? fmt(inc.checkOut) : '?'}</div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: propColor(inc.propertyId), flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{propLabel(inc.propertyId)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)' }}>{inc.guestName || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ padding: '10px 16px' }}>
                        {inc.portal && (
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                            background: inc.portal === 'AIRBNB' ? '#FF5A5F' : inc.portal === 'BOOKING' ? '#003580' : 'var(--primary)',
                            color: '#fff',
                          }}>{inc.portal}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--muted)' }}>{nights}n</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text)' }}>
                        {inc.amount ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(inc.amount) : '—'}
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

const btnStyle: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '6px',
  border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '18px', color: 'var(--muted)', background: 'var(--surface)', cursor: 'pointer',
}
