'use client'
import { useEffect, useState } from 'react'

type SeoProposal = {
  id: string
  title: string
  description: string
  ogDescription: string
  analysis: string
  currentTitle: string
  currentDescription: string
  topCompetitors: Array<{ title: string; why_ranking: string }> | null
  createdAt: string
}

export default function SeoPage() {
  const [proposals, setProposals] = useState<SeoProposal[]>([])
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [result,    setResult]    = useState<{ title?: string; analysis?: string; error?: string } | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    setLoading(true)
    try {
      const res  = await fetch('/api/sivra/seo-proposals')
      const data = await res.json()
      setProposals(data.proposals ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function runSeo() {
    setRunning(true)
    setResult(null)
    try {
      const res  = await fetch('/api/sivra/seo-refresh')
      const data = await res.json()
      if (data.ok) {
        setResult({ title: data.title, analysis: data.analysis })
        await fetchHistory()
      } else {
        setResult({ error: data.error ?? 'Error desconocido' })
      }
    } catch (e) {
      setResult({ error: String(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 896 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Header + button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>SEO · housesevillana.es</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>Analiza la competencia y actualiza los metadatos de la landing directamente</p>
        </div>
        <button
          onClick={runSeo}
          disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: running ? 'var(--primary-hover)' : 'var(--primary)',
            color: '#fff', border: 'none', cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.7 : 1, flexShrink: 0,
            boxShadow: '0 2px 12px rgba(79,70,229,0.35)',
          }}
        >
          {running
            ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Analizando (~30s)...</>
            : <><span>🔍</span> Actualizar SEO ahora</>}
        </button>
      </div>

      {/* Running indicator */}
      {running && (
        <div style={{ marginBottom: 20, background: '#f5f3ff', border: '1px solid #e0e0fc', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>Buscando competidores y generando metadatos...</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Claude analiza resultados de Google y actualiza title, description y OG tags</div>
            </div>
          </div>
        </div>
      )}

      {/* Result card */}
      {result && !running && (
        <div style={{
          marginBottom: 20, borderRadius: 6, padding: 20,
          background: result.error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${result.error ? '#fecaca' : '#bbf7d0'}`,
        }}>
          {result.error ? (
            <div style={{ fontSize: 13, color: '#b91c1c' }}><span style={{ fontWeight: 600 }}>❌ Error:</span> {result.error}</div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🚀</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Aplicado en housesevillana.es — Vercel desplegará en ~60s</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Nuevo title</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 12, background: '#fff', padding: '8px 12px', borderRadius: 4, border: '1px solid #d1fae5' }}>{result.title}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Análisis</div>
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>{result.analysis}</div>
            </div>
          )}
        </div>
      )}

      {/* History header */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Historial de actualizaciones</h2>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '40px 0', textAlign: 'center' }}>Cargando historial...</div>
      ) : proposals.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin actualizaciones todavía. Pulsa el botón para empezar.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {proposals.map((p, idx) => {
            const isOpen = expanded === p.id
            const date   = new Date(p.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            const comps  = p.topCompetitors ?? []
            return (
              <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  style={{
                    width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', flexShrink: 0, width: 20 }}>#{proposals.length - idx}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{date}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
                    {/* Analysis */}
                    <div style={{ paddingTop: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Análisis</div>
                      <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, background: '#f9f9fb', padding: 12, borderRadius: 4, borderLeft: '2px solid var(--primary)', margin: 0 }}>{p.analysis}</p>
                    </div>

                    {/* Changes */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Cambios aplicados</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                          { label: 'Title antes',    val: p.currentTitle,       muted: true },
                          { label: 'Title aplicado', val: p.title,              muted: false },
                          { label: 'Desc antes',     val: p.currentDescription, muted: true },
                          { label: 'Desc aplicada',  val: p.description,        muted: false },
                        ].map(r => (
                          <div key={r.label} style={{ display: 'flex', gap: 8, padding: 8, borderRadius: 4, fontSize: 12, background: r.muted ? '#f9f9f9' : '#f0fdf4' }}>
                            <span style={{ flexShrink: 0, fontWeight: 600, width: 96, color: r.muted ? '#9ca3af' : '#15803d' }}>{r.label}</span>
                            <span style={{ color: r.muted ? '#9ca3af' : '#15803d', fontWeight: r.muted ? 400 : 500 }}>{r.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Competitors */}
                    {comps.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Competidores analizados</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {comps.map((c, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, padding: 10, background: '#f9f9fb', borderRadius: 4, fontSize: 12 }}>
                              <span style={{ color: 'var(--muted)', flexShrink: 0, fontFamily: 'monospace' }}>#{i + 1}</span>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.title}</div>
                                <div style={{ color: 'var(--muted)', marginTop: 2 }}>{c.why_ranking}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
