'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Ingrediente = {
  nombre: string; producto_id: string | null; cantidad_por_persona: number
  unidad: string; cantidad_total: number; coste_unitario: number | null; coste_total: number | null; pase: string
}

const fmtEur = (n: number | null) => n != null ? n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'
const fmtNum = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2)

export default function PanelEscandallo({ eventoId, sh }: { eventoId: string; sh: () => Record<string, string> }) {
  const [data, setData] = useState<{
    evento: { aforo: number; factor: number; nombre: string }
    menu?: { nombre: string; precio_por_persona: number | null }
    escandallo: Ingrediente[]
    total_coste_estimado: number; coste_por_persona: number; margen_estimado: number | null; mensaje?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [factor, setFactor] = useState('1.0')
  const [guardando, setGuardando] = useState(false)
  const [filtroPase, setFiltroPase] = useState<string>('todos')

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/owner/eventos/escandallo?evento_id=${eventoId}`, { headers: sh() })
    const d = await r.json()
    setData(d)
    if (d.evento?.factor) setFactor(String(d.evento.factor))
    setLoading(false)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  const guardarFactor = async () => {
    setGuardando(true)
    await fetch('/api/owner/eventos/escandallo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ evento_id: eventoId, factor_escandallo: parseFloat(factor) || 1 }),
    })
    setGuardando(false)
    cargar()
  }

  if (loading) return <div style={{ padding: 12, color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando…</div>

  const pases = [...new Set(data?.escandallo.map(i => i.pase) ?? [])]
  const filtrados = filtroPase === 'todos' ? (data?.escandallo ?? []) : (data?.escandallo ?? []).filter(i => i.pase === filtroPase)

  return (
    <div style={{ marginTop: 10, background: '#fff', borderRadius: 8, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700 }}>🥗 Escandallo × aforo</div>
          {data?.evento && <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{data.evento.aforo} comensales{data.menu ? ` · ${data.menu.nombre}` : ''}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>Factor:</div>
          <input type="number" value={factor} step="0.05" min="0.5" max="2" onChange={e => setFactor(e.target.value)}
            style={{ width: 55, padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 12 }} />
          <button onClick={guardarFactor} disabled={guardando}
            style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: C.ink, color: '#fff', fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
            {guardando ? '…' : 'Aplicar'}
          </button>
        </div>
      </div>

      {data?.mensaje && (
        <div style={{ padding: 16, color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center' }}>{data.mensaje}</div>
      )}

      {!data?.mensaje && data && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 1, borderBottom: `1px solid ${C.rule}`, background: C.rule }}>
            {[
              ['Coste total', fmtEur(data.total_coste_estimado)],
              ['Coste/persona', fmtEur(data.coste_por_persona)],
              ['Margen estimado', data.margen_estimado != null ? `${data.margen_estimado}%` : '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#fff', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>{label}</div>
                <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700, color: C.ink }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Filtro por pase */}
          {pases.length > 1 && (
            <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['todos', ...pases].map(p => (
                <button key={p} onClick={() => setFiltroPase(p)}
                  style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${filtroPase === p ? C.red : C.rule}`, background: filtroPase === p ? C.red + '15' : 'transparent', color: filtroPase === p ? C.red : C.ink3, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                  {p === 'todos' ? 'Todos' : p}
                </button>
              ))}
            </div>
          )}

          {/* Tabla ingredientes */}
          <div style={{ padding: '8px 0', overflowX: 'auto' }}>
            <div style={{ minWidth: 380 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 0, padding: '4px 14px', borderBottom: `1px solid ${C.rule}` }}>
              {['Ingrediente', 'Por persona', 'Total', 'Coste total'].map(h => (
                <div key={h} style={{ fontFamily: SN, fontSize: 10, color: C.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</div>
              ))}
            </div>
            {filtrados.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 0, padding: '6px 14px', borderBottom: `1px solid ${C.rule}`, background: i % 2 === 0 ? '#fff' : C.paper + '44' }}>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink }}>{ing.nombre}</div>
                  <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>{ing.pase}</div>
                </div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, alignSelf: 'center' }}>{fmtNum(ing.cantidad_por_persona)} {ing.unidad}</div>
                <div style={{ fontFamily: SE, fontSize: 12, color: C.ink, alignSelf: 'center', fontWeight: 600 }}>{fmtNum(ing.cantidad_total)} {ing.unidad}</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: ing.coste_total ? C.ink : C.ink3, alignSelf: 'center' }}>{fmtEur(ing.coste_total)}</div>
              </div>
            ))}
            {filtrados.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontFamily: SN, fontSize: 12 }}>Sin ingredientes</div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
