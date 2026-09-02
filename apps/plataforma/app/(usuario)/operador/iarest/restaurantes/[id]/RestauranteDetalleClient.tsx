'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { eur } from '@/lib/dinero'
import { PageHeader } from '@/components/ui'

type Restaurante = {
  id: string
  nombre: string
  nombre_comercial: string | null
  slug: string
  codigo_acceso: string
  plan: string
  plan_status: string | null
  activo: boolean
  ciudad: string | null
  nif: string | null
  razon_social: string | null
  created_at: string
  trial_end: string | null
  max_camareros: number | null
}

type Stats = {
  camareros: number
  mesas: number
  comandas_hoy: number
  ingresos_mes: number
  facturas: number
  ultima_comanda: string | null
}

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const fechaCorta = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function RestauranteDetalleClient({ id }: { id: string }) {
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/admin/iarest/restaurantes/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setRestaurante(d.restaurante); setStats(d.stats) })
      .catch(e => setError(`Error cargando restaurante (${e})`))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>
  if (!restaurante) return null

  const PLANES: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' }

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px' }}>
        <Link href="/operador/iarest/restaurantes" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          ← Restaurantes
        </Link>
      </div>

      <PageHeader
        titulo={restaurante.nombre}
        sub={
          restaurante.nombre_comercial && restaurante.nombre_comercial !== restaurante.nombre
            ? restaurante.nombre_comercial
            : undefined
        }
        acciones={
          <span style={{
            fontSize: '13px', fontWeight: 600, padding: '4px 12px', borderRadius: '8px',
            background: restaurante.activo ? '#16a34a20' : '#94a3b820',
            color: restaurante.activo ? 'var(--positive)' : 'var(--muted)',
          }}>
            {restaurante.activo ? 'Activo' : 'Inactivo'}
          </span>
        }
      />

      {/* Stats del día */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'Personal activo', val: String(stats.camareros) },
            { label: 'Mesas', val: String(stats.mesas) },
            { label: 'Comandas hoy', val: String(stats.comandas_hoy) },
            { label: 'Ingresos mes', val: eur(stats.ingresos_mes) },
            { label: 'Facturas', val: String(stats.facturas) },
          ].map(k => (
            <div key={k.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '16px',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{k.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Config */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
          Configuración
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
          {[
            { label: 'Slug', val: restaurante.slug },
            { label: 'Plan', val: `${PLANES[restaurante.plan] ?? restaurante.plan}${restaurante.plan_status === 'trial' ? ' (trial)' : ''}` },
            { label: 'Ciudad', val: restaurante.ciudad || '—' },
            { label: 'Código acceso', val: restaurante.codigo_acceso },
            { label: 'NIF', val: restaurante.nif || '—' },
            { label: 'Razón social', val: restaurante.razon_social || '—' },
            { label: 'Máx. personal', val: restaurante.max_camareros ? String(restaurante.max_camareros) : 'Sin límite' },
            { label: 'Alta', val: fechaCorta(restaurante.created_at) },
            { label: 'Trial hasta', val: restaurante.trial_end ? fechaCorta(restaurante.trial_end) : '—' },
            { label: 'Última comanda', val: stats ? fecha(stats.ultima_comanda) : '—' },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Link legacy */}
      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <a
          href={`https://iarest.es/super`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}
        >
          Editar en panel legacy ↗
        </a>
      </div>
    </main>
  )
}
