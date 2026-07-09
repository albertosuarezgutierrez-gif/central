'use client'
import { useEffect, useState, useCallback } from 'react'
import { eur } from '@/lib/dinero'

interface FiscalRow {
  propertyId: string
  propertyName: string
  trimestre: number
  ingresos: number
  reservas: number
  noches: number
  gastos100: number
  gastosProp: number
  gastosAlquiler: number
  totalGastos: number
  resultadoNeto: number
  desglose: Record<string, number>
}

const TRIMESTRE_LABELS = ['', 'T1 (Ene–Mar)', 'T2 (Abr–Jun)', 'T3 (Jul–Sep)', 'T4 (Oct–Dic)']


function downloadCSV(year: number, rows: FiscalRow[]) {
  const header = [
    'Propiedad', 'Trimestre', 'Ingresos brutos',
    'Gastos 100% deducibles', 'Gastos proporcionales', 'Gastos alquiler',
    'Total gastos deducibles', 'Resultado neto',
    'Reservas', 'Noches',
  ]
  const lines = rows.map(r => [
    r.propertyName,
    TRIMESTRE_LABELS[r.trimestre],
    r.ingresos,
    r.gastos100,
    r.gastosProp,
    r.gastosAlquiler,
    r.totalGastos,
    r.resultadoNeto,
    r.reservas,
    r.noches,
  ].join(';'))
  const csv = [header.join(';'), ...lines].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fiscal_irpf_${year}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FiscalPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<FiscalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/sivra/fiscal?year=${year}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setRows(data.rows || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  // Group by property
  const byProp: Record<string, FiscalRow[]> = {}
  for (const r of rows) {
    if (!byProp[r.propertyId]) byProp[r.propertyId] = []
    byProp[r.propertyId].push(r)
  }

  // Totals per property
  function propTotals(prows: FiscalRow[]) {
    return prows.reduce((acc, r) => ({
      ingresos: acc.ingresos + r.ingresos,
      totalGastos: acc.totalGastos + r.totalGastos,
      resultadoNeto: acc.resultadoNeto + r.resultadoNeto,
      reservas: acc.reservas + r.reservas,
      noches: acc.noches + r.noches,
    }), { ingresos: 0, totalGastos: 0, resultadoNeto: 0, reservas: 0, noches: 0 })
  }

  // Grand totals
  const grand = rows.reduce((acc, r) => ({
    ingresos: acc.ingresos + r.ingresos,
    totalGastos: acc.totalGastos + r.totalGastos,
    resultadoNeto: acc.resultadoNeto + r.resultadoNeto,
  }), { ingresos: 0, totalGastos: 0, resultadoNeto: 0 })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 768px) {
          .fiscal-header { flex-direction: column !important; align-items: flex-start !important; }
          .fiscal-header-actions { flex-direction: row !important; flex-wrap: wrap !important; }
          .fiscal-grand-grid { grid-template-columns: 1fr !important; }
          .fiscal-prop-summary { flex-direction: column !important; align-items: flex-start !important; gap: 4px !important; }
          .fiscal-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        }
      `}</style>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>💶</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Declaración IRPF completa</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Base imponible, tramos, deducciones y cuota estimada →{' '}
            <a href="/finanzas" style={{ color: 'var(--primary)' }}>Ver en Finanzas ↗</a>
          </div>
        </div>
      </div>
      {/* Header */}
      <div className="fiscal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Fiscal IRPF</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Rendimientos de capital inmobiliario por propiedad y trimestre
          </p>
        </div>
        <div className="fiscal-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => downloadCSV(year, rows)}
            disabled={rows.length === 0}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff',
              opacity: rows.length === 0 ? 0.5 : 1,
            }}
          >
            Descargar CSV
          </button>
        </div>
      </div>

      {/* Grand totals */}
      {rows.length > 0 && (
        <div className="fiscal-grand-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Ingresos brutos', value: `${eur(grand.ingresos)}`, color: 'var(--text)' },
            { label: 'Gastos deducibles', value: `${eur(grand.totalGastos)}`, color: '#ef4444' },
            { label: 'Resultado neto', value: `${eur(grand.resultadoNeto)}`, color: grand.resultadoNeto >= 0 ? '#22c55e' : '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label} {year}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>Cargando datos fiscales…</div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626', marginBottom: 24 }}>
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
          No hay datos fiscales para {year}.
        </div>
      )}

      {/* Per-property tables */}
      {!loading && Object.entries(byProp).map(([pid, prows]) => {
        const totals = propTotals(prows)
        const propName = prows[0].propertyName || pid
        return (
          <div key={pid} style={{ marginBottom: 32 }}>
            <div className="fiscal-prop-summary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{propName}</h2>
              <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--muted)' }}>
                <span>Ingresos: <strong style={{ color: 'var(--text)' }}>{eur(totals.ingresos)}</strong></span>
                <span>Gastos: <strong style={{ color: '#ef4444' }}>{eur(totals.totalGastos)}</strong></span>
                <span>Neto: <strong style={{ color: totals.resultadoNeto >= 0 ? '#22c55e' : '#ef4444' }}>{eur(totals.resultadoNeto)}</strong></span>
              </div>
            </div>

            <div className="fiscal-table-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,.03)', borderBottom: '1px solid var(--border)' }}>
                    {['Trimestre', 'Ingresos brutos', 'Gastos 100%', 'Gastos prop.', 'Gastos alquiler', 'Total gastos', 'Resultado neto', 'Reservas', 'Noches'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prows.sort((a, b) => a.trimestre - b.trimestre).map(r => (
                    <tr key={r.trimestre} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {TRIMESTRE_LABELS[r.trimestre]}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text)' }}>{eur(r.ingresos)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{eur(r.gastos100)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{eur(r.gastosProp)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{eur(r.gastosAlquiler)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#ef4444' }}>{eur(r.totalGastos)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: r.resultadoNeto >= 0 ? '#22c55e' : '#ef4444' }}>
                        {eur(r.resultadoNeto)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{r.reservas}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{r.noches}</td>
                    </tr>
                  ))}
                  {/* Property total row */}
                  <tr style={{ background: 'rgba(0,0,0,.02)', fontWeight: 700 }}>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 12 }}>TOTAL {year}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text)' }}>{eur(totals.ingresos)}</td>
                    <td colSpan={3} />
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#ef4444' }}>{eur(totals.totalGastos)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: totals.resultadoNeto >= 0 ? '#22c55e' : '#ef4444' }}>
                      {eur(totals.resultadoNeto)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{totals.reservas}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{totals.noches}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Desglose de gastos */}
            {prows.length > 0 && (() => {
              const desgloseAgg: Record<string, number> = {}
              for (const r of prows) {
                for (const [cat, val] of Object.entries(r.desglose)) {
                  desgloseAgg[cat] = (desgloseAgg[cat] ?? 0) + Number(val)
                }
              }
              const cats = Object.entries(desgloseAgg).sort((a, b) => b[1] - a[1])
              if (cats.length === 0) return null
              return (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {cats.map(([cat, val]) => (
                    <span key={cat} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      {cat}: <strong style={{ color: 'var(--text)' }}>{eur(Number(val))}</strong>
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        )
      })}

      {/* Note */}
      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
        <strong>Nota fiscal:</strong> Gastos 100% = deducibles en la proporción de días alquilados (limpieza, mantenimiento, plataformas, reformas, mobiliario).
        Gastos proporcionales = se aplican según días arrendados/365 (suministros, seguro, impuestos, comunidad).
        Para la declaración definitiva, consulta con tu gestor/a.
      </div>
    </div>
  )
}
