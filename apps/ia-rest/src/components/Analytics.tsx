'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/* ─── Design tokens ─── */

/* ─── Types ─── */
type Period = 'turno' | 'ultimo' | '7d'

interface AnalyticsData {
  ticketMedio: number | null
  ticketPorMesa: { codigo: string; total: number }[]
  topProductos: { nombre: string; qty: number; revenue: number }[]
  latenciaMedia: number | null
  comandasPorHora: { hora: number; n: number }[]
  camareros: { nombre: string; comandas: number; revenue: number; latencia: number | null }[]
  totalComandas: number
  totalRevenue: number
}

/* ─── Helpers ─── */
const fmt = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtMs = (ms: number | null) => ms == null ? '—' : `${ms.toFixed(0)} ms`

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div style={{
      background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: C.ink4 }}>
        {label}
      </div>
      <div style={{ fontFamily: SE, fontSize: 36, fontWeight: 500, lineHeight: 1,
        letterSpacing: '-0.02em', color: accent ? C.red : C.ink }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{sub}</div>
      )}
    </div>
  )
}

function BarRow({ label, value, max, fmt: fmtFn, highlight }: {
  label: string; value: number; max: number; fmt?: (v: number) => string; highlight?: boolean; key?: string | number
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2
  const fmtVal = fmtFn ? fmtFn(value) : value.toString()
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0',
      borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink2,
        width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 6, background: C.paper3, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: highlight ? C.red : C.ink2,
          borderRadius: 2, transition: 'width .4s cubic-bezier(0.22,1,0.36,1)' }}/>
      </div>
      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, width: 64,
        textAlign: 'right', flexShrink: 0 }}>
        {fmtVal}
      </div>
    </div>
  )
}

function HourChart({ data }: { data: { hora: number; n: number }[] }) {
  if (data.length === 0) return (
    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, padding: '12px 0',
      fontStyle: 'italic' }}>Sin datos</div>
  )
  const maxN = Math.max(...data.map(d => d.n), 1)
  const hours = Array.from({ length: 24 }, (_, i) => {
    const found = data.find(d => d.hora === i)
    return { hora: i, n: found?.n ?? 0 }
  }).filter(d => d.n > 0 || (d.hora >= 8 && d.hora <= 24))

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60, padding: '4px 0' }}>
      {hours.map(d => (
        <div key={d.hora} style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 2 }}>
          <div
            title={`${d.hora}h · ${d.n} comandas`}
            style={{
              width: '100%', borderRadius: '2px 2px 0 0',
              background: d.n > 0 ? (d.n === maxN ? C.red : C.ink2) : C.rule,
              height: d.n > 0 ? `${Math.max(4, (d.n / maxN) * 52)}px` : '2px',
              transition: 'height .4s cubic-bezier(0.22,1,0.36,1)',
              cursor: d.n > 0 ? 'pointer' : 'default',
            }}
          />
          {d.hora % 4 === 0 && (
            <div style={{ fontFamily: SM, fontSize: 8, color: C.ink4 }}>{d.hora}h</div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Period filter buttons ─── */
function PeriodBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      fontFamily: SN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      padding: '5px 10px', borderRadius: 4, border: `1px solid ${active ? C.ink : C.rule}`,
      background: active ? C.ink : C.bone, color: active ? C.bone : C.ink3,
      cursor: 'pointer', transition: 'all .15s',
    }}>
      {children}
    </button>
  )
}

/* ─── Main component ─── */
export default function Analytics({ turnoId, compact = false }: {
  turnoId?: string; compact?: boolean
}) {
  const [period, setPeriod] = useState<Period>('turno')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [turnoActual, setTurnoActual] = useState<string | null>(turnoId ?? null)

  /* Fetch active turno if not provided */
  useEffect(() => {
    if (turnoId) return
    supabase.from('turnos').select('id').eq('estado', 'activo')
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setTurnoActual(data[0].id) })
  }, [turnoId])

  const load = useCallback(async () => {
    setLoading(true)

    /* Build date / turno filter */
    let turnoFilter: string | null = null
    let dateFrom: string | null = null

    if (period === 'turno') {
      turnoFilter = turnoActual
    } else if (period === 'ultimo') {
      /* last finished turno */
      const { data: turnos } = await supabase.from('turnos').select('id')
        .eq('estado', 'cerrado').order('created_at', { ascending: false }).limit(1)
      turnoFilter = turnos?.[0]?.id ?? null
    } else {
      /* 7 days */
      const d = new Date(); d.setDate(d.getDate() - 7)
      dateFrom = d.toISOString()
    }

    /* Helper: apply turno or date filter to a supabase query builder */
    const applyFilter = (q: any) => {
      if (turnoFilter) return q.eq('turno_id', turnoFilter)
      if (dateFrom) return q.gte('created_at', dateFrom)
      return q
    }

    /* ── Fetch comandas with items ── */
    const { data: comandas } = await applyFilter(
      supabase.from('comandas').select(`
        id, mesa_id, camarero_id, created_at,
        mesa:mesas(codigo),
        camarero:camareros(nombre),
        items:comanda_items(nombre, cantidad, precio_unitario)
      `)
    )

    /* ── Fetch transcripciones ── */
    const { data: txs } = await applyFilter(
      supabase.from('transcripciones').select('latencia_ms, camarero_id')
    )

    if (!comandas || comandas.length === 0) {
      setData({
        ticketMedio: null, ticketPorMesa: [], topProductos: [],
        latenciaMedia: null, comandasPorHora: [], camareros: [],
        totalComandas: 0, totalRevenue: 0,
      })
      setLoading(false)
      return
    }

    /* ── Ticket medio por mesa ── */
    const mesaMap = new Map<string, { codigo: string; total: number }>()
    let totalRevenue = 0
    comandas.forEach((c: any) => {
      const mesaKey = c.mesa_id
      const codigo = c.mesa?.codigo ?? '?'
      const mesaTotal = (c.items ?? []).reduce(
        (s: number, it: any) => s + (Number(it.precio_unitario ?? 0) * Number(it.cantidad ?? 1)), 0
      )
      totalRevenue += mesaTotal
      const prev = mesaMap.get(mesaKey) ?? { codigo, total: 0 }
      mesaMap.set(mesaKey, { codigo, total: prev.total + mesaTotal })
    })
    const ticketPorMesa = [...mesaMap.values()].sort((a, b) => b.total - a.total)
    const ticketMedio = ticketPorMesa.length > 0
      ? ticketPorMesa.reduce((s, m) => s + m.total, 0) / ticketPorMesa.length
      : null

    /* ── Top 10 productos ── */
    const prodMap = new Map<string, { qty: number; revenue: number }>()
    comandas.forEach((c: any) => {
      ;(c.items ?? []).forEach((it: any) => {
        const k = it.nombre ?? 'Desconocido'
        const prev = prodMap.get(k) ?? { qty: 0, revenue: 0 }
        prodMap.set(k, {
          qty: prev.qty + Number(it.cantidad ?? 1),
          revenue: prev.revenue + Number(it.precio_unitario ?? 0) * Number(it.cantidad ?? 1),
        })
      })
    })
    const topProductos = [...prodMap.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)

    /* ── Latencia media ── */
    const latencias = (txs ?? []).map((t: any) => t.latencia_ms).filter((v: any) => v != null)
    const latenciaMedia = latencias.length > 0
      ? latencias.reduce((a: number, b: number) => a + b, 0) / latencias.length
      : null

    /* ── Comandas por hora ── */
    const horaMap = new Map<number, number>()
    comandas.forEach((c: any) => {
      const h = new Date(c.created_at).getHours()
      horaMap.set(h, (horaMap.get(h) ?? 0) + 1)
    })
    const comandasPorHora = [...horaMap.entries()]
      .map(([hora, n]) => ({ hora, n }))
      .sort((a, b) => a.hora - b.hora)

    /* ── Rendimiento por camarero ── */
    const camMap = new Map<string, {
      nombre: string; comandas: number; revenue: number; latencias: number[]
    }>()
    comandas.forEach((c: any) => {
      const k = c.camarero_id ?? 'desconocido'
      const nombre = c.camarero?.nombre ?? 'Sin asignar'
      const rev = (c.items ?? []).reduce(
        (s: number, it: any) => s + Number(it.precio_unitario ?? 0) * Number(it.cantidad ?? 1), 0
      )
      const prev = camMap.get(k) ?? { nombre, comandas: 0, revenue: 0, latencias: [] }
      camMap.set(k, { nombre, comandas: prev.comandas + 1, revenue: prev.revenue + rev, latencias: prev.latencias })
    })
    ;(txs ?? []).forEach((t: any) => {
      if (t.camarero_id && t.latencia_ms != null) {
        const k = t.camarero_id
        const prev = camMap.get(k)
        if (prev) prev.latencias.push(t.latencia_ms)
      }
    })
    const camareros = [...camMap.values()].map(c => ({
      nombre: c.nombre,
      comandas: c.comandas,
      revenue: c.revenue,
      latencia: c.latencias.length > 0
        ? c.latencias.reduce((a, b) => a + b, 0) / c.latencias.length
        : null,
    })).sort((a, b) => b.comandas - a.comandas)

    setData({
      ticketMedio, ticketPorMesa, topProductos,
      latenciaMedia, comandasPorHora, camareros,
      totalComandas: comandas.length, totalRevenue,
    })
    setLoading(false)
  }, [period, turnoActual])

  useEffect(() => { load() }, [load])

  /* ── Empty state ── */
  const empty = (msg = 'Sin datos para el período seleccionado') => (
    <div style={{ fontFamily: SE, fontSize: 16, color: C.ink3, fontStyle: 'italic',
      padding: '24px 0' }}>
      {msg}
    </div>
  )

  return (
    <div style={{ fontFamily: SN }}>
      {/* Header + period selector */}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink }}>
            Analytics
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <PeriodBtn active={period === 'turno'} onClick={() => setPeriod('turno')}>
              Turno actual
            </PeriodBtn>
            <PeriodBtn active={period === 'ultimo'} onClick={() => setPeriod('ultimo')}>
              Último turno
            </PeriodBtn>
            <PeriodBtn active={period === '7d'} onClick={() => setPeriod('7d')}>
              7 días
            </PeriodBtn>
          </div>
        </div>
      )}

      {compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.ink4 }}>
            RESUMEN ANALÍTICO
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <PeriodBtn active={period === 'turno'} onClick={() => setPeriod('turno')}>
              Turno
            </PeriodBtn>
            <PeriodBtn active={period === 'ultimo'} onClick={() => setPeriod('ultimo')}>
              Anterior
            </PeriodBtn>
            <PeriodBtn active={period === '7d'} onClick={() => setPeriod('7d')}>
              7 días
            </PeriodBtn>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, padding: '20px 0' }}>
          Calculando...
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── KPI row ── */}
          <div style={{ display: 'grid',
            gridTemplateColumns: compact
              ? 'repeat(2,1fr)'
              : 'repeat(4,1fr)',
            gap: 12, marginBottom: 20 }}>
            <StatCard
              label="Ticket medio · mesa"
              value={data.ticketMedio != null ? `${fmt(data.ticketMedio)} €` : '—'}
              sub={data.ticketPorMesa.length > 0
                ? `${data.ticketPorMesa.length} mesas en período`
                : undefined}
            />
            <StatCard
              label="Facturación total"
              value={data.totalRevenue > 0 ? `${fmt(data.totalRevenue)} €` : '—'}
              sub={`${data.totalComandas} comandas`}
            />
            <StatCard
              label="Latencia EAR+BRAIN"
              value={data.latenciaMedia != null ? `${data.latenciaMedia.toFixed(0)} ms` : '—'}
              sub={data.latenciaMedia != null
                ? (data.latenciaMedia < 500 ? 'objetivo OK (<0.5 s)' : 'por encima del objetivo')
                : undefined}
              accent={data.latenciaMedia != null && data.latenciaMedia >= 500}
            />
            <StatCard
              label="Comandas"
              value={data.totalComandas.toString()}
              sub={data.camareros.length > 0
                ? `${data.camareros.length} camareros activos`
                : undefined}
            />
          </div>

          {!compact && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Top productos */}
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4,
                  marginBottom: 12 }}>
                  TOP 10 · PRODUCTOS
                </div>
                {data.topProductos.length === 0
                  ? empty()
                  : data.topProductos.map((p, i) => (
                    <BarRow
                      key={p.nombre}
                      label={p.nombre}
                      value={p.qty}
                      max={data.topProductos[0]?.qty ?? 1}
                      fmt={v => `${v} ud`}
                      highlight={i === 0}
                    />
                  ))}
              </div>

              {/* Distribución horaria */}
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4,
                  marginBottom: 12 }}>
                  COMANDAS · POR HORA
                </div>
                {data.comandasPorHora.length === 0
                  ? empty()
                  : <HourChart data={data.comandasPorHora} />}
                {data.comandasPorHora.length > 0 && (() => {
                  const peak = data.comandasPorHora.reduce((a, b) => b.n > a.n ? b : a)
                  return (
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3,
                      marginTop: 8 }}>
                      Pico: {peak.hora}:00 · {peak.n} comandas
                    </div>
                  )
                })()}
              </div>

              {/* Ticket por mesa */}
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4,
                  marginBottom: 12 }}>
                  TICKET · POR MESA
                </div>
                {data.ticketPorMesa.length === 0
                  ? empty()
                  : data.ticketPorMesa.slice(0, 10).map((m, i) => (
                    <BarRow
                      key={m.codigo}
                      label={m.codigo}
                      value={m.total}
                      max={data.ticketPorMesa[0]?.total ?? 1}
                      fmt={v => `${fmt(v)} €`}
                      highlight={i === 0}
                    />
                  ))}
              </div>

              {/* Rendimiento camareros */}
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4,
                  marginBottom: 12 }}>
                  CAMAREROS · RENDIMIENTO
                </div>
                {data.camareros.length === 0
                  ? empty()
                  : (
                    <div>
                      {/* Header row */}
                      <div style={{ display: 'grid',
                        gridTemplateColumns: '1fr 50px 70px 70px',
                        gap: 8, padding: '4px 0 8px',
                        fontFamily: SM, fontSize: 9, color: C.ink4,
                        fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        borderBottom: `1px solid ${C.ruleS}` }}>
                        <span>NOMBRE</span>
                        <span style={{ textAlign: 'right' }}>CMD</span>
                        <span style={{ textAlign: 'right' }}>VENTAS</span>
                        <span style={{ textAlign: 'right' }}>LATENCIA</span>
                      </div>
                      {data.camareros.map(c => (
                        <div key={c.nombre} style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 50px 70px 70px',
                          gap: 8, padding: '7px 0',
                          borderBottom: `1px solid ${C.rule}`,
                          alignItems: 'center',
                        }}>
                          <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600,
                            color: C.ink2 }}>
                            {c.nombre.split(' ')[0]}
                          </span>
                          <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3,
                            textAlign: 'right' }}>
                            {c.comandas}
                          </span>
                          <span style={{ fontFamily: SM, fontSize: 11, color: C.ink2,
                            textAlign: 'right' }}>
                            {c.revenue > 0 ? `${fmt(c.revenue)} €` : '—'}
                          </span>
                          <span style={{
                            fontFamily: SM, fontSize: 11, textAlign: 'right',
                            color: c.latencia == null ? C.ink4
                              : c.latencia < 500 ? C.green : C.red,
                          }}>
                            {fmtMs(c.latencia)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

            </div>
          )}

          {/* Compact: just top productos + camareros as simple lists */}
          {compact && data.topProductos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontFamily: SM, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4,
                  marginBottom: 10 }}>
                  TOP PRODUCTOS
                </div>
                {data.topProductos.slice(0, 5).map((p, i) => (
                  <BarRow key={p.nombre} label={p.nombre} value={p.qty}
                    max={data.topProductos[0]?.qty ?? 1} fmt={v => `${v} ud`}
                    highlight={i === 0} />
                ))}
              </div>
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontFamily: SM, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4,
                  marginBottom: 10 }}>
                  CAMAREROS
                </div>
                {data.camareros.map(c => (
                  <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '5px 0', borderBottom: `1px solid ${C.rule}`,
                    fontFamily: SN, fontSize: 12 }}>
                    <span style={{ color: C.ink2, fontWeight: 600 }}>{c.nombre.split(' ')[0]}</span>
                    <span style={{ color: C.ink3, fontFamily: SM }}>{c.comandas} cmd</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !data && empty('No se pudieron cargar los datos.')}
    </div>
  )
}
