'use client'
import { useState, useEffect, useCallback } from 'react'
import { eur } from '@/lib/dinero'

interface PLGastosPiso {
  lavanderia: number
  lavanderiaDetalle?: { giraldillo: number; siqueBrilla: number }
  limpieza: number
  alquiler: number
  suministros: number
  comunidad: number
  otros: number
  total: number
}
interface PagoLimpieza {
  importe: number
  origen: 'factura' | 'ajuste' | 'proporcional' | 'partes_iguales'
  factura: string | null
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
interface PLMensual {
  mes: string
  pisos: PLPiso[]
  desglose?: { pagos: PagoLimpieza[]; sinDesglosar: number }
}

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

          <DesgloseLimpieza desglose={data.desglose} onCambio={() => load(mes)} />

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
                    <td
                      style={{ ...tdR, color: p.gastos.lavanderia > 0 ? 'inherit' : 'var(--muted)' }}
                      title={detalleLavanderia(p.gastos)}
                    >
                      {p.gastos.lavanderia > 0 ? fmtDec(p.gastos.lavanderia) : '—'}
                      {p.gastos.lavanderiaDetalle && p.gastos.lavanderia > 0 && (
                        <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {p.gastos.lavanderiaDetalle.giraldillo > 0 && `Giraldillo ${fmtDec(p.gastos.lavanderiaDetalle.giraldillo)}`}
                          {p.gastos.lavanderiaDetalle.giraldillo > 0 && p.gastos.lavanderiaDetalle.siqueBrilla > 0 && ' · '}
                          {p.gastos.lavanderiaDetalle.siqueBrilla > 0 && `S. Brilla ${fmtDec(p.gastos.lavanderiaDetalle.siqueBrilla)}`}
                        </div>
                      )}
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
            Toda lavandería (El Giraldillo o la incluida en la factura de Sique Brilla) se reparte por
            capacidad × reservas del mes; bajo cada importe se ve de cuál viene. Cada pago a Sique Brilla se
            desglosa con SU FACTURA cuando está aportada (y solo si sus líneas cuadran con el total); si no,
            se estima con la estructura conocida de la factura: Limpieza = salidas del mes facturado × tarifa
            por piso (tarifas sin IVA: Busto 20€ · Dúplex 25€ · Luxury 28€ · House 90€; la tabla muestra los
            importes CON IVA, como el resto de columnas), y el resto del pago es su lavandería (el mes
            facturado es el que mejor ajusta al importe: el anterior al pago o el mismo). El recuadro de
            arriba dice, pago a pago, si el desglose está medido o estimado.
            Todo por CAJA del mes (si un mes se pagan dos facturas, salen las dos).
            Costes directos desde tabla de gastos.
            Los gastos sin asignar a piso (EMASESA, etc.) no están incluidos aún.
          </p>
        </>
      )}
    </div>
  )
}

function detalleLavanderia(g: PLGastosPiso): string {
  if (!g.lavanderiaDetalle || g.lavanderia <= 0) return ''
  const { giraldillo, siqueBrilla } = g.lavanderiaDetalle
  const partes = []
  if (giraldillo > 0) partes.push(`El Giraldillo: ${eur(giraldillo)}`)
  if (siqueBrilla > 0) partes.push(`Incluida en la factura de Sique Brilla: ${eur(siqueBrilla)}`)
  // Lo imputado por factura directa al piso (tabla de gastos) no pasa por el reparto.
  const repartido = giraldillo + siqueBrilla
  if (g.lavanderia - repartido > 0.01) partes.push(`Facturas del piso: ${eur(g.lavanderia - repartido)}`)
  return partes.join(' · ')
}

/**
 * De dónde sale el desglose de cada pago a Sique Brilla, y qué hacer si no se ha podido hacer.
 * Un pago repartido «a ojo» y uno leído de su factura NO pueden verse igual: la tabla enseña
 * números plausibles en los dos casos, y solo aquí se distingue lo medido de lo inferido.
 */
function DesgloseLimpieza({ desglose, onCambio }: { desglose?: PLMensual['desglose']; onCambio: () => void }) {
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  if (!desglose || (!desglose.pagos.length && !desglose.sinDesglosar)) return null

  const conFactura = desglose.pagos.filter(p => p.origen === 'factura')
  const inferidos = desglose.pagos.filter(p => p.origen === 'ajuste')
  const aOjo = desglose.pagos.filter(p => p.origen === 'proporcional' || p.origen === 'partes_iguales')

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSubiendo(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('fichero', f)
      const r = await fetch('/api/sivra/facturas-limpieza', { method: 'POST', body: fd })
      const j = await r.json()
      if (j.guardada) {
        setMsg({ tipo: 'ok', texto: `Factura ${j.factura?.numero ?? ''} leída y aplicada al P&L.` })
        onCambio()
      } else {
        setMsg({ tipo: 'error', texto: j.motivo ?? j.error ?? 'No se ha podido leer la factura.' })
      }
    } catch {
      setMsg({ tipo: 'error', texto: 'Error de red subiendo la factura.' })
    } finally {
      setSubiendo(false)
    }
  }

  const degradado = aOjo.length > 0
  return (
    <div style={{
      border: `1px solid ${degradado ? 'var(--warning, #ca8a04)' : 'var(--border)'}`,
      background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>🧹 Desglose de la limpieza de este mes</div>
      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: 'var(--muted)' }}>
        {conFactura.map((p, i) => (
          <li key={`f${i}`}>
            ✅ {eur(p.importe)} — desglosado con su <strong>factura</strong>{p.factura ? ` (nº ${p.factura})` : ''}.
          </li>
        ))}
        {inferidos.map((p, i) => (
          <li key={`a${i}`}>
            📐 {eur(p.importe)} — <strong>estimado</strong> por salidas × tarifa (no consta la factura).
          </li>
        ))}
        {aOjo.map((p, i) => (
          <li key={`o${i}`} style={{ color: 'var(--warning, #ca8a04)' }}>
            ⚠️ {eur(p.importe)} — <strong>no se ha podido desglosar</strong>: repartido en proporción, sin
            afirmar cuánto es limpieza de cada piso ni cuánto lavandería.
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{
          display: 'inline-block', padding: '8px 12px', minHeight: 44, lineHeight: '28px',
          border: '1px solid var(--border)', borderRadius: 8, cursor: subiendo ? 'wait' : 'pointer',
          background: 'var(--surface-2, var(--surface))',
        }}>
          {subiendo ? 'Leyendo la factura…' : '📄 Aportar factura de Sique Brilla'}
          <input type="file" accept="application/pdf,image/*" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
        </label>
        {msg && (
          <span style={{ color: msg.tipo === 'ok' ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
            {msg.texto}
          </span>
        )}
      </div>
      {(degradado || inferidos.length > 0) && (
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Con la factura delante el desglose deja de ser una estimación: se leen sus líneas y solo se
          aplica si cuadran con el total de la factura.
        </p>
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
