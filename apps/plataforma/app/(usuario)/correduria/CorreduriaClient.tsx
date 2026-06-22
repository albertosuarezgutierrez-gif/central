'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function mesKey(año: number, mesIdx: number) {
  return `${año}-${String(mesIdx + 1).padStart(2, '0')}`
}

interface Fila {
  compania: string
  meses: Record<string, number>
  total: number
}

export default function CorreduriaClient() {
  const añoActual = new Date().getFullYear()
  const [año, setAño] = useState(añoActual)
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/correduria?año=${año}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar datos'); return r.json() })
      .then(d => { setFilas(d.filas || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [año])

  const totalAnual = filas.reduce((s, f) => s + f.total, 0)
  const totalesMes = MESES.map((_, i) => {
    const key = mesKey(año, i)
    return filas.reduce((s, f) => s + (f.meses[key] ?? 0), 0)
  })
  const mejorMesIdx = totalesMes.length ? totalesMes.indexOf(Math.max(...totalesMes)) : 0
  const compañiasActivas = filas.length

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 768px) {
          .corr-header { flex-direction: column !important; align-items: flex-start !important; }
          .corr-kpis { grid-template-columns: 1fr 1fr !important; }
          .corr-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
        @media (max-width: 480px) {
          .corr-kpis { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div className="corr-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>🛡️ Correduría de seguros</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Liquidaciones de comisiones por compañía aseguradora · Auto-actualizado desde banca
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setAño(a => a - 1)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16 }}
          >←</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 50, textAlign: 'center', color: 'var(--text)' }}>{año}</span>
          <button
            onClick={() => setAño(a => a + 1)}
            disabled={año >= añoActual}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16, opacity: año >= añoActual ? 0.35 : 1 }}
          >→</button>
        </div>
      </div>

      {/* KPIs */}
      {!loading && !error && totalAnual > 0 && (
        <div className="corr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total cobrado', value: `€${fmt(totalAnual)}`, color: 'var(--primary)' },
            { label: 'Compañías activas', value: String(compañiasActivas), color: 'var(--text)' },
            { label: 'Mejor mes', value: totalAnual > 0 ? `${MESES[mejorMesIdx]} (€${fmt(totalesMes[mejorMesIdx])})` : '—', color: 'var(--text)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted)' }}>Cargando liquidaciones…</div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626', marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin liquidaciones en {año}</div>
          <div style={{ fontSize: 13 }}>Los datos se actualizan automáticamente con los movimientos bancarios clasificados como correduría.</div>
        </div>
      )}

      {/* Matrix table */}
      {!loading && !error && filas.length > 0 && (
        <div className="corr-table-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text)', position: 'sticky', left: 0, background: 'rgba(248,249,250,1)' }}>
                  Compañía
                </th>
                {MESES.map(m => (
                  <th key={m} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)', minWidth: 60 }}>{m}</th>
                ))}
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', borderLeft: '2px solid var(--border)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.compania} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface)' }}>
                    {f.compania}
                  </td>
                  {MESES.map((_, i) => {
                    const val = f.meses[mesKey(año, i)] ?? 0
                    return (
                      <td key={i} style={{ padding: '10px 10px', textAlign: 'right', color: val > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {val > 0 ? `€${fmt(val)}` : '—'}
                      </td>
                    )
                  })}
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', borderLeft: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                    €{fmt(f.total)}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ background: 'rgba(0,0,0,.03)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, background: 'rgba(248,249,250,1)' }}>
                  Total
                </td>
                {totalesMes.map((t, i) => (
                  <td key={i} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: t > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {t > 0 ? `€${fmt(t)}` : '—'}
                  </td>
                ))}
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: 15, borderLeft: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                  €{fmt(totalAnual)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>Datos calculados de los movimientos bancarios con destino «correduría de seguros».</span>
        <Link href="/finanzas" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Ver resumen financiero →</Link>
      </div>
    </div>
  )
}
