"use client"
import { useEffect, useState } from "react"

type SeoProposal = {
  id: string
  title: string
  description: string
  ogDescription: string
  analysis: string
  currentTitle: string
  currentDescription: string
  topCompetitors: Array<{title: string; why_ranking: string}> | null
  createdAt: string
}

export default function SeoPage() {
  const [proposals, setProposals] = useState<SeoProposal[]>([])
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [result,    setResult]    = useState<{title?: string; analysis?: string; error?: string} | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    setLoading(true)
    try {
      const res = await fetch('/api/seo-proposals')
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
      const res  = await fetch('/api/seo-refresh')
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
    <div className="p-4 md:p-6 max-w-4xl">

      {/* Header + button */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1A2535] tracking-tight">SEO · housesevillana.es</h1>
          <p className="text-sm text-[#9898A8] mt-0.5">Analiza la competencia y actualiza los metadatos de la landing directamente</p>
        </div>
        <button
          onClick={runSeo}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-[6px] text-sm font-semibold transition-all disabled:opacity-60 shrink-0"
          style={{ background: "var(--lime)", boxShadow: "0 2px 12px rgba(99,102,241,0.35)" }}
        >
          {running
            ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Analizando (~30s)...</>
            : <><span>🔍</span> Actualizar SEO ahora</>}
        </button>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Result card */}
      {running && (
        <div className="mb-5 bg-[#f8f7ff] border border-[#e0e0fc] rounded-[6px] p-5">
          <div className="flex items-center gap-3">
            <span style={{fontSize:20,display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span>
            <div>
              <div className="text-sm font-semibold text-[#5A9A12]">Buscando competidores y generando metadatos...</div>
              <div className="text-xs text-[#9898A8] mt-0.5">Claude analiza resultados de Google y actualiza title, description y OG tags</div>
            </div>
          </div>
        </div>
      )}

      {result && !running && (
        <div className={`mb-5 rounded-[6px] p-5 border ${result.error ? 'bg-red-50 border-red-200' : 'bg-[#f0fdf4] border-[#bbf7d0]'}`}>
          {result.error ? (
            <div className="text-sm text-red-700"><span className="font-semibold">❌ Error:</span> {result.error}</div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🚀</span>
                <div className="text-sm font-bold text-[#15803d]">Aplicado en housesevillana.es — Vercel desplegará en ~60s</div>
              </div>
              <div className="text-xs font-semibold text-[#9898A8] mb-1">Nuevo title</div>
              <div className="text-sm font-medium text-[#1A2535] mb-3 bg-[#FFFFFF] px-3 py-2 rounded-[4px] border border-[#d1fae5]">{result.title}</div>
              <div className="text-xs font-semibold text-[#9898A8] mb-1">Análisis</div>
              <div className="text-sm text-[#4b5563] leading-relaxed">{result.analysis}</div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[#1A2535]">Historial de actualizaciones</h2>
      </div>

      {loading ? (
        <div className="text-sm text-[#9898A8] py-10 text-center">Cargando historial...</div>
      ) : proposals.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] p-10 text-center">
          <div className="text-2xl mb-2">🔍</div>
          <div className="text-sm text-[#9898A8]">Sin actualizaciones todavía. Pulsa el botón para empezar.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.map((p, idx) => {
            const isOpen = expanded === p.id
            const date   = new Date(p.createdAt).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
            const comps  = p.topCompetitors ?? []
            return (
              <div key={p.id} className="bg-[#FFFFFF] border border-[#E8EDF3] rounded-[6px] overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#fafafa] transition-colors text-left"
                >
                  <span className="text-xs font-bold text-[#5A9A12] shrink-0 w-5">#{proposals.length - idx}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1A2535] truncate">{p.title}</div>
                    <div className="text-xs text-[#9898A8] mt-0.5">{date}</div>
                  </div>
                  <span className="text-[#6B7F96] text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-[#E8EDF3] space-y-4">
                    {/* Analysis */}
                    <div className="pt-4">
                      <div className="text-xs font-semibold text-[#9898A8] uppercase tracking-wider mb-2">Análisis</div>
                      <p className="text-sm text-[#4b5563] leading-relaxed bg-[#f9f9fb] p-3 rounded-[4px] border-l-2 border-[#BBFF44]">{p.analysis}</p>
                    </div>

                    {/* Changes */}
                    <div>
                      <div className="text-xs font-semibold text-[#9898A8] uppercase tracking-wider mb-2">Cambios aplicados</div>
                      <div className="space-y-2 text-xs">
                        {[
                          { label:"Title antes",       val: p.currentTitle,       muted: true },
                          { label:"Title aplicado",    val: p.title,              muted: false },
                          { label:"Desc antes",        val: p.currentDescription, muted: true },
                          { label:"Desc aplicada",     val: p.description,        muted: false },
                        ].map(r => (
                          <div key={r.label} className={`flex gap-2 p-2 rounded-[4px] ${r.muted ? 'bg-[#f9f9f9]' : 'bg-[#f0fdf4]'}`}>
                            <span className={`shrink-0 font-semibold w-24 ${r.muted ? 'text-[#9ca3af]' : 'text-[#15803d]'}`}>{r.label}</span>
                            <span className={r.muted ? 'text-[#9ca3af]' : 'text-[#15803d] font-medium'}>{r.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Competitors */}
                    {comps.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-[#9898A8] uppercase tracking-wider mb-2">Competidores analizados</div>
                        <div className="space-y-1.5">
                          {comps.map((c, i) => (
                            <div key={i} className="flex gap-2 p-2.5 bg-[#f9f9fb] rounded-[4px] text-xs">
                              <span className="text-[#9ca3af] shrink-0 font-mono">#{i+1}</span>
                              <div>
                                <div className="font-medium text-[#1A2535]">{c.title}</div>
                                <div className="text-[#9898A8] mt-0.5">{c.why_ranking}</div>
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
