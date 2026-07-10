'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts'
import type { MerchantRow } from '@/lib/finanzas'
import {
  EMOJI, labelCat, esIngreso,
  SUBCATEGORIAS_GASTO, SUBCATEGORIAS_INGRESO, GRUPO_VIVIENDA,
} from '@/lib/categorias-personales'
import { eur } from '@/lib/dinero'

type CategoriaRow = { subcategoria: string; total: number; count: number }
type Alerta = { id: string; categoria: string; limite_mensual: number; activa: boolean }
// Presets del filtro de fechas de la pestaña. Por defecto 'mes_actual' (lo que pidió Alberto).
type Preset = 'mes_actual' | 'mes_anterior' | 'anio' | 'custom'
type MerchantState = { loading: boolean; data: MerchantRow[] | null }
type Insight = { tipo: 'ahorro' | 'alerta' | 'tendencia'; texto: string }
type MovRow = { id: string; fecha: string; concepto: string | null; importe: number; subcategoria: string | null; subcategoria_revisar?: boolean }
type MovState = { loading: boolean; data: MovRow[] | null }
type ComparativaTotal = { mesActual: number; mediaPrev: number; deltaPct: number | null }

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']

// Fecha local YYYY-MM-DD (sin toISOString para no desplazar el día por zona horaria).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Rango [primer día, último día] del mes desplazado `offset` respecto al actual (0 = mes en curso).
function rangoMes(offset: number): { desde: string; hasta: string } {
  const now = new Date()
  return {
    desde: ymd(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
    hasta: ymd(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
  }
}

const INSIGHT_ICON: Record<string, string> = { ahorro: '💰', alerta: '⚠️', tendencia: '📈' }
const INSIGHT_COLOR: Record<string, string> = { ahorro: '#10b981', alerta: '#f59e0b', tendencia: '#6366f1' }

// Opciones de los desplegables para reasignar. Los gastos usan la lista de gasto; para alertas y
// para el desplegable "todas" se ofrece gasto + ingreso.
const TODAS_CATEGORIAS = [...SUBCATEGORIAS_GASTO, ...SUBCATEGORIAS_INGRESO]

export default function CategoriasTab({ year, month }: { year: number; month: number }) {
  // Filtro de fechas propio de la pestaña (por defecto: mes en curso). `desde`/`hasta` mandan sobre
  // year/month en las APIs (que los aceptan como override). El selector año/trimestre de arriba sigue
  // rigiendo el resto de pestañas.
  const [preset, setPreset] = useState<Preset>('mes_actual')
  const [rango, setRango] = useState(() => rangoMes(0))
  const { desde, hasta } = rango
  const [categorias, setCategorias] = useState<CategoriaRow[]>([])
  // Comparativa (C): deltaPct del mes actual vs media de 6 meses, por subcategoría. Solo se muestra
  // en el preset "Mes actual".
  const [comparativa, setComparativa] = useState<Record<string, number | null>>({})
  const [comparativaTotal, setComparativaTotal] = useState<ComparativaTotal | null>(null)
  // Cola ÚNICA "Necesitan tu atención": sin clasificar + dudosos (fusiona los 3 paneles antiguos).
  const [atencionState, setAtencionState] = useState<MovState>({ loading: true, data: null })
  const [atencionOpen, setAtencionOpen] = useState(false)
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
  const [saving, setSaving] = useState(false)

  // Todas las llamadas llevan el rango de fechas explícito; `mode` queda por compatibilidad (las APIs
  // lo ignoran cuando reciben desde/hasta válidos).
  const rangeQS = `&desde=${desde}&hasta=${hasta}`
  const mode = 'fiscal_year'

  // Filtro por CUENTA: BBVA (100% de Alberto) vs Kutxabank (familiar). Se inicializa desde la URL
  // (?banco=) para que la Radiografía abra el detalle ya filtrado por la cuenta pulsada.
  const searchParams = useSearchParams()
  const [banco, setBanco] = useState<'' | 'bbva' | 'familiar'>(
    (searchParams.get('banco') as 'bbva' | 'familiar' | null) ?? ''
  )
  const bancoQS = banco ? `&banco=${banco}` : ''
  const BANCO_LABEL: Record<string, string> = { '': 'Todo', bbva: '🏦 BBVA (tuya)', familiar: '👨‍👩‍👧 Kutxabank (familiar)' }

  function aplicarPreset(p: Preset) {
    setPreset(p)
    if (p === 'mes_actual') setRango(rangoMes(0))
    else if (p === 'mes_anterior') setRango(rangoMes(-1))
    else if (p === 'anio') setRango({ desde: `${year}-01-01`, hasta: `${year}-12-31` })
    // 'custom': el rango lo fijan los inputs de fecha
  }

  useEffect(() => {
    setLoading(true)
    setMerchants({})
    setMovsComercio({})
    setComercioAbierto(null)
    // Cada fetch con su propio catch → Promise.all NUNCA rechaza, así `loading` siempre se apaga
    // (antes, un 500 en cualquiera de las dos dejaba la pestaña en "Cargando categorías…" para siempre).
    Promise.all([
      fetch(`/api/finanzas/categorias?year=${year}&month=${month}${rangeQS}${bancoQS}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/alertas-categoria').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([data, al]) => {
      const cats = Array.isArray(data) ? data : (data?.categorias ?? [])
      setCategorias(cats)
      setComparativa(data?.comparativa ?? {})
      setComparativaTotal(data?.comparativaTotal ?? null)
      setAlertas(Array.isArray(al) ? al : [])
      setLoading(false)
    })
    fetchAtencion()
  }, [year, month, desde, hasta, banco]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cola ÚNICA: sin clasificar (NULL/otros_gasto) + dudosos (IA marcó revisar). Backlog sin fechas,
  // de mayor a menor importe. Fusiona los antiguos paneles "Sin categoría" + "Por revisar" + "grandes".
  async function fetchAtencion() {
    setAtencionState({ loading: true, data: null })
    try {
      const json = await fetch(`/api/finanzas/categorias/movimientos?atencion=1${bancoQS}`).then(r => r.json())
      setAtencionState({ loading: false, data: json.movimientos ?? [] })
    } catch { setAtencionState({ loading: false, data: [] }) }
  }

  // Re-fetch merchants del expandido cuando cambia el rango de fechas
  useEffect(() => {
    if (expanded && merchants[expanded]?.data) fetchMerchants(expanded, true)
  }, [desde, hasta, year, month, banco]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reloadCategorias() {
    const data = await fetch(`/api/finanzas/categorias?year=${year}&month=${month}${rangeQS}${bancoQS}`).then(r => r.json())
    const cats = Array.isArray(data) ? data : (data?.categorias ?? [])
    setCategorias(cats)
    setComparativa(data?.comparativa ?? {})
    setComparativaTotal(data?.comparativaTotal ?? null)
  }

  async function fetchMerchants(cat: string, force = false) {
    if (!force && merchants[cat]?.data) return
    setMerchants(prev => ({ ...prev, [cat]: { loading: true, data: null } }))
    const res = await fetch(`/api/finanzas/categorias/comerciantes?categoria=${cat}&mode=${mode}&year=${year}&month=${month}${rangeQS}${bancoQS}`)
    const json = await res.json()
    const data = json.comerciantes ?? []
    setMerchants(prev => ({ ...prev, [cat]: { loading: false, data } }))
    // Si la categoría tiene UN solo comercio, abrimos su desglose directamente: lo lógico al entrar es
    // ver los movimientos, no un mini-gráfico redundante (feedback de Alberto).
    if (data.length === 1) { setComercioAbierto(data[0].comerciante); fetchMovsComercio(data[0].comerciante) }
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
    // El comercio se abre SIEMPRE dentro de una categoría expandida (`expanded`): se pasa como
    // `categoria` para que el drill-down solo muestre los movimientos de ESA subcategoría (cuadra el
    // contador "N ops" de la tarjeta, que se calcula por subcategoría).
    const cat = encodeURIComponent(expanded ?? '')
    const res = await fetch(`/api/finanzas/categorias/movimientos?comerciante=${encodeURIComponent(comerciante)}&categoria=${cat}&mode=${mode}&year=${year}&month=${month}${rangeQS}${bancoQS}`)
    const json = await res.json()
    setMovsComercio(prev => ({ ...prev, [comerciante]: { loading: false, data: json.movimientos ?? [] } }))
  }

  function toggleComercio(comerciante: string) {
    if (comercioAbierto === comerciante) { setComercioAbierto(null); return }
    setComercioAbierto(comerciante)
    fetchMovsComercio(comerciante)
  }

  // Reasigna la categoría de TODO un comercio (aprende regla) o de un movimiento suelto.
  async function reasignar(body: { subcategoria: string; comerciante?: string; movId?: string }) {
    setSaving(true)
    try {
      await fetch('/api/finanzas/categorias/asignar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      await reloadCategorias()
      fetchAtencion()
      if (expanded) await fetchMerchants(expanded, true)
      if (comercioAbierto) await fetchMovsComercio(comercioAbierto, true)
    } finally {
      setSaving(false)
    }
  }

  async function autoTag() {
    setAutoTagging(true)
    setAutoTagMsg(null)
    try {
      const res = await fetch('/api/finanzas/categorias/auto-tag', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAutoTagMsg(`⚠️ ${json.error ?? 'La IA no pudo clasificar ahora mismo. Reinténtalo.'}`)
        setAutoTagging(false)
        return
      }
      setAutoTagMsg(`✅ ${json.tagged ?? 0} gastos categorizados automáticamente`)
      await reloadCategorias()
      fetchAtencion()
      if (expanded) await fetchMerchants(expanded, true)
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
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 500 }}>{eur(Math.abs(m.importe))}</span>
            <CatSelect value={m.subcategoria ?? ''} onChange={v => reasignar({ movId: m.id, subcategoria: v })} title="Cambiar categoría de este movimiento" />
          </div>
        ))}
      </div>
    )
  }

  // Cola ÚNICA de acción: sin clasificar + dudosos, de mayor a menor importe. Plegada por defecto
  // (regla de rendimiento: la lista solo se monta al abrir). El botón 🤖 Auto-clasificar vive aquí.
  function AtencionPanel() {
    const n = atencionState.data?.length ?? 0
    if (!atencionState.loading && n === 0) return null
    return (
      <div style={{ borderRadius: '8px', border: '1px solid #f59e0b55', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#f59e0b18', flexWrap: 'wrap' }}>
          <button onClick={() => setAtencionOpen(o => !o)} style={{ ...btnStyle, fontWeight: 600, background: 'transparent', border: 'none' }}>
            {atencionOpen ? '▲' : '▼'} 🔎 Necesitan tu atención <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({n})</span>
          </button>
          <button onClick={autoTag} disabled={autoTagging} style={{ ...btnStyle, marginLeft: 'auto' }}>
            {autoTagging ? 'Clasificando…' : '🤖 Auto-clasificar'}
          </button>
          {autoTagMsg && <span style={{ fontSize: '12px', width: '100%', color: autoTagMsg.startsWith('⚠️') ? '#ef4444' : '#10b981' }}>{autoTagMsg}</span>}
        </div>
        {atencionOpen && (
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 4px' }}>Gastos sin clasificar o que la IA no tuvo claros, de mayor a menor importe. Asígnalos a mano o pulsa 🤖 Auto-clasificar.</p>
            <MovList state={atencionState} />
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p style={{ color: 'var(--muted)', fontSize: '14px', padding: '16px' }}>Cargando categorías...</p>

  if (!categorias.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
      <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Sin movimientos categorizados en este periodo.</p>
      <AtencionPanel />
    </div>
  )

  const gastosData = categorias.filter(c => !esIngreso(c.subcategoria))
  const totalGastos = gastosData.reduce((s, c) => s + c.total, 0)

  // Color por subcategoría en el orden de la dona → tabla y dona coinciden aunque agrupemos Vivienda.
  const colorOf = new Map(gastosData.map((c, i) => [c.subcategoria, COLORS[i % COLORS.length]]))
  const esVivienda = (sub: string) => (GRUPO_VIVIENDA as readonly string[]).includes(sub)
  const viviendaRows = gastosData.filter(c => esVivienda(c.subcategoria))
  const otrasRows = gastosData.filter(c => !esVivienda(c.subcategoria))
  const viviendaTotal = viviendaRows.reduce((s, c) => s + c.total, 0)

  // Badge ±% (C): comparativa del mes actual vs media de 6 meses. Solo en preset "Mes actual".
  function DeltaBadge({ sub }: { sub: string }) {
    if (preset !== 'mes_actual') return null
    const d = comparativa[sub]
    if (d == null || d === 0) return null
    const up = d > 0
    return (
      <span title="Frente a tu media de los últimos 6 meses"
        style={{ fontSize: '10px', fontWeight: 600, color: up ? '#ef4444' : '#10b981', whiteSpace: 'nowrap' }}>
        {up ? '▲' : '▼'}{Math.abs(d)}%
      </span>
    )
  }

  // Renderiza una fila de categoría de gasto (+ su detalle de comercios si está expandida).
  function filaCategoria(c: CategoriaRow, indent = false): React.ReactNode[] {
    const isExp = expanded === c.subcategoria
    const ms = merchants[c.subcategoria]
    const minTicket = ms?.data && ms.data.length > 0 ? Math.min(...ms.data.map(m => m.ticket_medio)) : null
    return [
      <tr key={c.subcategoria} onClick={() => toggleExpanded(c.subcategoria)}
        style={{ borderTop: '1px solid var(--border)', background: isExp ? 'var(--surface)' : 'transparent', cursor: 'pointer' }}>
        <td style={{ padding: '8px 12px', paddingLeft: indent ? '32px' : '12px', fontWeight: 500 }}>
          <span style={{ marginRight: '6px', fontSize: '11px', color: 'var(--muted)' }}>{isExp ? '▼' : '▶'}</span>
          <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: colorOf.get(c.subcategoria), marginRight: '6px', verticalAlign: 'middle', flexShrink: 0 }} />
          {EMOJI[c.subcategoria] ?? '•'} {labelCat(c.subcategoria)}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <div>{eur(c.total)}</div>
          <DeltaBadge sub={c.subcategoria} />
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
                          {eur(m.total)}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
                        {m.count} ops · ticket medio {eur(m.ticket_medio)}
                      </div>
                      {/* El mini-gráfico solo aporta si hay VARIOS meses; con un solo mes es idéntico al
                          total (Alberto: "no me da información, es lo mismo") → se oculta. */}
                      {m.porMes.length > 1 && !abierto && (
                        <div style={{ height: '70px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={m.porMes} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                              <Bar dataKey="total" fill="#6366f1" radius={[2,2,0,0]} />
                              <XAxis dataKey="mes" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
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
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* Filtro de fechas (por defecto: mes en curso) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Período:</span>
        {([
          { p: 'mes_actual', label: 'Mes actual' },
          { p: 'mes_anterior', label: 'Mes anterior' },
          { p: 'anio', label: `Año ${year}` },
        ] as { p: Preset; label: string }[]).map(({ p, label }) => (
          <button
            key={p}
            onClick={() => aplicarPreset(p)}
            style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
              background: preset === p ? 'var(--primary)' : 'var(--surface)',
              color: preset === p ? '#fff' : 'var(--text)',
              border: `1px solid ${preset === p ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {label}
          </button>
        ))}
        {/* Rango personalizado con inputs de fecha */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--muted)' }}>
          <input
            type="date" value={desde} max={hasta}
            onChange={e => { setPreset('custom'); setRango(r => ({ ...r, desde: e.target.value })) }}
            style={{ padding: '4px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
          <span>–</span>
          <input
            type="date" value={hasta} min={desde}
            onChange={e => { setPreset('custom'); setRango(r => ({ ...r, hasta: e.target.value })) }}
            style={{ padding: '4px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </label>
      </div>

      {/* Filtro por CUENTA: separar el gasto propio (BBVA) del familiar (Kutxabank). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '-20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cuenta:</span>
        {(['', 'bbva', 'familiar'] as const).map(b => (
          <button
            key={b || 'todo'}
            onClick={() => setBanco(b)}
            style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
              background: banco === b ? 'var(--primary)' : 'var(--surface)',
              color: banco === b ? '#fff' : 'var(--text)',
              border: `1px solid ${banco === b ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {BANCO_LABEL[b]}
          </button>
        ))}
      </div>

      {/* Titular del mes: lo primero que quiere ver — cuánto lleva gastado y si va por encima/debajo. */}
      <div style={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', padding: '14px 18px' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
          {preset === 'mes_actual' ? 'Este mes' : preset === 'mes_anterior' ? 'Mes anterior' : preset === 'anio' ? `Año ${year}` : 'Periodo seleccionado'}
        </div>
        <div style={{ fontSize: '28px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{eur(totalGastos)}</div>
        {preset === 'mes_actual' && comparativaTotal?.deltaPct != null && comparativaTotal.deltaPct !== 0 && (
          <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', color: comparativaTotal.deltaPct > 0 ? '#ef4444' : '#10b981' }}>
            {comparativaTotal.deltaPct > 0 ? '▲' : '▼'} {Math.abs(comparativaTotal.deltaPct)}% vs tu media de los últimos 6 meses
          </div>
        )}
      </div>

      {/* Cola ÚNICA de acción (sin clasificar + dudosos + Auto-clasificar) */}
      <AtencionPanel />

      {/* Gráfico dona */}
      {gastosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '12px' }}>Distribución de gastos</h3>
          {/* Solo la dona (sin leyenda de Recharts, que se solapaba con el gráfico en móvil al
              tener muchas categorías). La tabla de abajo hace de leyenda: cada fila lleva el
              punto de color de su porción. */}
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gastosData.map(c => ({ name: c.subcategoria, value: c.total }))}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                  dataKey="value" nameKey="name"
                >
                  {gastosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [eur(v), `${EMOJI[n] ?? '•'} ${labelCat(n)}`]} />
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
          {/* Scroll horizontal en móvil: antes overflow:hidden CORTABA la columna % (no se podía ver
              ni desplazar). minWidth mantiene las columnas legibles al desplazar. */}
          <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Movs.</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {otrasRows.map(c => filaCategoria(c))}
                {/* Grupo 🏠 Vivienda (Montecarmelo): hipoteca + comunidad + IBI + suministros, con subtotal. */}
                {viviendaRows.length > 0 && (
                  <>
                    <tr key="vivienda-header" style={{ borderTop: '2px solid var(--border)', background: 'var(--surface)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>🏠 Vivienda <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '11px' }}>(Montecarmelo)</span></td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{eur(viviendaTotal)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{viviendaRows.reduce((s, c) => s + c.count, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{totalGastos > 0 ? ((viviendaTotal / totalGastos) * 100).toFixed(1) : 0}%</td>
                    </tr>
                    {viviendaRows.map(c => filaCategoria(c, true))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Análisis IA (secundario → plegado y por debajo de la dona/tabla) */}
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
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eur(a.limite_mensual)}</td>
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
