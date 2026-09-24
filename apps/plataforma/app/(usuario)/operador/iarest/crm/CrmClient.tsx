'use client'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui'
import { Target } from 'lucide-react'

type Contacto = {
  id: string
  lead_id: string
  nombre: string | null
  cargo: string | null
  telefono: string | null
  email: string | null
  es_decisor: boolean | null
  canal_preferido: string | null
}

type Lead = {
  id: string
  nombre: string | null
  restaurante: string | null
  empresa: string | null
  ciudad: string | null
  web: string | null
  telefono: string | null
  email: string | null
  estado: string | null
  score: number | null
  tpv: string | null
  locales: number | null
  notas: string | null
  created_at: string
  updated_at: string
  contactos: Contacto[]
}

type Totales = {
  total: number
  por_estado: Record<string, number>
}

type Data = { leads: Lead[]; totales: Totales }

const ESTADO_COLORES: Record<string, { bg: string; color: string }> = {
  nuevo: { bg: '#2563eb20', color: 'var(--info)' },
  contactado: { bg: '#7c3aed20', color: '#7c3aed' },
  interesado: { bg: '#d9770620', color: 'var(--warning)' },
  demo: { bg: '#0891b220', color: '#0891b2' },
  propuesta: { bg: '#65a30d20', color: '#65a30d' },
  negociacion: { bg: '#ea580c20', color: 'var(--warning)' },
  cliente: { bg: '#16a34a20', color: 'var(--positive)' },
  descartado: { bg: '#94a3b820', color: 'var(--muted)' },
}

function estadoBadge(estado: string | null) {
  const e = estado ?? 'sin_estado'
  const c = ESTADO_COLORES[e] ?? { bg: '#94a3b820', color: 'var(--muted)' }
  return (
    <span style={{
      fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
      background: c.bg, color: c.color, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{e}</span>
  )
}

function scoreBadge(score: number | null) {
  if (score === null) return <span style={{ color: 'var(--muted)' }}>—</span>
  const color = score >= 70 ? 'var(--positive)' : score >= 40 ? 'var(--warning)' : 'var(--negative)'
  return <span style={{ fontWeight: 700, color }}>{score}</span>
}

const fecha = (s: string) =>
  new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

const ESTADOS_ORDEN = ['nuevo', 'contactado', 'interesado', 'demo', 'propuesta', 'negociacion', 'cliente', 'descartado']

export default function CrmClient() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/iarest/crm')
      .then(async r => {
        if (r.ok) return r.json()
        const body = await r.json().catch(() => null)
        throw new Error(body?.error || `HTTP ${r.status}`)
      })
      .then(setData)
      .catch(e => setError(`Error cargando CRM: ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>
  if (!data) return null

  const { leads, totales } = data

  const leadsFiltrados = leads.filter(l => {
    if (filtroEstado !== 'todos' && l.estado !== filtroEstado) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      return (
        l.nombre?.toLowerCase().includes(q) ||
        l.restaurante?.toLowerCase().includes(q) ||
        l.empresa?.toLowerCase().includes(q) ||
        l.ciudad?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      <PageHeader
        titulo="CRM · ia-rest"
        icono={<Target size={20} strokeWidth={1.75} />}
        acciones={
          <a href="https://iarest.es/super" target="_blank" rel="noreferrer"
            style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}>Panel legacy ↗</a>
        }
      />

      {/* KPIs por estado */}
      <div className="crm-filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button
          onClick={() => setFiltroEstado('todos')}
          style={{
            padding: '6px 14px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
            border: '1px solid var(--border)',
            background: filtroEstado === 'todos' ? 'var(--primary)' : 'var(--surface)',
            color: filtroEstado === 'todos' ? '#fff' : 'var(--text)',
            fontWeight: filtroEstado === 'todos' ? 700 : 400,
          }}
        >
          Todos ({totales.total})
        </button>
        {ESTADOS_ORDEN.filter(e => totales.por_estado[e]).map(e => {
          const c = ESTADO_COLORES[e] ?? { bg: '#94a3b820', color: 'var(--muted)' }
          const activo = filtroEstado === e
          return (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              style={{
                padding: '6px 14px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
                border: `1px solid ${c.color}40`,
                background: activo ? c.color : c.bg,
                color: activo ? '#fff' : c.color,
                fontWeight: activo ? 700 : 600,
              }}
            >
              {e} ({totales.por_estado[e]})
            </button>
          )
        })}
      </div>

      {/* Buscador */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Buscar por nombre, restaurante, empresa, ciudad o email…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            background: 'var(--surface)', color: 'var(--text)',
          }}
        />
      </div>

      {/* Tabla */}
      <div className="crm-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre / Restaurante', 'Ciudad', 'Estado', 'Score', 'Locales', 'Contactos', 'Fecha', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leadsFiltrados.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                  Sin resultados
                </td>
              </tr>
            )}
            {leadsFiltrados.map(l => (
              <>
                <tr key={l.id} style={{ borderBottom: expandido === l.id ? 'none' : '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{l.nombre || l.restaurante || '—'}</div>
                    {l.nombre && l.restaurante && (
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{l.restaurante}</div>
                    )}
                    {l.empresa && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{l.empresa}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{l.ciudad || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{estadoBadge(l.estado)}</td>
                  <td style={{ padding: '8px 12px' }}>{scoreBadge(l.score)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{l.locales ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{l.contactos.length || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(l.created_at)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {(l.contactos.length > 0 || l.notas) && (
                      <button
                        onClick={() => setExpandido(expandido === l.id ? null : l.id)}
                        style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--muted)', cursor: 'pointer',
                        }}
                      >
                        {expandido === l.id ? '▲' : '▼'}
                      </button>
                    )}
                  </td>
                </tr>
                {expandido === l.id && (
                  <tr key={`${l.id}-detail`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <td colSpan={8} style={{ padding: '12px 20px' }}>
                      {l.notas && (
                        <div style={{ marginBottom: l.contactos.length > 0 ? '12px' : 0, fontSize: '13px', color: 'var(--text)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--muted)' }}>Notas: </span>{l.notas}
                        </div>
                      )}
                      {l.contactos.length > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Contactos
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                            {l.contactos.map(c => (
                              <div key={c.id} style={{ background: 'var(--bg, #fff)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px' }}>
                                <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                  {c.nombre || '—'}
                                  {c.es_decisor && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#16a34a20', color: 'var(--positive)', padding: '1px 5px', borderRadius: '4px' }}>decisor</span>}
                                </div>
                                {c.cargo && <div style={{ color: 'var(--muted)' }}>{c.cargo}</div>}
                                {c.email && <div style={{ color: 'var(--muted)' }}>{c.email}</div>}
                                {c.telefono && <div style={{ color: 'var(--muted)' }}>{c.telefono}</div>}
                                {c.canal_preferido && <div style={{ color: 'var(--muted)' }}>Canal: {c.canal_preferido}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>
        {leadsFiltrados.length} de {leads.length} leads
      </div>
    </main>
  )
}
