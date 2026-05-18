'use client'
import { useState } from 'react'

const C = { red: '#D9442B', amber: '#E8A33B', green: '#3F7D44', ink: '#1A1714', ink3: '#6B5F52', ink4: '#9A8D7C', paper: '#F6F1E7', bone: '#FBF8F1', rule: '#D8CDB6' }
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

interface Critico { nombre: string; problema: string; sugerencia_precio?: number }
interface Analisis { resumen: string; criticos: Critico[]; estrella?: { nombre: string; motivo: string }; oportunidad?: string; margen_medio?: number }

export default function AnalizadorEscandallos({ sh }: { sh: () => Record<string, string> }) {
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function analizar() {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/owner/escandallos/analizar', { headers: sh() })
      const d = await res.json()
      if (d.error) setErr(d.error)
      else setAnalisis(d.analisis)
    } catch { setErr('Error de conexión') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Análisis de rentabilidad IA
        </div>
        <button onClick={analizar} disabled={loading} style={{
          background: C.red, color: C.paper, border: 'none', borderRadius: 7,
          padding: '7px 14px', fontSize: 12, fontFamily: SN, cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1, fontWeight: 600,
        }}>
          {loading ? 'Analizando…' : '🧠 Analizar con IA'}
        </button>
      </div>

      {err && <div style={{ color: C.amber, fontFamily: SN, fontSize: 12 }}>{err}</div>}

      {analisis && (
        <div style={{ background: C.bone, borderRadius: 10, padding: 14, border: `1px solid ${C.rule}` }}>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, fontStyle: 'italic', margin: '0 0 12px 0' }}>{analisis.resumen}</p>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            {analisis.margen_medio != null && (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                Margen medio: <span style={{ fontFamily: SM, color: analisis.margen_medio >= 65 ? C.green : C.amber, fontWeight: 700 }}>{analisis.margen_medio}%</span>
              </div>
            )}
            {analisis.estrella && (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                ⭐ <span style={{ color: C.green, fontWeight: 600 }}>{analisis.estrella.nombre}</span>
                <span style={{ color: C.ink4 }}> · {analisis.estrella.motivo}</span>
              </div>
            )}
          </div>

          {analisis.criticos?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>⚠️ Productos críticos</div>
              {analisis.criticos.map((c) => (
                <div key={c.nombre} style={{
                  background: 'rgba(217,68,43,0.06)', borderRadius: 6,
                  padding: '7px 10px', marginBottom: 5, borderLeft: `3px solid ${C.red}`,
                }}>
                  <span style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 600 }}>{c.nombre}</span>
                  <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}> · {c.problema}</span>
                  {c.sugerencia_precio && (
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.amber, marginLeft: 8 }}>→ PVP sugerido: {c.sugerencia_precio}€</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {analisis.oportunidad && (
            <div style={{ fontFamily: SN, fontSize: 12, color: C.green, fontStyle: 'italic' }}>💡 {analisis.oportunidad}</div>
          )}
        </div>
      )}
    </div>
  )
}
