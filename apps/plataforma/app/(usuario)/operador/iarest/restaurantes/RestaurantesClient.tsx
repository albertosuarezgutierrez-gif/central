'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Restaurante = {
  id: string
  nombre: string
  slug: string
  plan: string
  plan_status: string | null
  activo: boolean
  ciudad: string | null
  created_at: string
  trial_end: string | null
  tiene_stripe: boolean
  num_camareros: number
  num_mesas: number
  num_comandas: number
}

const PLANES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

function planBadge(plan: string, status: string | null, activo: boolean): { label: string; color: string } {
  if (!activo) return { label: 'Inactivo', color: 'var(--muted)' }
  if (status === 'trial') return { label: 'Trial', color: 'var(--warning)' }
  if (status === 'cancelado') return { label: 'Cancelado', color: 'var(--negative)' }
  return { label: PLANES[plan] ?? plan, color: 'var(--positive)' }
}

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function RestaurantesClient() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')

  useEffect(() => {
    fetch('/api/admin/iarest/restaurantes')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setRestaurantes(d.restaurantes ?? []))
      .catch(e => setError(`Error cargando restaurantes (${e})`))
      .finally(() => setLoading(false))
  }, [])

  const filtrados = buscar.trim()
    ? restaurantes.filter(r =>
        r.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
        (r.ciudad ?? '').toLowerCase().includes(buscar.toLowerCase()) ||
        r.slug.toLowerCase().includes(buscar.toLowerCase())
      )
    : restaurantes

  const activos = restaurantes.filter(r => r.activo).length

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>🍽️ Restaurantes · ia-rest</h1>
        <a
          href="https://iarest.es/super"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}
        >
          Panel legacy ↗
        </a>
      </div>

      {/* KPIs */}
      <div className="rest-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total', val: String(restaurantes.length) },
          { label: 'Activos', val: String(activos) },
          { label: 'Con Stripe', val: String(restaurantes.filter(r => r.tiene_stripe).length) },
          { label: 'En trial', val: String(restaurantes.filter(r => r.plan_status === 'trial').length) },
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

      {/* Buscador */}
      <input
        type="text"
        placeholder="Buscar por nombre, ciudad o slug…"
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', fontSize: '14px', marginBottom: '16px',
          border: '1px solid var(--border)', borderRadius: '8px',
          background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box',
        }}
      />

      {/* Tabla */}
      {filtrados.length > 0 ? (
        <div className="rest-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Restaurante', 'Plan', 'Ciudad', 'Personal', 'Mesas', 'Comandas', 'Alta', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(r => {
                const badge = planBadge(r.plan, r.plan_status, r.activo)
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{r.slug}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px',
                        background: badge.color + '20', color: badge.color,
                      }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{r.ciudad || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{r.num_camareros}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{r.num_mesas}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{r.num_comandas}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(r.created_at)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link href={`/operador/iarest/restaurantes/${r.id}`} style={{
                        fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600,
                      }}>
                        Ver →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px' }}>
          {buscar ? 'Sin resultados.' : 'No hay restaurantes.'}
        </p>
      )}
    </main>
  )
}
