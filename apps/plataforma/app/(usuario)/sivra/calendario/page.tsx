'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { PROPS_CALENDARIO as PROPS } from '@/lib/sivra/constantes'
import { PORTAL_COLORS } from '@/lib/portales'
import { eur } from '@/lib/dinero'

const DAY_W = 46     // px per day column
const ROW_H = 52     // px per property row
const LABEL_W = 130  // px for left label column
const DAYS  = 30     // days visible in timeline

type Income = {
  id: string; propertyId: string; guestName: string | null
  checkIn: string; checkOut: string; portal: string | null; amount: number; nights: number | null
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function shortDay(d: Date) { return ['D','L','M','X','J','V','S'][d.getDay()] }
function fmtEur(n: number) { return eur(n) }
function fmt(d: string) { const [, m, day] = d.split('-'); return `${day}/${m}` }

export default function CalendarioPage() {
  const now = new Date(); now.setHours(0,0,0,0)
  const [incomes, setIncomes]   = useState<Income[]>([])
  const [loading, setLoading]   = useState(true)
  const [winStart, setWinStart] = useState<Date>(now)
  const [selected, setSelected] = useState<Income | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/sivra/incomes')
      .then(r => r.json())
      .then(d => { setIncomes(d.incomes ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const winDays = useMemo(() => {
    return Array.from({ length: DAYS }, (_, i) => addDays(winStart, i))
  }, [winStart])

  // Occupancy stats (30 days from today)
  const stats = useMemo(() => {
    return PROPS.map(p => {
      const occupied = Array.from({ length: 30 }, (_, i) => isoDate(addDays(now, i)))
        .filter(d => incomes.some(inc =>
          inc.propertyId === p.id && inc.checkIn <= d && inc.checkOut > d
        )).length
      return { ...p, pct: Math.round((occupied / 30) * 100) }
    })
  }, [incomes])

  // Cleaning days: checkout + checkin same day, same property
  const cleaningDays = useMemo(() => {
    const days = new Set<string>()
    winDays.forEach(d => {
      const ds = isoDate(d)
      PROPS.forEach(p => {
        const hasCheckout = incomes.some(i => i.propertyId === p.id && i.checkOut === ds)
        const hasCheckin  = incomes.some(i => i.propertyId === p.id && i.checkIn === ds)
        if (hasCheckout && hasCheckin) days.add(`${ds}:${p.id}`)
      })
    })
    return days
  }, [incomes, winDays])

  // Gap days: 1-2 free days between reservations
  const gapDays = useMemo(() => {
    const gaps = new Set<string>()
    PROPS.forEach(p => {
      const sorted = incomes
        .filter(i => i.propertyId === p.id)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      for (let i = 0; i < sorted.length - 1; i++) {
        const endPrev  = new Date(sorted[i].checkOut)
        const startNext = new Date(sorted[i + 1].checkIn)
        const gap = daysBetween(endPrev, startNext)
        if (gap >= 1 && gap <= 2) {
          for (let g = 0; g < gap; g++) {
            gaps.add(`${isoDate(addDays(endPrev, g))}:${p.id}`)
          }
        }
      }
    })
    return gaps
  }, [incomes])

  function getReservationsForProp(propId: string) {
    const winEnd = isoDate(addDays(winStart, DAYS))
    const winStartStr = isoDate(winStart)
    return incomes.filter(i =>
      i.propertyId === propId && i.checkOut > winStartStr && i.checkIn < winEnd
    )
  }

  function getBarGeometry(inc: Income) {
    const ciDate = new Date(inc.checkIn)
    const coDate = new Date(inc.checkOut)
    const startOff = Math.max(0, daysBetween(winStart, ciDate))
    const endOff   = Math.min(DAYS, daysBetween(winStart, coDate))
    return { left: startOff * DAY_W, width: (endOff - startOff) * DAY_W }
  }

  const todayStr = isoDate(now)

  return (
    <div style={{ padding: '24px 20px', maxWidth: '100%' }}>
      {/* Header */}
      <div className="cal-header" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Calendario de ocupación</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {PROPS.length} propiedades · datos Smoobu · {DAYS} días
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setWinStart(d => addDays(d, -DAYS))} style={btnStyle}>‹ Anterior</button>
          <button onClick={() => setWinStart(now)} style={{ ...btnStyle, padding: '0 14px', fontWeight: 600 }}>Hoy</button>
          <button onClick={() => setWinStart(d => addDays(d, DAYS))} style={btnStyle}>Siguiente ›</button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="cal-stats-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {stats.map(p => (
          <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 150 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{p.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(0,0,0,.08)', maxWidth: 60 }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${p.pct}%`, background: p.color }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: p.color }}>{p.pct}%</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>/30d</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div className="cal-legend" style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { color: '#FF5A5F', label: 'Airbnb' },
          { color: '#003580', label: 'Booking' },
          { color: '#1D3C6E', label: 'VRBO' },
          { color: '#7c3aed', label: 'Directo' },
          { color: '#6B7F96', label: 'Otros' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: 4 }}>🧹 = turno limpieza urgente</span>
        <span style={{ color: 'var(--negative)' }}>■ = gap 1-2 días (difícil vender)</span>
      </div>

      {/* Gantt timeline */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        {/* Scrollable wrapper */}
        <div ref={scrollRef} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: LABEL_W + DAYS * DAY_W }}>

            {/* Day header row */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.02)', position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Label spacer */}
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                Propiedad
              </div>
              {/* Day columns */}
              {winDays.map((d, i) => {
                const ds = isoDate(d)
                const isToday = ds === todayStr
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div key={i} style={{
                    width: DAY_W, flexShrink: 0, textAlign: 'center', padding: '4px 2px',
                    borderRight: i < DAYS - 1 ? '1px solid var(--border)' : 'none',
                    background: isToday ? 'var(--primary-light)' : isWeekend ? 'rgba(0,0,0,.02)' : 'transparent',
                  }}>
                    <div style={{ fontSize: 9, color: isToday ? 'var(--primary)' : 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{shortDay(d)}</div>
                    <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--primary)' : 'var(--text)' }}>{d.getDate()}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)' }}>{d.getMonth() + 1 !== winStart.getMonth() + 1 ? `${d.toLocaleString('es-ES', { month: 'short' })}` : ''}</div>
                  </div>
                )
              })}
            </div>

            {/* Property rows */}
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando reservas…</div>
            ) : PROPS.map((prop, pi) => {
              const reservations = getReservationsForProp(prop.id)
              return (
                <div key={prop.id} style={{ display: 'flex', borderBottom: pi < PROPS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Property label */}
                  <div style={{
                    width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
                    height: ROW_H, background: 'rgba(0,0,0,.01)',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: prop.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{prop.label}</span>
                  </div>

                  {/* Timeline cells */}
                  <div style={{ position: 'relative', width: DAYS * DAY_W, height: ROW_H }}>
                    {/* Background day cells */}
                    {winDays.map((d, i) => {
                      const ds = isoDate(d)
                      const isToday = ds === todayStr
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      const isGap = gapDays.has(`${ds}:${prop.id}`)
                      const isCleaning = cleaningDays.has(`${ds}:${prop.id}`)
                      return (
                        <div key={i} style={{
                          position: 'absolute', left: i * DAY_W, top: 0, width: DAY_W, height: ROW_H,
                          borderRight: '1px solid var(--border)',
                          background: isGap ? 'rgba(239,68,68,.08)' : isToday ? 'rgba(99,102,241,.05)' : isWeekend ? 'rgba(0,0,0,.015)' : 'transparent',
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2,
                        }}>
                          {isCleaning && <span style={{ fontSize: 10 }}>🧹</span>}
                        </div>
                      )
                    })}

                    {/* Reservation bars */}
                    {reservations.map((inc) => {
                      const { left, width } = getBarGeometry(inc)
                      if (width <= 0) return null
                      const nights = inc.nights || Math.max(1, daysBetween(new Date(inc.checkIn), new Date(inc.checkOut)))
                      const adr = nights > 0 ? Math.round(inc.amount / nights) : 0
                      const portalColor = PORTAL_COLORS[inc.portal || ''] || '#6B7F96'
                      const isSelected = selected?.id === inc.id
                      return (
                        <div
                          key={inc.id}
                          onClick={() => setSelected(isSelected ? null : inc)}
                          title={`${inc.guestName || '?'} · ${nights}n · ${eur(inc.amount)}`}
                          style={{
                            position: 'absolute',
                            left: left + 2,
                            top: 10,
                            width: Math.max(width - 4, 4),
                            height: ROW_H - 20,
                            borderRadius: 6,
                            background: portalColor,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                            paddingLeft: width > 60 ? 8 : 4,
                            overflow: 'hidden',
                            boxShadow: isSelected ? `0 0 0 2px #fff, 0 0 0 3px ${portalColor}` : '0 1px 3px rgba(0,0,0,.15)',
                            transition: 'box-shadow .15s',
                            zIndex: 2,
                          }}
                        >
                          {width > 30 && (
                            <div style={{ paddingLeft: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width - 24 }}>
                                {inc.guestName?.split(' ')[0] || '?'}
                              </span>
                              {width > 70 && adr > 0 && (
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.8)', whiteSpace: 'nowrap' }}>
                                  {fmtEur(adr)}/n · {nights}n
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Reservation detail panel */}
      {selected && (() => {
        // nights puede venir 0/null en `incomes` (rows antiguas sin backfill); derivarlo de las fechas
        // igual que las barras (línea ~247) y la tabla (~369) para no mostrar "?" ni un ADR = total.
        const selNights = selected.nights || Math.max(1, daysBetween(new Date(selected.checkIn), new Date(selected.checkOut)))
        return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div className="cal-detail" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Huésped</div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{selected.guestName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Propiedad</div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{PROPS.find(p => p.id === selected.propertyId)?.label || selected.propertyId}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Entrada / Salida</div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{fmt(selected.checkIn)} → {fmt(selected.checkOut)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Noches</div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{selNights}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Total / ADR</div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                {fmtEur(selected.amount)} · {fmtEur(selected.amount / selNights)}/n
              </div>
            </div>
            {selected.portal && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Portal</div>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: PORTAL_COLORS[selected.portal] || 'var(--primary)', color: '#fff' }}>
                  {selected.portal}
                </span>
              </div>
            )}
          </div>
          <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', lineHeight: 1, padding: 4 }}>×</button>
        </div>
        )
      })()}

      {/* Próximas llegadas */}
      <UpcomingArrivals incomes={incomes} now={now} />
    </div>
  )
}

function UpcomingArrivals({ incomes, now }: { incomes: Income[]; now: Date }) {
  const todayStr = isoDate(now)
  const limitStr = isoDate(addDays(now, 14))
  const upcoming = incomes
    .filter(i => i.checkIn >= todayStr && i.checkIn <= limitStr)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 10)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Próximas llegadas · 14 días</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{upcoming.length} reservas</span>
      </div>
      {upcoming.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Sin llegadas en 14 días</div>
      ) : (
        <div className="cal-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Entrada', 'Propiedad', 'Huésped', 'Portal', 'Noches', 'Total', 'ADR'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcoming.map((inc, i) => {
                const nights = inc.nights ?? Math.round((new Date(inc.checkOut).getTime() - new Date(inc.checkIn).getTime()) / 86400000)
                const isToday    = inc.checkIn === todayStr
                const isTomorrow = inc.checkIn === isoDate(addDays(now, 1))
                const prop = PROPS.find(p => p.id === inc.propertyId)
                return (
                  <tr key={inc.id || i} style={{ borderBottom: '1px solid var(--border)', background: isToday ? 'var(--primary-light)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{fmt(inc.checkIn)}</span>
                        {isToday && <span style={{ padding: '1px 6px', borderRadius: 20, background: 'var(--primary)', color: '#fff', fontSize: 9, fontWeight: 700 }}>HOY</span>}
                        {isTomorrow && <span style={{ padding: '1px 6px', borderRadius: 20, background: 'var(--warning)', color: '#fff', fontSize: 9, fontWeight: 700 }}>MAÑANA</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>→ {fmt(inc.checkOut)}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: prop?.color || 'var(--muted)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{prop?.label || inc.propertyId}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{inc.guestName || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {inc.portal && (
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: PORTAL_COLORS[inc.portal] || 'var(--primary)', color: '#fff' }}>
                          {inc.portal}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{nights}n</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>{fmtEur(inc.amount)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{fmtEur(Math.round(inc.amount / (nights || 1)))}/n</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '0 12px', height: 32, borderRadius: 6,
  border: '1px solid var(--border)', fontSize: 12, fontWeight: 500,
  color: 'var(--text)', background: 'var(--surface)', cursor: 'pointer', whiteSpace: 'nowrap',
}
