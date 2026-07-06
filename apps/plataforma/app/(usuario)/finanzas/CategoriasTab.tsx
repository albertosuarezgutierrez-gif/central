'use client'
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis } from 'recharts'
import type { MerchantRow } from '@/lib/finanzas'
import {
  EMOJI, labelCat, esIngreso,
  SUBCATEGORIAS_GASTO, SUBCATEGORIAS_INGRESO,
} from '@/lib/categorias-personales'

type CategoriaRow = { subcategoria: string; total: number; count: number }
type Alerta = { id: string; categoria: string; limite_mensual: number; activa: boolean }
type PeriodMode = 'fiscal_year' | 'rolling_12'
type MerchantState = { loading: boolean; data: MerchantRow[] | null }
type Insight = { tipo: 'ahorro' | 'alerta' | 'tendencia'; texto: string }
type MovRow = { id: string; fecha: string; concepto: string | null; importe: number; subcategoria: string | null }
type MovState = { loading: boolean; data: MovRow[] | null }

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']

const INSIGHT_ICON: Record<string, string> = { ahorro: '💰', alerta: '⚠️', tendencia: '📈' }
const INSIGHT_COLOR: Record<string, string> = { ahorro: '#10b981', alerta: '#f59e0b', tendencia: '#6366f1' }

// Opciones de los desplegables para reasignar. Los gastos usan la lista de gasto; para alertas y
// para el desplegable "todas" se ofrece gasto + ingreso.
const TODAS_CATEGORIAS = [...SUBCATEGORIAS_GASTO, ...SUBCATEGORIAS_INGRESO]

export default function CategoriasTab({ year, month }: { year: number; month: number }) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('fiscal_year')
  const [categorias, setCategorias] = useState<CategoriaRow[]>([])
  const [sinCategoria, setSinCategoria] = useState(0)
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [nuevaAlerta, setNuevaAlerta] = useState({ categoria: '', limite_mensual: 0 })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<Record<string, MerchantState>>({})
  const [autoTagging, setAutoTagging] = useState(false)
  const [autoTagMsg, setAutoTagMsg] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  // Movimientos sueltos por comercio (drill-down de 2º nivel) y panel de "sin categoría".
  const [comercioAbierto, setComercioAbierto] = useState<string | null>(null)
  const [movsComercio, setMovsComercio] = useState<Record<string, MovState>>({})
  const [sinPanel, setSinPanel] = useState<{ open: boolean } & MovState>({ open: false, loading: false, data: null })
  const [saving, setSaving] = useState(false)

  const rollingQS = periodMode === 'rolling_12' ? '&rolling=1' : ''
  const mode = periodMode === 'rolling_12' ? 'rolling_12' : 'fiscal_year'

  useEffect(() => {
    setLoading(true)
    setMerchants({})
    setMovsComercio({})
    setComercioAbierto(null)
    setSinPanel({ open: false, loading: false, data: null })
    // Cada fetch con su propio catch → Promise.all NUNCA rechaza, así `loading` siempre se apaga
    // (antes, un 500 en cualquiera de las dos dejaba la pestaña en "Cargando categorías…" para siempre).
    Promise.all([
      fetch(`/api/finanzas/categorias?year=${year}&month=${month}${rollingQS}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/alertas-categoria').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([data, al]) => {
      const cats = Array.isArray(data) ? data : (data?.categorias ?? [])
      setCategorias(cats)
      setSinCategoria(data?.sinCategoria ?? 0)
      setAlertas(Array.isArray(al) ? al : [])
      setLoading(false)
    })
  }, [year, month, periodMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch merchants del expandido cuando cambia el período
  useEffect(() => {
    if (expanded && merchants[expanded]?.data) fetchMerchants(expanded, true)
  }, [periodMode, year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reloadCategorias() {
    const data = await fetch(`/api/finanzas/categorias?year=${year}&month=${month}${rollingQS}`).then(r => r.json())
    const cats = Array.isArray(data) ? data : (data?.categorias ?? [])
    setCategorias(cats)
    setSinCategoria(data?.sinCategoria ?? 0)
  }

  async function fetchMerchants(cat: string, force = false) {
    if (!force && merchants[cat]?.data) return
    setMerchants(prev => ({ ...prev, [cat]: { loading: true, data: null } }))
    const res = await fetch(`/api/finanzas/categorias/comerciantes?categoria=${cat}&mode=${mode}&year=${year}&month=${month}`)
    const json = await res.json()
    setMerchants(prev => ({ ...prev, [cat]: { loading: false, data: json.comerciantes ?? [] } }))
  }

  function toggleExpanded(cat: string) {
    if (expanded === cat) {
      setExpanded(null)
    } else {
      setExpanded(cat)
      setComercioAbierto(null)
      fetchMerchants(cat)
    }
  }

  async function fetchMovsComercio(comerciante: string, force = false) {
    if (!force && movsComercio[comerciante]?.data) return
    setMovsComercio(prev => ({ ...prev, [comerciante]: { loading: true, data: null } }))
    const res = await fetch(`/api/finanzas/categorias/movimientos?comerciante=${encodeURIComponent(comerciante)}&mode=${mode}&year=${year}&month=${month}`)
    const json = await res.json()
    setMovsComercio(prev => ({ ...prev, [comerciante]: { loading: false, data: json.movimientos ?? [] } }))
  }

  function toggleComercio(comerciante: string) {
    if (comercioAbierto === comerciante) { setComercioAbierto(null); return }
    setComercioAbierto(comerciante)
    fetchMovsComercio(comerciante)
  }

  async function toggleSinPanel() {
    if (sinPanel.open) { setSinPanel(p => ({ ...p, open: false })); return }
    setSinPanel({ open: true, loading: true, data: null })
    const res = await fetch(`/api/finanzas/categorias/movimientos?sin=1&mode=${mode}&year=${year}&month=${month}`)
    const json = await res.json()
    setSinPanel({ open: true, loading: false, data: json.movimientos ?? [] })
  }

  // Reasigna la categoría de TODO un comercio (aprende regla) o de un movimiento suelto.
  async function reasignar(body: { subcategoria: string; comerciante?: string; movId?: string }) {
    setSaving(true)
    try {
      await fetch('/api/finanzas/categorias/asignar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      await reloadCategorias()
      if (expanded) await fetchMerchants(expanded, true)
      if (comercioAbierto) await fetchMovsComercio(comercioAbierto, true)
      if (sinPanel.open) {
        const res = await fetch(`/api/finanzas/categorias/movimientos?sin=1&mode=${mode}&year=${year}&month=${month}`)
        const json = await res.json()
        setSinPanel({ open: true, loading: false, data: json.movimientos ?? [] })
      }
    } finally {
      setSaving(false)
    }
  }

  async function autoTag() {
    setAutoTagging(true)
    setAutoTagMsg(null)
    try {
      const res = await fetch('/api/finanzas/categorias/auto-tag', { method: 'POST' })
      const json = await res.json()
      setAutoTagMsg(`✅ ${json.tagged ?? 0} gastos categorizados automáticamente`)
      await reloadCategorias()
      if (expanded) await fetchMerchants(expanded, true)
      if (sinPanel.open) {
        const r2 = await fetch(`/api/finanzas/categorias/movimientos?sin=1&mode=${mode}&year=${year}&month=${month}`)
        const j2 = await r2.json()
        setSinPanel({ open: true, loading: false, data: j2.movimientos ?? [] })
      }
    } catch {
      setAutoTagMsg('Error al auto-clasificar')
    }
    setAutoTagging(false)
  }

  async function loadInsights() {
    setInsightsLoading(true)
    setInsights(null)
    try {
      const res = await fetch(`/api/finanzas/categorias/insights?mode=${mode}&year=${year}&month=${month}`)
      const json = await res.json()
      setInsights(Array.isArray(json.insights) ? json.insights : [])
    } catch {
      setInsights([])
    }
    setInsightsLoading(false)
  }

  async function guardarAlerta() {
    if (!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual) return
    await fetch('/api/alertas-categoria', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nuevaAlerta, activa: true }),
    })
    setAlertas(prev => {
      const idx = prev.findIndex(a => a.categoria === nuevaAlerta.categoria)
      const nueva: Alerta = { id: '', ...nuevaAlerta, activa: true }
      return idx >= 0 ? prev.map((a, i) => i === idx ? nueva : a) : [...prev, nueva]
    })
    setNuevaAlerta({ categoria: '', limite_mensual: 0 })
  }

  async function toggleAlerta(categoria: string, activa: boolean) {
    const al = alertas.find(a => a.categoria === categoria)
    if (!al) return
    await fetch('/api/alertas-categoria', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, limite_mensual: al.limite_mensual, activa }),
    })
    setAlertas(prev => prev.map(a => a.categoria === categoria ? { ...a, activa } : a))
  }

  async function eliminarAlerta(categoria: string) {
    await fetch('/api/alertas-categoria', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria }),
    })
    setAlertas(prev => prev.filter(a => a.categoria !== categoria))
  }

  // Desplegable de categoría reutilizable (para comercio y para movimiento suelto).
  function CatSelect({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
    const conocida = (SUBCATEGORIAS_GASTO as readonly string[]).includes(value)
    return (
      <select
        title={title}
        value={conocida ? value : ''}
        disabled={saving}
        onClick={e => e.stopPropagation()}
        onChange={e => { const v = e.target.value; if (v && v !== value) onChange(v) }}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
          padding: '4px 8px', fontSize: '12px', color: 'var(--text)', cursor: saving ? 'wait' : 'pointer', maxWidth: '160px',
        }}
      >
        {!conocida && <option value="">Sin categoría…</option>}
        {SUBCATEGORIAS_GASTO.map(c => (
          <option key={c} value={c}>{EMOJI[c] ?? '•'} {labelCat(c)}</option>
        ))}
      </select>
    )
  }

  // Lista de movimientos sueltos con desplegable por fila (comercio o "sin categoría").
  function MovList({ state }: { state: MovState }) {
    if (state.loading) return <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0' }}>Cargando movimientos…</p>
    if (!state.data || state.data.length === 0) return <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0' }}>Sin movimientos.</p>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
        {state.data.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
            <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{m.fecha}</span>
            <span style={{ flex: 1, minWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(m.concepto || '—').slice(0, 60)}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 500 }}>€{Math.abs(m.importe).toFixed(2)}</span>
            <CatSelect value={m.subcategoria ?? ''} onChange={v => reasignar({ movId: m.id, subcategoria: v })} title="Cambiar categoría de este movimiento" />
          </div>
        ))}
      </div>
    )
  }

  function SinCategoriaPanel() {
    if (sinCategoria === 0) return null
    return (
      <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <button onClick={toggleSinPanel} style={{ ...btnStyle, fontWeight: 600 }}>
            {sinPanel.open ? '▲' : '▼'} {sinCategoria} sin categoría
          </button>
          <button onClick={autoTag} disabled={autoTagging} style={btnStyle}>
            {autoTagging ? 'Clasificando…' : '🤖 Auto-clasificar'}
          </button>
          {autoTagMsg && <span style={{ fontSize: '12px', color: '#10b981' }}>{autoTagMsg}</span>}
        </div>
        {sinPanel.open && (
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 4px' }}>Asigna cada uno a mano, o usa 🤖 Auto-clasificar.</p>
            <MovList state={sinPanel} />
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p style={{ color: 'var(--muted)', fontSize: '14px', padding: '16px' }}>Cargando categorías...</p>

  if (!categorias.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
      <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Sin movimientos categorizados en este periodo.</p>
      <SinCategoriaPanel />
    </div>
  )

  const gastosData = categorias.filter(c => !esIngreso(c.subcategoria))
  const ingresosData = categorias.filter(c => esIngreso(c.subcategoria))
  const totalGastos = gastosData.reduce((s, c) => s + c.total, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* Toggle período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Período:</span>
        {(['fiscal_year', 'rolling_12'] as PeriodMode[]).map(m => (
          <button
            key={m}
            onClick={() => setPeriodMode(m)}
            style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
              background: periodMode === m ? 'var(--primary)' : 'var(--surface)',
              color: periodMode === m ? '#fff' : 'var(--text)',
              border: `1px solid ${periodMode === m ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {m === 'fiscal_year' ? `Año fiscal ${year}` : 'Últimos 12 meses'}
          </button>
        ))}
      </div>

      {/* Sin categoría (ver + clasificar a mano o auto) */}
      <SinCategoriaPanel />

      {/* Panel insights IA */}
      <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <button
          onClick={() => { setInsightsOpen(o => !o); if (!insightsOpen && !insights) loadInsights() }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600, color: 'var(--text)',
          }}
        >
          <span>✨ Análisis IA</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{insightsOpen ? '▲' : '▼'}</span>
        </button>
        {insightsOpen && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {insightsLoading && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Analizando tus hábitos de gasto…</p>}
            {!insightsLoading && insights === null && (
              <button onClick={loadInsights} style={btnStyle}>Analizar ahora</button>
            )}
            {!insightsLoading && insights !== null && insights.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No hay suficientes datos para generar insights.</p>
            )}
            {insights?.map((ins, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                padding: '8px 12px', borderRadius: '6px',
                background: `${INSIGHT_COLOR[ins.tipo]}22`,
                borderLeft: `3px solid ${INSIGHT_COLOR[ins.tipo]}`,
              }}>
                <span style={{ fontSize: '14px' }}>{INSIGHT_ICON[ins.tipo] ?? '•'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>{ins.texto}</span>
              </div>
            ))}
            {insights !== null && (
              <button onClick={loadInsights} disabled={insightsLoading} style={{ ...btnStyle, alignSelf: 'flex-start' }}>
                🔄 Actualizar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Gráfico dona */}
      {gastosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '12px' }}>Distribución de gastos</h3>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gastosData.map(c => ({ name: c.subcategoria, value: c.total }))}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" nameKey="name"
                >
                  {gastosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} />
                <Legend formatter={(v: string) => `${EMOJI[v] ?? '•'} ${labelCat(v)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla gastos con drill-down */}
      {gastosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
            Gastos por categoría <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '11px' }}>(clic para ver comercios · cambia la categoría con el desplegable)</span>
          </h3>
          <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Movs.</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {gastosData.map((c, i) => {
                  const isExp = expanded === c.subcategoria
                  const ms = merchants[c.subcategoria]
                  const minTicket = ms?.data && ms.data.length > 0
                    ? Math.min(...ms.data.map(m => m.ticket_medio))
                    : null
                  return [
                    <tr
                      key={c.subcategoria}
                      onClick={() => toggleExpanded(c.subcategoria)}
                      style={{
                        borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                        background: isExp ? 'var(--surface)' : (i % 2 === 0 ? 'transparent' : 'var(--surface)'),
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                        <span style={{ marginRight: '6px', fontSize: '11px', color: 'var(--muted)' }}>{isExp ? '▼' : '▶'}</span>
                        {EMOJI[c.subcategoria] ?? '•'} {labelCat(c.subcategoria)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        €{c.total.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                        {totalGastos > 0 ? ((c.total / totalGastos) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>,
                    isExp && (
                      <tr key={`${c.subcategoria}-detail`} style={{ borderTop: '1px solid var(--border)' }}>
                        <td colSpan={4} style={{ padding: '12px', background: 'var(--background, #fafafa)' }}>
                          {ms?.loading && (
                            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Cargando comercios…</p>
                          )}
                          {ms?.data && ms.data.length === 0 && (
                            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Sin datos de comercio para este período.</p>
                          )}
                          {ms?.data && ms.data.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                              {ms.data.map((m) => {
                                const abierto = comercioAbierto === m.comerciante
                                return (
                                  <div key={m.comerciante} style={{
                                    flex: '1 1 300px', minWidth: '280px', maxWidth: '440px',
                                    border: '1px solid var(--border)', borderRadius: '8px',
                                    padding: '10px 12px', background: 'var(--surface)',
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                      <div style={{ fontWeight: 600, fontSize: '13px', flex: 1, marginRight: '8px' }}>
                                        {m.comerciante}
                                        {minTicket !== null && m.ticket_medio === minTicket && ms.data!.length > 1 && (
                                          <span style={{
                                            marginLeft: '6px', fontSize: '10px', fontWeight: 600,
                                            background: '#d1fae5', color: '#065f46',
                                            padding: '1px 5px', borderRadius: '4px',
                                          }}>💰 Más barato</span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        €{m.total.toFixed(0)}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
                                      {m.count} ops · ticket medio €{m.ticket_medio.toFixed(1)}
                                    </div>
                                    {m.porMes.length > 0 && (
                                      <div style={{ height: '70px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                          <BarChart data={m.porMes} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                            <Bar dataKey="total" fill="#6366f1" radius={[2,2,0,0]} />
                                            <XAxis dataKey="mes" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)} />
                                          </BarChart>
                                        </ResponsiveContainer>
                                      </div>
                                    )}
                                    {/* Acciones: reasignar todo el comercio + ver movimientos sueltos */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Mover a:</span>
                                      <CatSelect value={c.subcategoria} onChange={v => reasignar({ comerciante: m.comerciante, subcategoria: v })} title="Reasigna todos los movimientos de este comercio y aprende la regla" />
                                      <button onClick={() => toggleComercio(m.comerciante)} style={{ ...btnStyle, marginLeft: 'auto' }}>
                                        {abierto ? '▲ Ocultar' : '▼ Movimientos'}
                                      </button>
                                    </div>
                                    {abierto && <MovList state={movsComercio[m.comerciante] ?? { loading: true, data: null }} />}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla ingresos */}
      {ingresosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>Ingresos por categoría</h3>
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Movs.</th>
                </tr>
              </thead>
              <tbody>
                {ingresosData.map((c, i) => (
                  <tr key={c.subcategoria} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                      {EMOJI[c.subcategoria] ?? '•'} {labelCat(c.subcategoria)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#10b981' }}>
                      €{c.total.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alertas configurables */}
      <div>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '12px' }}>⚠️ Alertas de gasto mensual</h3>

        {alertas.length > 0 && (
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Límite €/mes</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>Activa</th>
                  <th style={{ padding: '10px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((a, i) => (
                  <tr key={a.categoria} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                    <td style={{ padding: '8px 12px' }}>{EMOJI[a.categoria] ?? '•'} {labelCat(a.categoria)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>€{a.limite_mensual.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={a.activa}
                        onChange={e => toggleAlerta(a.categoria, e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => eliminarAlerta(a.categoria)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select
            value={nuevaAlerta.categoria}
            onChange={e => setNuevaAlerta(p => ({ ...p, categoria: e.target.value }))}
            style={{
              flex: 1, minWidth: '200px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: '6px',
              padding: '8px 12px', fontSize: '13px', color: 'var(--text)',
            }}
          >
            <option value="">Selecciona categoría...</option>
            {TODAS_CATEGORIAS.map(c => (
              <option key={c} value={c}>{EMOJI[c] ?? ''} {labelCat(c)}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Límite €/mes"
            value={nuevaAlerta.limite_mensual || ''}
            onChange={e => setNuevaAlerta(p => ({ ...p, limite_mensual: Number(e.target.value) }))}
            style={{
              width: '140px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: '6px',
              padding: '8px 12px', fontSize: '13px', color: 'var(--text)',
            }}
          />
          <button
            onClick={guardarAlerta}
            disabled={!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual}
            style={{
              padding: '8px 16px', background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '13px',
              cursor: 'pointer', fontWeight: 500,
              opacity: (!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual) ? 0.5 : 1,
            }}
          >
            Añadir alerta
          </button>
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '5px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
  background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  fontWeight: 500,
}
