'use client'
import { useState, useEffect, useCallback } from 'react'
import { eur } from '@/lib/dinero'

interface PLGastosPiso {
  lavanderia: number
  limpieza: number
  alquiler: number
  suministros: number
  comunidad: number
  otros: number
  total: number
}
interface PLPiso {
  propertyId: string
  nombre: string
  maxHuespedes: number
  ingresos: number
  reservas: number
  gastos: PLGastosPiso
  resultado: number
  margen: number
}
interface PLMensual { mes: string; pisos: PLPiso[] }

function fmt(n: number) {
  return eur(n)
}
function fmtDec(n: number) {
  return eur(n)
}

function colorMargen(m: number) {
  if (m >= 40) return 'var(--success, #16a34a)'
  if (m >= 20) return 'var(--warning, #ca8a04)'
  return 'var(--danger, #dc2626)'
}

export default function ResultadoPisosPage() {
  const hoy = new Date()
  const defMes = `${hoy.getFullYear()}-${String(hoy.getMonth()).padStart(2, '0')}` // mes anterior
  const [mes, setMes] = useState(defMes === `${hoy.getFullYear()}-00`
    ? `${hoy.getFullYear() - 1}-12`
    : defMes)
  const [data, setData] = useState<PLMensual | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (m: string) => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/sivra/pl-mensual?mes=${m}`)
      if (!r.ok) { setError('Error cargando datos'); return }
      setData(await r.json())
    } catch { setError('Error de red') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(mes) }, [mes, load])

  const totales = data?.pisos.reduce(
    (acc, p) => ({
      ingresos:    acc.ingresos    + p.ingresos,
      lavanderia:  acc.lavanderia  + p.gastos.lavanderia,
      limpieza:    acc.limpieza    + (p.gastos.limpieza ?? 0),
      alquiler:    acc.alquiler    + p.gastos.alquiler,
      suministros: acc.suministros + p.gastos.suministros,
      comunidad:   acc.comunidad   + p.gastos.comunidad,
      otros:       acc.otros       + p.gastos.otros,
      totalGastos: acc.totalGastos + p.gastos.total,
      resultado:   acc.resultado   + p.resultado,
    }),
    { ingresos: 0, lavanderia: 0, limpieza: 0, alquiler: 0, suministros: 0, comunidad: 0, otros: 0, totalGastos: 0, resultado: 0 }
  )

  const [mesLabel] = (() => {
    if (!mes) return ['']
    const [y, m2] = mes.split('-')
    const d = new Date(Number(y), Number(m2) - 1, 1)
    return [d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })]
  })()

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Resultado por piso</h1>
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
            fontSize: 14, background: 'var(--surface)', color: 'var(--text)',
          }}
        />
        {mesLabel && (
          <span style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'capitalize' }}>{mesLabel}</span>
        )}
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>Calculando...</p>}
      {error && <p style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}

      {!loading && data && (
        <>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
            <KpiCard label="Ingresos totales" value={fmt(totales?.ingresos ?? 0)} color="var(--primary)" />
            <KpiCard label="Gastos totales"   value={fmt(totales?.totalGastos ?? 0)} color="var(--muted)" />
            <KpiCard
              label="Resultado neto"
              value={fmt(totales?.resultado ?? 0)}
              color={(totales?.resultado ?? 0) >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'}
            />
            <KpiCard
              label="Margen global"
              value={totales && totales.ingresos > 0
                ? `${Math.round((totales.resultado / totales.ingresos) * 100)} %`
                : '—'}
              color={(totales?.resultado ?? 0) >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'}
            />
          </div>

          {/* Tabla */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, var(--surface))', textAlign: 'right' }}>
                  <Th left>Piso</Th>
                  <Th>Reservas</Th>
                  <Th>Ingresos</Th>
                  <Th>Lavandería</Th>
                  <Th>Limpieza</Th>
                  <Th>Alquiler</Th>
                  <Th>Suministros</Th>
                  <Th>Comunidad</Th>
                  <Th>Otros</Th>
                  <Th>Total gastos</Th>
                  <Th>Resultado</Th>
                  <Th>Margen</Th>
                </tr>
              </thead>
              <tbody>
                {data.pisos.map(p => (
                  <tr key={p.propertyId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                      {p.nombre}
                      <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                        ({p.maxHuespedes} plazas)
                      </span>
                    </td>
                    <td style={tdR}>{p.reservas}</td>
                    <td style={tdR}>{fmtDec(p.ingresos)}</td>
                    <td style={{ ...tdR, color: p.gastos.lavanderia > 0 ? 'inherit' : 'var(--muted)' }}>
                      {p.gastos.lavanderia > 0 ? fmtDec(p.gastos.lavanderia) : '—'}
                    </td>
                    <td style={{ ...tdR, color: (p.gastos.limpieza ?? 0) > 0 ? 'inherit' : 'var(--muted)' }}>
                      {(p.gastos.limpieza ?? 0) > 0 ? fmtDec(p.gastos.limpieza) : '—'}
                    </td>
                    <td style={{ ...tdR, color: p.gastos.alquiler > 0 ? 'inherit' : 'var(--muted)' }}>
                      {p.gastos.alquiler > 0 ? fmtDec(p.gastos.alquiler) : '—'}
                    </td>
                    <td style={{ ...tdR, color: p.gastos.suministros > 0 ? 'inherit' : 'var(--muted)' }}>
                      {p.gastos.suministros > 0 ? fmtDec(p.gastos.suministros) : '—'}
                    </td>
                    <td style={{ ...tdR, color: p.gastos.comunidad > 0 ? 'inherit' : 'var(--muted)' }}>
                      {p.gastos.comunidad > 0 ? fmtDec(p.gastos.comunidad) : '—'}
                    </td>
                    <td style={{ ...tdR, color: p.gastos.otros > 0 ? 'inherit' : 'var(--muted)' }}>
                      {p.gastos.otros > 0 ? fmtDec(p.gastos.otros) : '—'}
                    </td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmtDec(p.gastos.total)}</td>
                    <td style={{
                      ...tdR, fontWeight: 700,
                      color: p.resultado >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'
                    }}>
                      {fmtDec(p.resultado)}
                    </td>
                    <td style={{ ...tdR, fontWeight: 700, color: colorMargen(p.margen) }}>
                      {p.ingresos > 0 ? `${p.margen} %` : '—'}
                    </td>
                  </tr>
                ))}
                {/* Fila de totales */}
                {totales && (
                  <tr style={{ background: 'var(--surface-2, var(--surface))', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px' }}>TOTAL</td>
                    <td style={tdR}>—</td>
                    <td style={tdR}>{fmtDec(totales.ingresos)}</td>
                    <td style={tdR}>{totales.lavanderia > 0 ? fmtDec(totales.lavanderia) : '—'}</td>
                    <td style={tdR}>{totales.limpieza > 0 ? fmtDec(totales.limpieza) : '—'}</td>
                    <td style={tdR}>{totales.alquiler > 0 ? fmtDec(totales.alquiler) : '—'}</td>
                    <td style={tdR}>{totales.suministros > 0 ? fmtDec(totales.suministros) : '—'}</td>
                    <td style={tdR}>{totales.comunidad > 0 ? fmtDec(totales.comunidad) : '—'}</td>
                    <td style={tdR}>{totales.otros > 0 ? fmtDec(totales.otros) : '—'}</td>
                    <td style={tdR}>{fmtDec(totales.totalGastos)}</td>
                    <td style={{
                      ...tdR,
                      color: totales.resultado >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'
                    }}>
                      {fmtDec(totales.resultado)}
                    </td>
                    <td style={{
                      ...tdR,
                      color: colorMargen(totales.ingresos > 0 ? Math.round((totales.resultado / totales.ingresos) * 100) : 0)
                    }}>
                      {totales.ingresos > 0 ? `${Math.round((totales.resultado / totales.ingresos) * 100)} %` : '—'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
            Lavandería (El Giraldillo) repartida por capacidad × reservas. El pago a Sique Brilla se desglosa con
            la estructura de su factura: Limpieza = salidas del mes facturado (el anterior al pago) × tarifa por
            piso con IVA (Busto 20€ · Dúplex 25€ · Luxury 28€ · House 90€), y el resto del pago es su lavandería
            por peso, repartida por capacidad × reservas del mes facturado. Todo por CAJA del mes (si un mes se
            pagan dos facturas, salen las dos). Costes directos desde tabla de gastos.
            Los gastos sin asignar a piso (EMASESA, etc.) no están incluidos aún.
          </p>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <th style={{
      padding: '8px 8px', fontWeight: 600, fontSize: 12,
      textAlign: left ? 'left' : 'right',
      whiteSpace: 'nowrap', color: 'var(--muted)',
    }}>
      {children}
    </th>
  )
}

const tdR: React.CSSProperties = { padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }
