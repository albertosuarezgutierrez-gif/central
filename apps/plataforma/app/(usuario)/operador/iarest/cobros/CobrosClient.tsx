'use client'
import { useEffect, useState } from 'react'
import { eur } from '@/lib/dinero'
import { Pagina } from '@/components/ui'

type Restaurante = {
  nombre: string
  ciudad?: string
  volumen_mes_actual?: number
  comision_mes_actual?: number
  volumen_anio?: number
  comision_anio?: number
  txn_mes_actual?: number
  plan?: string
}
type Totales = {
  volumen_mes: number
  comision_mes: number
  volumen_anio: number
  comision_anio: number
  txn_mes: number
}
type Historico = { mes: string; volumen: number; comision: number; txn: number }

export default function CobrosClient() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [totales, setTotales] = useState<Totales | null>(null)
  const [historico, setHistorico] = useState<Historico[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/iarest/cobros')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setRestaurantes(d.restaurantes ?? [])
        setTotales(d.totales ?? null)
        setHistorico(d.historico ?? [])
      })
      .catch(e => setError(`Error cargando cobros (${e})`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>

  return (
    <Pagina ancho="tabla">
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '24px' }}>💶 Cobros · ia-rest</h1>

      {totales && (
        <div className="cobros-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {[
            { label: 'Volumen mes', val: eur(totales.volumen_mes) },
            { label: 'Comisión mes', val: eur(totales.comision_mes) },
            { label: 'Transacciones mes', val: String(totales.txn_mes) },
            { label: 'Volumen año', val: eur(totales.volumen_anio) },
            { label: 'Comisión año', val: eur(totales.comision_anio) },
          ].map(k => (
            <div key={k.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '16px',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{k.val}</div>
            </div>
          ))}
        </div>
      )}

      {restaurantes.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Por restaurante</h2>
          <div className="cobros-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Restaurante', 'Plan', 'Vol. mes', 'Com. mes', 'Txn mes', 'Vol. año', 'Com. año'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restaurantes.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.nombre}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{r.plan || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{eur(r.volumen_mes_actual || 0)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--primary)' }}>{eur(r.comision_mes_actual || 0)}</td>
                    <td style={{ padding: '10px 12px' }}>{r.txn_mes_actual || 0}</td>
                    <td style={{ padding: '10px 12px' }}>{eur(r.volumen_anio || 0)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--primary)' }}>{eur(r.comision_anio || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Histórico mensual (12 meses)</h2>
          <div className="cobros-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Mes', 'Volumen', 'Comisión', 'Transacciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historico.map(h => (
                  <tr key={h.mes} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{h.mes}</td>
                    <td style={{ padding: '10px 12px' }}>{eur(h.volumen)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--primary)' }}>{eur(h.comision)}</td>
                    <td style={{ padding: '10px 12px' }}>{h.txn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {restaurantes.length === 0 && !loading && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px' }}>Sin datos de cobros.</p>
      )}
    </Pagina>
  )
}
