'use client'
import { useEffect, useState } from 'react'
import { eur } from '@/lib/dinero'
import { Pagina } from '@/components/ui'

type Cuenta = {
  id: string
  nombre: string
  email: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_estado: string | null
  precio_mensual: number | null
  fecha_proximo_cobro: string | null
  notas_comerciales: string | null
  restaurantes?: { id: string; nombre: string }[]
}
type Totales = {
  mrr: number
  activas: number
  pendientes: number
  cancelando: number
  sin_stripe: number
}

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Color por estado de Stripe. Sin customer → "Sin Stripe".
function estadoBadge(c: Cuenta): { label: string; color: string } {
  if (!c.stripe_customer_id) return { label: 'Sin Stripe', color: 'var(--muted)' }
  switch (c.stripe_estado) {
    case 'activa':
    case 'activo':         return { label: 'Activa', color: 'var(--positive)' }
    case 'pendiente_pago': return { label: 'Pendiente pago', color: 'var(--info)' }
    case 'cancelando':     return { label: 'Cancelando', color: 'var(--warning)' }
    case 'cancelada':      return { label: 'Cancelada', color: 'var(--negative)' }
    default:               return { label: c.stripe_estado || 'Customer creado', color: 'var(--muted)' }
  }
}

export default function SuscripcionesClient() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [totales, setTotales] = useState<Totales | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/iarest/suscripciones')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setCuentas(d.cuentas ?? [])
        setTotales(d.totales ?? null)
      })
      .catch(e => setError(`Error cargando suscripciones (${e})`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>

  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>💳 Suscripciones · ia-rest</h1>
        <a
          href="https://iarest.es/super"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}
        >
          Gestionar en legacy ↗
        </a>
      </div>

      {totales && (
        <div className="suscrip-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {[
            { label: 'MRR', val: eur(totales.mrr) },
            { label: 'Activas', val: String(totales.activas) },
            { label: 'Pendientes pago', val: String(totales.pendientes) },
            { label: 'Cancelando', val: String(totales.cancelando) },
            { label: 'Sin Stripe', val: String(totales.sin_stripe) },
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

      {cuentas.length > 0 ? (
        <div className="suscrip-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Cuenta', 'Estado', 'Precio/mes', 'Próximo cobro', 'Restaurantes'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuentas.map(c => {
                const b = estadoBadge(c)
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                      {c.email && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px',
                        background: b.color + '20', color: b.color,
                      }}>{b.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{c.precio_mensual ? eur(c.precio_mensual) : '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{fecha(c.fecha_proximo_cobro)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                      {(c.restaurantes ?? []).map(r => r.nombre).join(', ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px' }}>Sin cuentas con suscripción.</p>
      )}
    </Pagina>
  )
}
