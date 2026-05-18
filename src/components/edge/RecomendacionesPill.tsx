'use client'

/**
 * RecomendacionesPill — /edge (camarero)
 * Pill discreta bajo el header con recomendaciones activas del turno.
 * Al pulsar abre un drawer con detalle. No afecta el flujo de comandas.
 */

import { useState, useEffect, useCallback } from 'react'

interface Rec {
  id: string
  producto_nombre: string
  precio: number
  categoria: string
  nota: string | null
  hora_desde: string | null
  hora_hasta: string | null
  cantidad_max: number | null
  cantidad_servida: number
  cantidad_restante: number | null
}

// ── Drawer ─────────────────────────────────────────────────────
function RecDrawer({ recs, onCerrar, onServido }: {
  recs: Rec[]
  onCerrar: () => void
  onServido: (id: string) => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCerrar])

  const fmtHora = (t: string | null) => t ? t.slice(0, 5) : null

  const marcarServido = async (id: string) => {
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    await fetch('/api/owner/recomendaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ id, incrementar: true }),
    })
    onServido(id)
  }

  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(20,17,14,0.65)', backdropFilter:'blur(3px)' }} onClick={onCerrar} />
      <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:50, background:'#1C1814', borderRadius:'20px 20px 0 0', border:'1px solid #2C2520', borderBottom:'none', maxHeight:'75vh', display:'flex', flexDirection:'column', animation:'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)' }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', paddingTop:12, paddingBottom:4 }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'#2C2520' }} />
        </div>

        {/* Header drawer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px 14px', borderBottom:'1px solid #2C2520' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E8A33B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span style={{ color:'#F6F1E7', fontFamily:"'Newsreader',Georgia,serif", fontWeight:600, fontSize:16 }}>Recomendaciones</span>
            <span style={{ background:'#E8A33B22', color:'#E8A33B', fontSize:11, fontFamily:'monospace', padding:'1px 6px', borderRadius:5 }}>{recs.length}</span>
          </div>
          <button onClick={onCerrar} style={{ background:'#14110E', color:'#6B5F52', border:'1px solid #2C2520', padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer' }}>Cerrar</button>
        </div>

        {/* Lista */}
        <div style={{ overflowY:'auto', flex:1, padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {recs.map(r => {
            const agotando = r.cantidad_restante !== null && r.cantidad_restante <= 3
            return (
              <div key={r.id} style={{ padding:14, borderRadius:12, background:'#14110E', border:`1px solid ${agotando ? '#E8A33B44' : '#2C2520'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:4 }}>
                  <span style={{ color:'#F6F1E7', fontFamily:"'Newsreader',Georgia,serif", fontWeight:600, fontSize:16, lineHeight:1.3 }}>{r.producto_nombre}</span>
                  <span style={{ color:'#E8A33B', fontFamily:'monospace', fontSize:15, flexShrink:0 }}>{Number(r.precio).toFixed(2)} €</span>
                </div>
                {r.nota && (
                  <p style={{ color:'#9A8D7C', fontSize:14, margin:'4px 0 8px', fontFamily:"'Caveat',cursive", lineHeight:1.4 }}>
                    &ldquo;{r.nota}&rdquo;
                  </p>
                )}
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' as const }}>
                  {(r.hora_desde || r.hora_hasta) && (
                    <span style={{ fontSize:11, fontFamily:'monospace', padding:'2px 7px', borderRadius:5, background:'#3F7D4422', color:'#3F7D44', border:'1px solid #3F7D4433' }}>
                      {fmtHora(r.hora_desde) ?? '00:00'} – {fmtHora(r.hora_hasta) ?? '24:00'}
                    </span>
                  )}
                  {r.cantidad_max !== null && (
                    <span style={{ fontSize:11, fontFamily:'monospace', padding:'2px 7px', borderRadius:5, background: agotando ? '#E8A33B22' : '#2C2520', color: agotando ? '#E8A33B' : '#6B5F52', border:`1px solid ${agotando ? '#E8A33B44' : '#3A332C'}` }}>
                      {agotando ? '⚡ ' : ''}{r.cantidad_restante} / {r.cantidad_max} restantes
                    </span>
                  )}
                </div>
                {r.cantidad_max !== null && (
                  <button
                    onClick={() => marcarServido(r.id)}
                    style={{ marginTop:10, fontSize:11, padding:'5px 12px', borderRadius:7, border:'1px solid #3A332C', background:'#1C1814', color:'#9A8D7C', cursor:'pointer', fontFamily:'monospace' }}
                  >
                    +1 servido
                  </button>
                )}
              </div>
            )
          })}
          <div style={{ height:20 }} />
        </div>
      </div>
    </>
  )
}

// ── Componente principal ────────────────────────────────────────
export default function RecomendacionesPill({ restauranteId }: { restauranteId: string }) {
  const [recs,    setRecs]    = useState<Rec[]>([])
  const [drawer,  setDrawer]  = useState(false)
  const [visto,   setVisto]   = useState(false)

  const cargar = useCallback(async () => {
    try {
      const ses = localStorage.getItem('ia_rest_session') ?? ''
      if (!ses) return
      const r = await fetch('/api/recomendaciones', { headers: { 'x-ia-session': ses } })
      if (!r.ok) return
      const d = await r.json()
      setRecs(d.recomendaciones ?? [])
    } catch { /* silencioso — no afecta flujo */ }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const t = setInterval(cargar, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [cargar])

  const onServido = (id: string) => {
    setRecs(prev =>
      prev.map(r =>
        r.id === id
          ? { ...r, cantidad_servida: r.cantidad_servida + 1, cantidad_restante: r.cantidad_restante !== null ? r.cantidad_restante - 1 : null }
          : r
      ).filter(r => r.cantidad_restante === null || r.cantidad_restante > 0)
    )
  }

  if (recs.length === 0) return null

  return (
    <>
      <div style={{ background:'#14110E', padding:'5px 12px', borderBottom:'1px solid #2C2520', flexShrink:0 }}>
        <button
          onTouchEnd={e => { e.preventDefault(); setDrawer(true); setVisto(true) }}
          onClick={() => { setDrawer(true); setVisto(true) }}
          style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'7px 14px', borderRadius:9, cursor:'pointer',
            background: visto ? '#1C1814' : '#E8A33B14',
            border: `1px solid ${visto ? '#2C2520' : '#E8A33B44'}`,
          }}
        >
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {!visto && <span style={{ width:6, height:6, borderRadius:'50%', background:'#E8A33B', display:'inline-block', animation:'ldot 1.4s ease-in-out infinite', flexShrink:0 }} />}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8A33B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span style={{ color:'#D8CDB6', fontSize:13, fontWeight:500, fontFamily:"'Inter Tight',system-ui,sans-serif" }}>
              {recs.length === 1 ? `Recomendación: ${recs[0].producto_nombre}` : `${recs.length} recomendaciones hoy`}
            </span>
          </div>
          <span style={{ color:'#6B5F52', fontSize:11 }}>Ver →</span>
        </button>
      </div>

      {drawer && (
        <RecDrawer
          recs={recs}
          onCerrar={() => setDrawer(false)}
          onServido={onServido}
        />
      )}
    </>
  )
}
