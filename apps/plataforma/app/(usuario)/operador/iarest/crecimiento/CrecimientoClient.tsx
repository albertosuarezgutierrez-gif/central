'use client'
import { useEffect, useState } from 'react'
import { Pagina } from '@/components/ui'

type Post = { id: string; titulo: string | null; caption: string | null; estado: string; tipo: string; alcance: number | null; likes: number | null; created_at: string }
type Borrador = { id: string; titulo: string | null; plantilla: string | null; tema_elegido: string | null; estado: string; created_at: string }
type BlogEntry = { id: string; titulo: string; slug: string; keyword: string | null; estado: string; created_at: string }
type LandingLead = { id: string; fuente: string | null; nombre: string | null; email: string | null; created_at: string }

type Data = {
  instagram: { posts: Post[]; borradores: Borrador[]; resumen: { publicados: number; totalAlcance: number; totalLikes: number } }
  blog: { borradores: BlogEntry[] }
  landing: { leads: LandingLead[] }
}

const fecha = (s: string) =>
  new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

type Tab = 'instagram' | 'blog' | 'landing'

export default function CrecimientoClient() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('instagram')

  useEffect(() => {
    fetch('/api/admin/iarest/crecimiento')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(e => setError(`Error cargando crecimiento (${e})`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: '32px', color: 'var(--muted)' }}>Cargando…</p>
  if (error) return <p style={{ padding: '32px', color: '#e53' }}>{error}</p>
  if (!data) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'instagram', label: '📸 Instagram' },
    { key: 'blog', label: '✍️ Blog' },
    { key: 'landing', label: '🎯 Leads landing' },
  ]

  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>📈 Crecimiento · ia-rest</h1>
        <a href="https://iarest.es/super" target="_blank" rel="noreferrer"
          style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}>Panel legacy ↗</a>
      </div>

      {/* Tabs */}
      <div className="crec-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', fontSize: '14px', fontWeight: tab === t.key ? 700 : 400,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === t.key ? 'var(--primary)' : 'var(--muted)',
            borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Instagram */}
      {tab === 'instagram' && (
        <div>
          <div className="crec-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '24px' }}>
            {[
              { label: 'Publicados', val: String(data.instagram.resumen.publicados) },
              { label: 'Alcance total', val: String(data.instagram.resumen.totalAlcance) },
              { label: 'Likes total', val: String(data.instagram.resumen.totalLikes) },
              { label: 'Borradores pendientes', val: String(data.instagram.borradores.length) },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{k.val}</div>
              </div>
            ))}
          </div>

          {data.instagram.borradores.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Borradores pendientes</div>
              <div className="crec-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Título', 'Plantilla', 'Tema', 'Fecha'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{data.instagram.borradores.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.titulo || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{b.plantilla || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{b.tema_elegido || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(b.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Últimos posts</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Título', 'Estado', 'Alcance', 'Likes', 'Fecha'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>{data.instagram.posts.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.titulo || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: p.estado === 'publicado' ? '#16a34a20' : '#94a3b820', color: p.estado === 'publicado' ? 'var(--positive)' : 'var(--muted)', fontWeight: 600 }}>{p.estado}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{p.alcance ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{p.likes ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(p.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Blog */}
      {tab === 'blog' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {['Título', 'Keyword', 'Estado', 'Fecha'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>{data.blog.borradores.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.titulo}</td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{b.keyword || '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: b.estado === 'publicado' ? '#16a34a20' : '#2563eb20', color: b.estado === 'publicado' ? 'var(--positive)' : 'var(--info)', fontWeight: 600 }}>{b.estado}</span>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(b.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Leads landing */}
      {tab === 'landing' && (
        <div>
          <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--muted)' }}>{data.landing.leads.length} leads (últimos 50)</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Nombre', 'Email', 'Fuente', 'Fecha'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>{data.landing.leads.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.nombre || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{l.email || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{l.fuente || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha(l.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </Pagina>
  )
}
