'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const C = { dark:'#14110E', bg2:'#1E1A15', bg3:'#2A221A', paper:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52', red:'#D9442B', amber:'#E8A33B', green:'#3F7D44', rule:'#2E2720' }

interface InformeIA { resumen: string; desviaciones: Array<{ concepto: string; estimado: number; real: number; diferencia_pct: number; sugerencia: string }>; sugerencias_mejora: string[] }

export default function CierreEventoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [evento, setEvento] = useState<{ cliente_nombre: string; aforo_previsto: number; aforo_confirmado: number; estado: string } | null>(null)
  const [consumo, setConsumo] = useState({ adultos_reales: 0, ninos_reales: 0, botellas_consumidas: 0, incidencias: '', observaciones: '' })
  const [informe, setInforme] = useState<InformeIA | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const [enviandoVal, setEnviandoVal] = useState(false)
  const [valEnviada, setValEnviada] = useState(false)

  useEffect(() => {
    fetch(`/api/owner/eventos?id=${id}`).then(r => r.json()).then(d => {
      const ev = d.eventos?.[0] || d.evento
      if (ev) setEvento(ev)
    }).catch(() => {})

    // Cargar informe si ya existe
    fetch(`/api/owner/eventos/${id}/informe`).then(r => r.json()).then(d => {
      if (d.informe?.resumen && d.informe.resumen !== 'Pendiente análisis IA') {
        setInforme(d.informe)
        if (d.evento_cierre?.estado === 'cerrado') setCerrado(true)
      }
    })
  }, [id])

  const cerrarEvento = async () => {
    if (!confirm('¿Cerrar este evento definitivamente?')) return
    setCerrando(true)
    const r = await fetch(`/api/owner/eventos/${id}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumo_real: consumo })
    })
    const d = await r.json()
    if (d.ok) {
      setInforme(d.informe)
      setCerrado(true)
    }
    setCerrando(false)
  }

  const enviarValoracion = async () => {
    setEnviandoVal(true)
    const r = await fetch(`/api/owner/eventos/${id}/valoracion-enviar`, { method: 'POST' })
    const d = await r.json()
    if (d.ok) setValEnviada(true)
    setEnviandoVal(false)
  }

  const sh = (s: React.CSSProperties) => s

  return (
    <div style={sh({ minHeight:'100vh', background:C.dark, fontFamily:'Inter Tight, sans-serif' })}>
      <div style={sh({ background:C.bg2, borderBottom:`1px solid ${C.rule}`, padding:'1rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem' })}>
        <button onClick={() => router.back()} style={sh({ background:'transparent', border:'none', color:C.ink2, cursor:'pointer', fontSize:'1.2rem' })}>←</button>
        <div>
          <div style={sh({ color:C.paper, fontWeight:700 })}>Cierre de evento</div>
          <div style={sh({ color:C.ink3, fontSize:'0.78rem' })}>{evento?.cliente_nombre || '...'}</div>
        </div>
        {cerrado && <div style={sh({ marginLeft:'auto', color:C.green, fontWeight:600, fontSize:'0.88rem' })}>✅ Cerrado</div>}
      </div>

      <div style={sh({ padding:'1.25rem 1.5rem', maxWidth:600, margin:'0 auto' })}>

        {!cerrado && (
          <>
            {/* Consumo real */}
            <div style={sh({ background:C.bg2, borderRadius:10, padding:'1.25rem', marginBottom:'1rem', border:`1px solid ${C.rule}` })}>
              <div style={sh({ color:C.ink3, fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.9rem' })}>Consumo real</div>

              <div style={sh({ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.75rem' })}>
                {[
                  { label:'Adultos reales', key:'adultos_reales', previsto: evento?.aforo_confirmado || evento?.aforo_previsto || 0 },
                  { label:'Niños reales', key:'ninos_reales', previsto: 0 },
                ].map(f => (
                  <div key={f.key}>
                    <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>
                      {f.label}
                      {f.previsto > 0 && <span style={{ color:C.ink4, marginLeft:'0.4rem' }}>(prev. {f.previsto})</span>}
                    </label>
                    <input type="number" min={0}
                      value={consumo[f.key as keyof typeof consumo] as number || ''}
                      onChange={e => setConsumo(c => ({ ...c, [f.key]: parseInt(e.target.value) || 0 }))}
                      style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'1rem', boxSizing:'border-box' })} />
                  </div>
                ))}
              </div>

              <div style={sh({ marginBottom:'0.75rem' })}>
                <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>Botellas consumidas (barra)</label>
                <input type="number" min={0}
                  value={consumo.botellas_consumidas || ''}
                  onChange={e => setConsumo(c => ({ ...c, botellas_consumidas: parseInt(e.target.value) || 0 }))}
                  style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'1rem', boxSizing:'border-box' })} />
              </div>

              <div style={sh({ marginBottom:'0.75rem' })}>
                <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>Incidencias</label>
                <textarea value={consumo.incidencias}
                  onChange={e => setConsumo(c => ({ ...c, incidencias: e.target.value }))}
                  rows={2} placeholder="Alergias, retrasos, roturas..."
                  style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'0.9rem', resize:'vertical', boxSizing:'border-box', fontFamily:'Inter Tight, sans-serif' })} />
              </div>

              <div>
                <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>Observaciones generales</label>
                <textarea value={consumo.observaciones}
                  onChange={e => setConsumo(c => ({ ...c, observaciones: e.target.value }))}
                  rows={2} placeholder="Valoración del servicio, puntos de mejora..."
                  style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'0.9rem', resize:'vertical', boxSizing:'border-box', fontFamily:'Inter Tight, sans-serif' })} />
              </div>
            </div>

            <button onClick={cerrarEvento} disabled={cerrando}
              style={sh({ width:'100%', padding:'1rem', background:C.red, border:'none', borderRadius:10, color:C.paper, fontSize:'1rem', fontWeight:700, cursor:'pointer', opacity: cerrando ? 0.7 : 1 })}>
              {cerrando ? 'Generando informe IA...' : '🔒 Cerrar evento y generar informe'}
            </button>
          </>
        )}

        {/* Informe IA post-evento */}
        {informe && (
          <div style={sh({ marginTop: cerrado ? 0 : '1.5rem' })}>
            <div style={sh({ background:C.bg2, borderRadius:10, padding:'1.25rem', marginBottom:'1rem', border:`1px solid ${C.rule}` })}>
              <div style={sh({ color:C.ink3, fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem' })}>📊 Informe post-evento IA</div>
              <p style={sh({ color:C.ink2, fontSize:'0.9rem', lineHeight:1.6, marginBottom:'1rem' })}>{informe.resumen}</p>

              {informe.desviaciones?.length > 0 && (
                <div style={sh({ marginBottom:'1rem' })}>
                  <div style={sh({ color:C.ink3, fontSize:'0.78rem', marginBottom:'0.5rem' })}>Desviaciones detectadas</div>
                  {informe.desviaciones.map((d, i) => (
                    <div key={i} style={sh({ background:C.bg3, borderRadius:8, padding:'0.75rem', marginBottom:'0.4rem' })}>
                      <div style={sh({ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.25rem' })}>
                        <span style={sh({ color:C.paper, fontSize:'0.85rem', fontWeight:600 })}>{d.concepto}</span>
                        <span style={sh({ color: Math.abs(d.diferencia_pct) > 15 ? C.amber : C.ink2, fontSize:'0.82rem' })}>
                          {d.diferencia_pct > 0 ? '+' : ''}{d.diferencia_pct.toFixed(1)}%
                        </span>
                      </div>
                      <div style={sh({ color:C.ink3, fontSize:'0.78rem' })}>
                        Previsto {d.estimado} → Real {d.real}
                      </div>
                      {d.sugerencia && <div style={sh({ color:C.amber, fontSize:'0.78rem', marginTop:'0.25rem' })}>💡 {d.sugerencia}</div>}
                    </div>
                  ))}
                </div>
              )}

              {informe.sugerencias_mejora?.length > 0 && (
                <div>
                  <div style={sh({ color:C.ink3, fontSize:'0.78rem', marginBottom:'0.5rem' })}>Sugerencias de mejora</div>
                  {informe.sugerencias_mejora.map((s, i) => (
                    <div key={i} style={sh({ color:C.ink2, fontSize:'0.85rem', padding:'0.4rem 0', borderBottom:`1px solid ${C.rule}` })}>
                      · {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enviar valoración */}
            {cerrado && (
              <button onClick={enviarValoracion} disabled={enviandoVal || valEnviada}
                style={sh({ width:'100%', padding:'0.9rem', background: valEnviada ? C.green : C.bg2, border:`1px solid ${valEnviada ? C.green : C.rule}`, borderRadius:10, color: valEnviada ? C.paper : C.ink2, fontSize:'0.95rem', cursor:'pointer', fontWeight:600 })}>
                {valEnviada ? '✅ Valoración enviada al cliente' : enviandoVal ? '...' : '⭐ Enviar valoración al cliente'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
