'use client'
// AnalyticsComparativo — Período actual vs anterior + ranking multi-local

import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Periodo = 'hoy' | 'semana' | 'mes' | 'trimestre'

interface Metricas {
  ventas_brutas: number; num_comandas: number; ticket_medio: number
  cobros: Record<string, number>; top_productos: { nombre: string; unidades: number; importe: number }[]
  evolucion: { fecha: string; ventas: number }[]; pico_hora: number | null
  label: string
}
interface Local { id: string; nombre: string; ventas: number; ticket: number; comandas: number }
interface AnalyticsData {
  actual: Metricas; anterior: Metricas
  comparativa: { ventas: number | null; comandas: number | null; ticket: number | null }
  grupo: Local[]
}

const fmt = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const fmtN = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 0 })

function Delta({ v, label }: { v: number | null; label: string }) {
  if (v === null) return null
  const up   = v > 0
  const zero = Math.abs(v) < 0.5
  const col  = zero ? C.ink3 : up ? '#4ADE80' : '#F87171'
  const bg   = zero ? C.bg2  : up ? '#0A2614' : '#2E1010'
  return (
    <span style={{ fontFamily: SM, fontSize: 11, padding: '2px 8px', borderRadius: 20, background: bg, color: col }}>
      {zero ? '≈' : up ? '▲' : '▼'} {Math.abs(v).toFixed(1)}% {label}
    </span>
  )
}

function Sparkline({ data, color = C.verm }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data); const min = Math.min(...data)
  const range = max - min || 1
  const W = 80; const H = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`)
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function AnalyticsComparativo({ sh }: { sh: () => Record<string, string> }) {
  const [tipo,    setTipo]    = useState<Periodo>('semana')
  const [data,    setData]    = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (t: Periodo) => {
    setLoading(true)
    const r = await fetch(`/api/owner/analytics?tipo=${t}`, { headers: sh() })
    const d = await r.json()
    if (d.ok) setData(d)
    setLoading(false)
  }, [sh])

  useEffect(() => { load(tipo) }, [tipo])

  const TIPOS: { id: Periodo; label: string }[] = [
    { id: 'hoy',       label: 'Hoy vs ayer'       },
    { id: 'semana',    label: 'Esta semana'         },
    { id: 'mes',       label: 'Este mes'            },
    { id: 'trimestre', label: 'Este trimestre'      },
  ]

  return (
    <div style={{ padding: '18px 20px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>Analytics comparativo</div>
        {loading && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando…</span>}
      </div>

      {/* Selector período */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.id} onClick={() => setTipo(t.id)} style={{
            fontFamily: SN, fontSize: 12, padding: '6px 14px', borderRadius: 20,
            background: tipo === t.id ? C.ink : 'transparent',
            color: tipo === t.id ? C.paper : C.ink3,
            border: `1px solid ${tipo === t.id ? C.ink : C.rule}`, cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {data && (
        <>
          {/* KPIs principales con comparativa */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Ventas',        actual: data.actual.ventas_brutas,  ant: data.anterior.ventas_brutas,  fmt: fmt,  delta: data.comparativa.ventas  },
              { label: 'Comandas',      actual: data.actual.num_comandas,   ant: data.anterior.num_comandas,   fmt: fmtN, delta: data.comparativa.comandas },
              { label: 'Ticket medio',  actual: data.actual.ticket_medio,   ant: data.anterior.ticket_medio,   fmt: fmt,  delta: data.comparativa.ticket  },
            ].map(({ label, actual, ant, fmt: f, delta }) => (
              <div key={label} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 4 }}>{f(actual)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Delta v={delta} label="vs ant." />
                </div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 4 }}>
                  {data.anterior.label}: {f(ant)}
                </div>
              </div>
            ))}
          </div>

          {/* Evolución diaria sparklines */}
          {data.actual.evolucion.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: data.actual.label,    data: data.actual.evolucion,    color: C.verm },
                { label: data.anterior.label,  data: data.anterior.evolucion,  color: C.ink3 },
              ].map(({ label, data: evo, color }) => (
                <div key={label} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 8 }}>{label}</div>
                  <Sparkline data={evo.map(e => e.ventas)} color={color} />
                  {evo.length > 0 && (
                    <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4, marginTop: 4 }}>
                      Mejor día: {fmt(Math.max(...evo.map(e => e.ventas)))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {/* Cobros por canal */}
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', marginBottom: 10 }}>Cobros por canal</div>
              {Object.entries(data.actual.cobros).sort(([,a],[,b]) => b - a).map(([canal, importe]) => {
                const total = data.actual.ventas_brutas
                const pct   = total > 0 ? Math.round(importe / total * 100) : 0
                const label = canal === 'efectivo' ? '💵 Efectivo' : canal === 'tarjeta' ? '💳 Tarjeta' : canal === 'bizum' ? '📱 Bizum' : canal
                return (
                  <div key={canal} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{label}</span>
                      <span style={{ fontFamily: SN, fontSize: 12, color: C.ink }}>{fmt(importe)} <span style={{ color: C.ink4 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 3, background: C.rule, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: C.verm, borderRadius: 2 }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Top productos */}
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', marginBottom: 10 }}>Top productos</div>
              {data.actual.top_productos.map((p, i) => (
                <div key={p.nombre} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, width: 16 }}>{i + 1}</span>
                    <span style={{ fontFamily: SN, fontSize: 12, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: SN, fontSize: 11, color: C.ink }}>{fmt(p.importe)}</div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{p.unidades} ud.</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hora pico */}
          {data.actual.pico_hora !== null && (
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <span style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Hora pico de comandas: </span>
              <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink }}>{data.actual.pico_hora}:00 — {data.actual.pico_hora + 1}:00</span>
            </div>
          )}

          {/* Ranking multi-local (solo si es grupo) */}
          {data.grupo.length > 1 && (
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
                Ranking grupo — {data.actual.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.grupo.map((local, i) => {
                  const maxVentas = Math.max(...data.grupo.map(l => l.ventas))
                  const pct = maxVentas > 0 ? Math.round(local.ventas / maxVentas * 100) : 0
                  return (
                    <div key={local.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontFamily: SM, fontSize: 12, color: i === 0 ? C.amber : C.ink4, width: 18 }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                          </span>
                          <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{local.nombre}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink }}>{fmt(local.ventas)}</span>
                          <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, marginLeft: 8 }}>{local.comandas} cmd · {fmt(local.ticket)} ticket</span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: C.rule, borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? C.amber : C.verm, borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>
          Sin datos suficientes para el período seleccionado.
        </div>
      )}
    </div>
  )
}
