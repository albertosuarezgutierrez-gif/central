'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { PORTAL_COLORS, PORTAL_LABELS } from '@/lib/portales'
import { eur } from '@/lib/dinero'

// Filas montadas de inicio en la vista lista; el resto sale con «Ver más» (regla global de
// rendimiento: el histórico de reservas crece sin tope y montarlo entero congela la página).
const PAGE = 50

type Income = {
  id: string; propertyId: string; propertyName?: string
  reservationId: string; guestName: string | null
  portal: string; amount: number
  checkIn: string; checkOut: string | null; nights: number; date: string
}

export default function IncomePage() {
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroPortal, setFiltroPortal] = useState('')
  const [filtroPropiedad, setFiltroPropiedad] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [importeMin, setImporteMin] = useState('')
  const [importeMax, setImporteMax] = useState('')
  const [nochesMin, setNochesMin] = useState('')
  const [nochesMax, setNochesMax] = useState('')
  const [orden, setOrden] = useState<'checkIn-desc' | 'checkIn-asc' | 'amount-desc' | 'amount-asc' | 'nights-desc'>('checkIn-desc')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [vistaTabla, setVistaTabla] = useState(false)
  const [añoTabla, setAñoTabla] = useState(new Date().getFullYear())
  const [visibles, setVisibles] = useState(PAGE)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sivra/income')
      if (res.ok) { const d = await res.json(); setIncomes(d.incomes || []) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const propiedades = useMemo(() => [...new Set(incomes.map(i => i.propertyName || i.propertyId))].sort(), [incomes])
  const portales    = useMemo(() => [...new Set(incomes.map(i => i.portal))], [incomes])

  const filtrados = useMemo(() => {
    const desde = fechaDesde ? new Date(fechaDesde).getTime() : null
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59').getTime() : null
    const impMin = importeMin ? parseFloat(importeMin) : null
    const impMax = importeMax ? parseFloat(importeMax) : null
    const nMin = nochesMin ? parseInt(nochesMin) : null
    const nMax = nochesMax ? parseInt(nochesMax) : null
    const q = busqueda.toLowerCase().trim()
    let res = incomes.filter(inc => {
      if (filtroPortal && inc.portal !== filtroPortal) return false
      if (filtroPropiedad && (inc.propertyName || inc.propertyId) !== filtroPropiedad) return false
      if (q && !inc.guestName?.toLowerCase().includes(q) && !inc.reservationId?.toLowerCase().includes(q)) return false
      if (desde !== null && inc.checkIn && new Date(inc.checkIn).getTime() < desde) return false
      if (hasta !== null && inc.checkIn && new Date(inc.checkIn).getTime() > hasta) return false
      if (impMin !== null && inc.amount < impMin) return false
      if (impMax !== null && inc.amount > impMax) return false
      if (nMin !== null && inc.nights < nMin) return false
      if (nMax !== null && inc.nights > nMax) return false
      return true
    })
    res = [...res].sort((a, b) => {
      switch (orden) {
        case 'checkIn-asc': return new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
        case 'amount-desc': return b.amount - a.amount
        case 'amount-asc':  return a.amount - b.amount
        case 'nights-desc': return b.nights - a.nights
        default: return new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()
      }
    })
    return res
  }, [incomes, filtroPortal, filtroPropiedad, busqueda, fechaDesde, fechaHasta, importeMin, importeMax, nochesMin, nochesMax, orden])

  // Al cambiar los filtros/orden se vuelve a la primera página.
  useEffect(() => { setVisibles(PAGE) }, [filtrados])

  const totalBruto  = filtrados /* incomes.amount es NETO de comisión OTA */.reduce((s, i) => s + i.amount, 0)
  const totalNoches = filtrados.reduce((s, i) => s + (i.nights || 0), 0)
  const fmt     = (n: number) => eur(n)
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const porPortal    = filtrados.reduce((acc: Record<string, number>, r) => { acc[r.portal] = (acc[r.portal] || 0) + r.amount; return acc }, {})
  const porPropiedad = filtrados.reduce((acc: Record<string, number>, r) => { const k = r.propertyName || r.propertyId; acc[k] = (acc[k] || 0) + r.amount; return acc }, {})

  const limpiarFiltros = () => {
    setFiltroPortal(''); setFiltroPropiedad(''); setBusqueda('')
    setFechaDesde(''); setFechaHasta(''); setImporteMin(''); setImporteMax('')
    setNochesMin(''); setNochesMax(''); setOrden('checkIn-desc')
  }
  const filtrosActivos = [filtroPortal, filtroPropiedad, busqueda, fechaDesde, fechaHasta, importeMin, importeMax, nochesMin, nochesMax].filter(Boolean).length

  const inp = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'var(--surface)' } as const
  const sel = { ...inp, cursor: 'pointer' } as const

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <div className="income-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Ingresos — Reservas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>Reservas importadas desde Smoobu</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setVistaTabla(false)} style={{ padding: '8px 14px', fontSize: 13, background: !vistaTabla ? 'var(--primary)' : 'var(--surface)', color: !vistaTabla ? '#fff' : 'var(--muted)', border: 'none', cursor: 'pointer', fontWeight: !vistaTabla ? 700 : 400 }}>Lista</button>
            <button onClick={() => setVistaTabla(true)} style={{ padding: '8px 14px', fontSize: 13, background: vistaTabla ? 'var(--primary)' : 'var(--surface)', color: vistaTabla ? '#fff' : 'var(--muted)', border: 'none', cursor: 'pointer', fontWeight: vistaTabla ? 700 : 400 }}>Tabla ×mes</button>
          </div>
          <button onClick={load} disabled={loading} style={{ ...inp, cursor: 'pointer', color: 'var(--muted)' }}>
            {loading ? '...' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {incomes.length > 0 && (
        <>
          <div className="income-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
            {[
              { label: 'Reservas', value: filtrados.length.toString() },
              { label: 'Ingresos netos', value: fmt(totalBruto) },
              { label: 'Media reserva', value: filtrados.length ? fmt(totalBruto / filtrados.length) : '—' },
              { label: 'Total noches', value: totalNoches.toString() },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="income-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {[
              { title: 'Por portal', data: porPortal, label: (k: string) => PORTAL_LABELS[k] || k, color: (k: string) => PORTAL_COLORS[k] || '#71717a' },
              { title: 'Por propiedad', data: porPropiedad, label: (k: string) => k, color: () => 'var(--primary)' },
            ].map(card => (
              <div key={card.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>{card.title}</div>
                {Object.entries(card.data).sort(([, a], [, b]) => (b as number) - (a as number)).map(([k, total]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: card.color(k), flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>{card.label(k)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(total as number)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
        <div className="income-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Buscar huésped o ID..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ ...inp, flex: '1 1 160px', minWidth: 0 }} />
          <select value={filtroPortal} onChange={e => setFiltroPortal(e.target.value)} style={sel}>
            <option value="">Todos portales</option>
            {portales.map(p => <option key={p} value={p}>{PORTAL_LABELS[p] || p}</option>)}
          </select>
          <select value={filtroPropiedad} onChange={e => setFiltroPropiedad(e.target.value)} style={sel}>
            <option value="">Todas propiedades</option>
            {propiedades.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={orden} onChange={e => setOrden(e.target.value as typeof orden)} style={sel}>
            <option value="checkIn-desc">Recientes</option>
            <option value="checkIn-asc">Antiguas</option>
            <option value="amount-desc">Mayor importe</option>
            <option value="amount-asc">Menor importe</option>
            <option value="nights-desc">+ noches</option>
          </select>
          <button onClick={() => setFiltrosAbiertos(!filtrosAbiertos)} style={{ ...inp, cursor: 'pointer', background: filtrosAbiertos ? 'var(--primary)' : 'var(--surface)', color: filtrosAbiertos ? '#fff' : 'var(--muted)', whiteSpace: 'nowrap' }}>
            Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
          </button>
          {filtrosActivos > 0 && (
            <button onClick={limpiarFiltros} style={{ ...inp, cursor: 'pointer', color: 'var(--negative)', border: '1px solid var(--negative-bg)', background: 'transparent', whiteSpace: 'nowrap' }}>Limpiar</button>
          )}
        </div>

        {filtrosAbiertos && (
          <div className="income-adv-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {[
              ['Entrada desde', fechaDesde, setFechaDesde, 'date'],
              ['Entrada hasta', fechaHasta, setFechaHasta, 'date'],
              ['Importe mín.', importeMin, setImporteMin, 'number'],
              ['Importe máx.', importeMax, setImporteMax, 'number'],
              ['Noches mín.', nochesMin, setNochesMin, 'number'],
              ['Noches máx.', nochesMax, setNochesMax, 'number'],
            ].map(([label, val, setter, type]) => (
              <div key={label as string}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>{label as string}</label>
                <input type={type as string} value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                  style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12 }}>
          <strong style={{ color: 'var(--text)' }}>{filtrados.length}</strong> reservas · <strong style={{ color: 'var(--primary)' }}>{fmt(totalBruto)}</strong> · {totalNoches} noches
        </div>
      </div>

      {/* Vista tabla: propiedad × mes */}
      {vistaTabla && (() => {
        const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        const fmtTabla = (n: number) => n > 0 ? eur(n) : '—'
        const añoActual = new Date().getFullYear()
        const incomesFiltradosAño = incomes.filter(i => i.checkIn && new Date(i.checkIn).getFullYear() === añoTabla)
        const propiedadesTabla = [...new Set(incomes.map(i => i.propertyName || i.propertyId))].sort()
        const matriz: Record<string, Record<number, number>> = {}
        for (const p of propiedadesTabla) matriz[p] = {}
        for (const inc of incomesFiltradosAño) {
          const p = inc.propertyName || inc.propertyId
          const m = new Date(inc.checkIn).getMonth()
          matriz[p][m] = (matriz[p][m] ?? 0) + inc.amount
        }
        const totalPorMes = MESES_LABEL.map((_, i) => propiedadesTabla.reduce((s, p) => s + (matriz[p][i] ?? 0), 0))
        const totalAño = totalPorMes.reduce((s, t) => s + t, 0)
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setAñoTabla(a => a - 1)} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)' }}>←</button>
              <span style={{ fontWeight: 700, fontSize: 15, minWidth: 50, textAlign: 'center' }}>{añoTabla}</span>
              <button onClick={() => setAñoTabla(a => a + 1)} disabled={añoTabla >= añoActual} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', opacity: añoTabla >= añoActual ? 0.35 : 1 }}>→</button>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>{incomesFiltradosAño.length} reservas · {fmtTabla(totalAño)}</span>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,.03)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>Propiedad</th>
                    {MESES_LABEL.map(m => (
                      <th key={m} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)', minWidth: 56 }}>{m}</th>
                    ))}
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', borderLeft: '2px solid var(--border)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {propiedadesTabla.map(p => {
                    const totalP = MESES_LABEL.reduce((s, _, i) => s + (matriz[p][i] ?? 0), 0)
                    return (
                      <tr key={p} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{p}</td>
                        {MESES_LABEL.map((_, i) => {
                          const v = matriz[p][i] ?? 0
                          return (
                            <td key={i} style={{ padding: '10px 8px', textAlign: 'right', color: v > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {fmtTabla(v)}
                            </td>
                          )
                        })}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', borderLeft: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmtTabla(totalP)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'rgba(0,0,0,.03)', borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</td>
                    {totalPorMes.map((t, i) => (
                      <td key={i} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: t > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtTabla(t)}</td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: 14, borderLeft: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmtTabla(totalAño)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Vista lista */}
      {!vistaTabla && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', opacity: loading && incomes.length > 0 ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {loading && incomes.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando reservas...</div>
          ) : incomes.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin reservas. La sincronización con Smoobu se ejecuta automáticamente cada día.</div>
            </div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sin resultados para los filtros aplicados.</div>
          ) : (
            <div className="income-table-wrap" style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr>
                    {['ID Reserva', 'Entrada', 'Salida', 'Propiedad', 'Huésped', 'Portal', 'Noches', 'Importe'].map(col => (
                      <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.slice(0, visibles).map((inc, idx) => (
                    <tr key={inc.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'rgba(0,0,0,0.015)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--primary)', fontWeight: 500, whiteSpace: 'nowrap', fontSize: 12 }}>{inc.reservationId}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(inc.checkIn)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(inc.checkOut)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.propertyName || inc.propertyId}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.guestName || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (PORTAL_COLORS[inc.portal] || '#71717a') + '22', color: PORTAL_COLORS[inc.portal] || '#71717a', whiteSpace: 'nowrap' }}>
                          {PORTAL_LABELS[inc.portal] || inc.portal}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>{inc.nights}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--positive)', whiteSpace: 'nowrap' }}>{fmt(inc.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtrados.length > visibles && (
                <button onClick={() => setVisibles(v => v + 100)}
                  style={{ display: 'block', width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Ver más ({filtrados.length - visibles} reservas restantes)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
