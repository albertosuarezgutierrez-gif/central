'use client'
import { useEffect, useState } from 'react'
import { Pagina, PageHeader } from '@/components/ui'
import { Microscope } from 'lucide-react'

type QARun = {
  id: string
  trigger: string
  modo: string | null
  total: number
  ok: number
  warnings: number
  fallidos: number
  criticos: number
  score: number | null
  duracion_ms: number | null
  telegram_enviado: boolean
  created_at: string
}

type TrainingGlobal = {
  total_samples: number
  corregidos: number
  avg_calidad: number
  avg_confianza: number
}

type FuenteStat = {
  fuente: string
  total: number
  avg_calidad: number
}

const fecha = (s: string) =>
  new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function scoreColor(score: number | null) {
  if (score === null) return 'var(--muted)'
  if (score >= 90) return 'var(--positive)'
  if (score >= 75) return 'var(--warning)'
  return 'var(--negative)'
}

export default function SistemaClient() {
  const [data, setData] = useState<{ qa: { runs: QARun[] }; training: { global: TrainingGlobal | null; porFuente: FuenteStat[] } } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/iarest/sistema')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(e => setError(`Error cargando sistema (${e})`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>
  if (!data) return null

  const { qa, training } = data
  const lastRun = qa.runs[0]

  return (
    <Pagina ancho="tabla">
      <PageHeader
        titulo="Sistema · ia-rest"
        icono={<Microscope size={20} strokeWidth={1.75} />}
        acciones={
          <a href="https://iarest.es/super" target="_blank" rel="noreferrer"
            style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}>Panel legacy ↗</a>
        }
      />

      {/* QA */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
          QA Runs (últimos 20)
        </div>
        {lastRun && (
          <div className="sistema-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Score', val: lastRun.score !== null ? `${lastRun.score}%` : '—', color: scoreColor(lastRun.score) },
              { label: 'OK', val: String(lastRun.ok), color: 'var(--positive)' },
              { label: 'Warnings', val: String(lastRun.warnings), color: 'var(--warning)' },
              { label: 'Fallidos', val: String(lastRun.fallidos), color: 'var(--negative)' },
              { label: 'Críticos', val: String(lastRun.criticos), color: '#7c3aed' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label} (último)</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>
        )}

        <div className="sistema-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Fecha', 'Trigger', 'Score', 'OK / Warn / Fail', 'Duración'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {qa.runs.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(r.created_at)}</td>
                  <td style={{ padding: '8px 12px' }}>{r.trigger}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontWeight: 700, color: scoreColor(r.score) }}>
                      {r.score !== null ? `${r.score}%` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ color: 'var(--positive)' }}>{r.ok}</span>
                    {' / '}
                    <span style={{ color: 'var(--warning)' }}>{r.warnings}</span>
                    {' / '}
                    <span style={{ color: 'var(--negative)' }}>{r.fallidos}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                    {r.duracion_ms ? `${(r.duracion_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Training */}
      {training.global && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Training IA
          </div>
          <div className="sistema-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Total muestras', val: String(training.global.total_samples ?? 0) },
              { label: 'Corregidos', val: String(training.global.corregidos ?? 0) },
              { label: 'Calidad media', val: training.global.avg_calidad ? `${Number(training.global.avg_calidad).toFixed(1)}/5` : '—' },
              { label: 'Confianza media', val: training.global.avg_confianza ? `${(Number(training.global.avg_confianza) * 100).toFixed(0)}%` : '—' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{k.val}</div>
              </div>
            ))}
          </div>

          {training.porFuente.length > 0 && (
            <div className="sistema-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Fuente', 'Muestras', 'Calidad media'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {training.porFuente.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px' }}>{f.fuente}</td>
                      <td style={{ padding: '8px 12px' }}>{f.total}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{f.avg_calidad ? `${Number(f.avg_calidad).toFixed(1)}/5` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Pagina>
  )
}
