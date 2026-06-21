'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type ScoringData = {
  puntuacion: number; resumen: string
  puntos_fuertes: string[]; puntos_mejora: string[]
  recomendaciones_precio: string; alerta_appcc: boolean
  financiero: { ingresos_presupuestados: number; ingresos_reales: number; coste_total: number; margen_bruto: number; margen_pct: number }
}
type ScoringResponse = { scoring: ScoringData | null; appcc: { testigos: number; temp_ok: number; temp_ko: number }; comisiones: { total: number; cobradas: number; pendientes: number }; mensaje?: string; _cache?: boolean; _generado_at?: string }

const fmtEur = (n: number | null) => n != null ? n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—'
const scoreColor = (s: number) => s >= 8 ? '#3F7D44' : s >= 6 ? '#E8A33B' : '#D9442B'

export default function PanelScoring({ eventoId, sh }: { eventoId: string; sh: () => Record<string, string> }) {
  const [data, setData] = useState<ScoringResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const cargar = useCallback(async (forzar = false) => {
    if (forzar) setGenerando(true)
    else setLoading(true)
    const url = forzar
      ? `/api/owner/eventos/scoring-nim?evento_id=${eventoId}&recalcular=1`
      : `/api/owner/eventos/scoring-nim?evento_id=${eventoId}`
    const r = await fetch(url, { headers: sh() })
    const d = await r.json()
    setData(d)
    setLoading(false)
    setGenerando(false)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <div style={{ padding: 12, color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando…</div>

  return (
    <div style={{ marginTop: 10, background: '#fff', borderRadius: 8, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700 }}>🤖 Scoring IA post-evento</div>
        {data?._generado_at && (
          <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>
            {data._cache ? '📦 Caché' : '✨ Nuevo'} · {new Date(data._generado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        <button onClick={() => cargar(true)} disabled={generando}
          style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: generando ? C.ink + '22' : C.red, color: generando ? C.ink3 : '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: generando ? 'not-allowed' : 'pointer' }}>
          {generando ? '⏳ Analizando…' : '🔄 Generar análisis'}
        </button>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {data?.mensaje && !data?.scoring && (
          <div style={{ color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center', padding: 16 }}>{data.mensaje}</div>
        )}

        {data?.scoring && (
          <>
            {/* Puntuación */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, padding: '10px 14px', background: C.paper, borderRadius: 8 }}>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontFamily: SE, fontSize: 32, fontWeight: 700, color: scoreColor(data.scoring.puntuacion), lineHeight: 1 }}>
                  {data.scoring.puntuacion}
                </div>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>/ 10</div>
              </div>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{data.scoring.resumen}</div>
                {data.scoring.alerta_appcc && (
                  <div style={{ marginTop: 4, fontFamily: SN, fontSize: 11, color: '#D9442B', fontWeight: 600 }}>
                    ⚠️ Revisar registros APPCC
                  </div>
                )}
              </div>
            </div>

            {/* Financiero */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, marginBottom: 12 }}>
              {[
                ['Ingresos presupuestados', fmtEur(data.scoring.financiero.ingresos_presupuestados)],
                ['Ingresos reales', fmtEur(data.scoring.financiero.ingresos_reales)],
                ['Coste total', fmtEur(data.scoring.financiero.coste_total)],
                ['Margen', `${fmtEur(data.scoring.financiero.margen_bruto)} (${data.scoring.financiero.margen_pct ?? 0}%)`],
              ].map(([label, val]) => (
                <div key={label} style={{ background: C.paper, borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>{label}</div>
                  <div style={{ fontFamily: SE, fontSize: 13, color: C.ink, fontWeight: 600 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* APPCC + Comisiones */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginBottom: 12 }}>
              <div style={{ background: data.appcc?.temp_ko ? '#fee2e2' : '#f0fdf4', borderRadius: 6, padding: '6px 10px', border: `1px solid ${data.appcc?.temp_ko ? '#fca5a5' : '#bbf7d0'}` }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>APPCC</div>
                <div style={{ fontFamily: SN, fontSize: 12 }}>
                  📋 {data.appcc?.testigos} testigos · 🌡️ {data.appcc?.temp_ok}✅ {data.appcc?.temp_ko}❌
                </div>
              </div>
              <div style={{ background: C.paper, borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>Comisiones proveedores</div>
                <div style={{ fontFamily: SN, fontSize: 12 }}>
                  <span style={{ color: '#3F7D44' }}>{fmtEur(data.comisiones?.cobradas)} cobradas</span>
                  {data.comisiones?.pendientes > 0 && <span style={{ color: '#E8A33B' }}> · {fmtEur(data.comisiones?.pendientes)} pendientes</span>}
                </div>
              </div>
            </div>

            {/* Puntos fuertes y mejora */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 10, color: '#3F7D44', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Puntos fuertes</div>
                {data.scoring.puntos_fuertes.map((p, i) => (
                  <div key={i} style={{ fontFamily: SN, fontSize: 11, color: C.ink2, marginBottom: 3 }}>✅ {p}</div>
                ))}
              </div>
              <div>
                <div style={{ fontFamily: SN, fontSize: 10, color: '#E8A33B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Mejorar</div>
                {data.scoring.puntos_mejora.map((p, i) => (
                  <div key={i} style={{ fontFamily: SN, fontSize: 11, color: C.ink2, marginBottom: 3 }}>⚡ {p}</div>
                ))}
              </div>
            </div>

            {/* Recomendación precio */}
            {data.scoring.recomendaciones_precio && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: '#3F7D44', fontWeight: 700, marginBottom: 3 }}>💡 PRICING FUTURO</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>{data.scoring.recomendaciones_precio}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
