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

// Sondeo del permiso de escritura del GITHUB_TOKEN (ver /api/sivra/seo-token-check).
// `estado` tiene TRES lecturas, no dos: puede escribir / no puede / no lo sé. El «no lo sé»
// se pinta ámbar a propósito — un check que se pone verde porque no entendió la respuesta
// es peor que no tenerlo.
type Sondeo = {
  estado: 'puede-escribir' | 'sin-token' | 'token-invalido' | 'sin-permiso' | 'no-lee' | 'desconocido'
  mensaje: string
  status: number | null
}

export default function SeoPage() {
  const [proposals, setProposals] = useState<SeoProposal[]>([])
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [result,    setResult]    = useState<{ title?: string; analysis?: string; error?: string } | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [probando,  setProbando]  = useState(false)
  const [sondeo,    setSondeo]    = useState<Sondeo | null>(null)

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

  async function probarToken() {
    setProbando(true)
    setSondeo(null)
    try {
      const res  = await fetch('/api/sivra/seo-token-check')
      const data = await res.json()
      // Sin `estado` no sabemos nada: NO lo demos por bueno ni por malo, dilo como «no lo sé».
      setSondeo(data?.estado
        ? data as Sondeo
        : { estado: 'desconocido', status: res.status, mensaje: data?.error ?? 'Respuesta inesperada del servidor' })
    } catch (e) {
      setSondeo({ estado: 'desconocido', status: null, mensaje: String(e) })
    } finally {
      setProbando(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 896 }}>

      {/* Header + button */}
      <div className="seo-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>SEO · housesevillana.es</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>Analiza la competencia y actualiza los metadatos de la landing directamente</p>
        </div>
        <div className="seo-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          {/* Comprobación barata (1 s) del permiso que solo se descubría al final del análisis. */}
          <button
            onClick={probarToken}
            disabled={probando || running}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', minHeight: 44, borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: 'transparent', color: 'var(--text)',
              border: '1px solid var(--border)',
              cursor: probando || running ? 'not-allowed' : 'pointer',
              opacity: probando || running ? 0.6 : 1,
            }}
          >
            {probando
              ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Probando...</>
              : <><span>🔑</span> Probar acceso a GitHub</>}
          </button>
          <button
            onClick={runSeo}
            disabled={running || probando}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 20px', minHeight: 44, borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: running ? 'var(--primary-hover)' : 'var(--primary)',
              color: '#fff', border: 'none', cursor: running || probando ? 'not-allowed' : 'pointer',
              opacity: running || probando ? 0.7 : 1,
              boxShadow: '0 2px 12px rgba(79,70,229,0.35)',
            }}
          >
            {running
              ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Analizando (~30s)...</>
              : <><span>🔍</span> Actualizar SEO ahora</>}
          </button>
        </div>
      </div>

      {/* Resultado del sondeo del token — TRES estados, nunca dos */}
      {sondeo && !probando && (() => {
        const verde = sondeo.estado === 'puede-escribir'
        const ambar = sondeo.estado === 'desconocido'
        const paleta = verde
          ? { bg: 'var(--positive-bg)', bd: '#bbf7d0', fg: 'var(--positive)', icono: '✅', titulo: 'El token puede commitear la landing' }
          : ambar
            ? { bg: 'var(--warning-bg)', bd: '#fde68a', fg: 'var(--warning)', icono: '🟠', titulo: 'No he podido determinarlo' }
            : { bg: 'var(--negative-bg)', bd: 'var(--negative-bg)', fg: 'var(--negative)', icono: '❌', titulo: 'El token NO puede commitear la landing' }
        return (
          <div style={{ marginBottom: 20, borderRadius: 6, padding: 16, background: paleta.bg, border: `1px solid ${paleta.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: paleta.fg, marginBottom: 6 }}>
              {paleta.icono} {paleta.titulo}{sondeo.status ? ` (HTTP ${sondeo.status})` : ''}
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6, wordBreak: 'break-word' }}>{sondeo.mensaje}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Sondeo de solo lectura: no escribe nada en el repo. Comprueba el <code>GITHUB_TOKEN</code> de
              <strong> plataforma</strong>; el cron semanal corre en el proyecto <strong>sivra</strong>, que tiene su
              propia copia — para esa, <code>/api/seo-token-check</code> en la app sivra.
            </div>
          </div>
        )
      })()}

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
          background: result.error ? 'var(--negative-bg)' : 'var(--positive-bg)',
          border: `1px solid ${result.error ? 'var(--negative-bg)' : '#bbf7d0'}`,
        }}>
          {result.error ? (
            <div style={{ fontSize: 13, color: 'var(--negative)' }}><span style={{ fontWeight: 600 }}>❌ Error:</span> {result.error}</div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🚀</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--positive)' }}>Aplicado en housesevillana.es — Vercel desplegará en ~60s</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Nuevo title</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 12, background: 'var(--surface)', padding: '8px 12px', borderRadius: 4, border: '1px solid var(--positive-bg)' }}>{result.title}</div>
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
                          <div key={r.label} className="seo-changes-row" style={{ display: 'flex', gap: 8, padding: 8, borderRadius: 4, fontSize: 12, background: r.muted ? '#f9f9f9' : 'var(--positive-bg)' }}>
                            <span style={{ flexShrink: 0, fontWeight: 600, width: 96, color: r.muted ? '#9ca3af' : 'var(--positive)' }}>{r.label}</span>
                            <span style={{ color: r.muted ? '#9ca3af' : 'var(--positive)', fontWeight: r.muted ? 400 : 500 }}>{r.val}</span>
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
