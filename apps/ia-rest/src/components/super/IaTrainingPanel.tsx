'use client'
import React, { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Stats = {
  total: number; ultimos_7d: number; corregidos: number
  exportables_calidad_min: number; pct_exportable: number
  por_modelo: Record<string, number>; distribucion_calidad: Record<number, number>
  velocidad_acumulacion: string
}

const FINE_TUNE_THRESHOLD = 10000
const fmtN = (n: number) => n.toLocaleString('es-ES')

export default function IaTrainingPanel() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [calidadMin, setCalidadMin] = useState(3)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/super/training?formato=stats&calidad_min=${calidadMin}`)
      .then(r => r.json()).then(setStats).finally(() => setLoading(false))
  }, [calidadMin])

  const exportar = async (formato: 'alpaca' | 'sharegpt') => {
    setExportando(true)
    const res = await fetch(`/api/super/training?formato=${formato}&calidad_min=${calidadMin}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iarest-brain-${formato}-${new Date().toISOString().slice(0,10)}.jsonl`
    a.click()
    URL.revokeObjectURL(url)
    setExportando(false)
  }

  const progreso = stats ? Math.min(100, Math.round((stats.exportables_calidad_min / FINE_TUNE_THRESHOLD) * 100)) : 0
  const faltanParaFT = stats ? Math.max(0, FINE_TUNE_THRESHOLD - stats.exportables_calidad_min) : FINE_TUNE_THRESHOLD

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, fontStyle: 'italic', color: C.paper, marginBottom: 4 }}>
          🧠 Training Dataset — Brain ia.rest
        </div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
          Cada comanda procesada es un ejemplo de entrenamiento para tu propia IA
        </div>
      </div>

      {loading && <div style={{ color: C.ink3, fontFamily: SN, padding: 20 }}>Cargando estadísticas…</div>}

      {!loading && stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total comandas', val: fmtN(stats.total), color: C.paper, sub: stats.velocidad_acumulacion },
              { label: 'Esta semana', val: fmtN(stats.ultimos_7d), color: C.amber, sub: 'últimos 7 días' },
              { label: 'Exportables', val: fmtN(stats.exportables_calidad_min), color: C.green, sub: `calidad ≥ ${calidadMin}` },
              { label: 'Corregidas', val: fmtN(stats.corregidos), color: stats.corregidos > 0 ? '#A78BFA' : C.ink3, sub: 'ejemplos negativos' },
            ].map(k => (
              <div key={k.label} style={{ background: C.bg2, border: `1px solid ${C.bg3}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginTop: 3 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Barra progreso */}
          <div style={{ background: C.bg2, border: `1px solid ${C.bg3}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.paper }}>Progreso hacia fine-tuning propio</div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                  Objetivo: {fmtN(FINE_TUNE_THRESHOLD)} comandas · {faltanParaFT > 0 ? `Faltan ${fmtN(faltanParaFT)}` : '¡Listo!'}
                </div>
              </div>
              <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 700, color: progreso >= 100 ? C.green : C.amber }}>{progreso}%</div>
            </div>
            <div style={{ background: C.bg3, borderRadius: 99, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${progreso}%`, height: '100%', borderRadius: 99, background: progreso >= 100 ? C.green : C.red, transition: 'width .4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontFamily: SN, fontSize: 9, color: C.ink3 }}>
              <span>0</span><span>2.5k piloto</span><span>10k fine-tuning</span>
            </div>
          </div>

          {/* Roadmap */}
          <div style={{ background: C.bg2, border: `1px solid ${C.bg3}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Roadmap — Tu propia IA</div>
            {[
              { umbral: 0, label: 'Fase 1: APIs externas (NIM + Claude)', desc: 'Activo. ~800ms/comanda.', done: true },
              { umbral: 2500, label: 'Fase 2: Fine-tuning piloto Llama-8b', desc: '~€15 en RunPod · <100ms · sin dependencia', done: stats.exportables_calidad_min >= 2500 },
              { umbral: 10000, label: 'Fase 3: Modelo propio hostelería española', desc: 'Deploy propio · 0 tokens de terceros', done: stats.exportables_calidad_min >= 10000 },
              { umbral: 100000, label: 'Fase 4: Modelo multimodal (voz + foto carta)', desc: 'Producto diferencial único en el mercado', done: stats.exportables_calidad_min >= 100000 },
            ].map((fase, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: fase.done ? C.green : C.bg3, border: `2px solid ${fase.done ? C.green : C.ink3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  {fase.done ? '✓' : i + 1}
                </div>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: fase.done ? C.green : C.paper }}>{fase.label}</div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{fase.desc}</div>
                  {!fase.done && fase.umbral > 0 && (
                    <div style={{ fontFamily: SN, fontSize: 10, color: C.amber, marginTop: 1 }}>
                      {fmtN(Math.max(0, fase.umbral - stats.exportables_calidad_min))} comandas más
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Stats calidad + modelos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ background: C.bg2, border: `1px solid ${C.bg3}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Distribución calidad</div>
              {[5,4,3,2,1].map(q => {
                const n = stats.distribucion_calidad[q] ?? 0
                const pct = stats.total ? Math.round((n / stats.total) * 100) : 0
                return (
                  <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.paper, width: 16 }}>{q}★</div>
                    <div style={{ flex: 1, background: C.bg3, borderRadius: 99, height: 5 }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: q >= 4 ? C.green : q === 3 ? C.amber : C.red }} />
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, width: 40, textAlign: 'right' }}>{fmtN(n)}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ background: C.bg2, border: `1px solid ${C.bg3}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Modelos usados</div>
              {Object.entries(stats.por_modelo).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.paper }}>{m.split('/').pop()}</div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{fmtN(n)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Exportar */}
          <div style={{ background: C.bg2, border: `1px solid ${C.bg3}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.paper, marginBottom: 3 }}>Exportar dataset</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 12 }}>
              JSONL listo para Unsloth / LlamaFactory. {fmtN(stats.exportables_calidad_min)} ejemplos con calidad ≥ {calidadMin}★
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>Calidad mínima:</div>
              {[2,3,4,5].map(q => (
                <button key={q} onClick={() => setCalidadMin(q)}
                  style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${calidadMin === q ? C.amber : C.bg3}`, background: calidadMin === q ? C.amber + '22' : 'transparent', color: calidadMin === q ? C.amber : C.ink3, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                  {q}★+
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => exportar('alpaca')} disabled={exportando || !stats.exportables_calidad_min}
                style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: stats.exportables_calidad_min > 0 ? C.red : C.bg3, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {exportando ? '⏳…' : '⬇️ Alpaca JSONL'}
              </button>
              <button onClick={() => exportar('sharegpt')} disabled={exportando || !stats.exportables_calidad_min}
                style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.ink3}`, background: 'transparent', color: C.ink2, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
                ⬇️ ShareGPT JSONL
              </button>
            </div>
            <div style={{ marginTop: 10, fontFamily: SN, fontSize: 10, color: C.ink3, lineHeight: 1.6 }}>
              Con 10.000 ejemplos: Llama-3.1-8b fine-tuneado en ~1h GPU (RunPod ~15€) → comandas en &lt;100ms sin APIs de terceros.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
