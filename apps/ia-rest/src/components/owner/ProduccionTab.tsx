'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Articulo = {
  articulo_id: string; nombre: string; unidad: string
  cantidad_total: number; cantidad_a_pedir: number; stock_actual: number
  stock_suficiente: boolean; coste_total: number; coste_unitario: number
  proveedor_id: string | null; proveedor_nombre: string | null; proveedor_email: string | null
  por_evento: { evento_id: string; cliente: string; fecha: string; cantidad: number }[]
}
type ProveedorData = {
  proveedor_nombre: string; proveedor_email: string | null
  articulos: Articulo[]; total_coste: number; tiene_pendiente: boolean
}
type Evento = {
  id: string; cliente_nombre: string; tipo: string; fecha_evento: string
  hora_inicio: string | null; aforo: number; estado: string
  restaurante_nombre: string; tiene_menu: boolean; num_pases: number; num_items: number
}
type Data = {
  desde: string; hasta: string; eventos: Evento[]
  lista_compra: Articulo[]; por_proveedor: Record<string, ProveedorData>
  total_articulos: number; total_coste_estimado: number; articulos_sin_stock: number
}

const TIPO_ICON: Record<string, string> = { boda:'💍', comunion:'⛪', bautizo:'👶', cumpleanos:'🎂', empresa:'🏢', otro:'📅' }
const fmtEur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtNum = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })
const fmtFecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

export default function ProduccionTab({ sh }: { sh: () => Record<string, string> }) {
  const hoy = new Date()
  const en7 = new Date(hoy); en7.setDate(hoy.getDate() + 7)
  const [desde, setDesde] = useState(hoy.toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(en7.toISOString().slice(0, 10))
  const [modo, setModo] = useState<'local' | 'grupo'>('local')
  const [vista, setVista] = useState<'proveedor' | 'completa' | 'eventos'>('proveedor')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [pedidosEnCurso, setPedidosEnCurso] = useState<Set<string>>(new Set())
  const [pedidosHechos, setPedidosHechos] = useState<Set<string>>(new Set())
  const [detalle, setDetalle] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/owner/eventos/produccion?desde=${desde}&hasta=${hasta}&modo=${modo}`, { headers: sh() })
    const d = await r.json()
    setData(d)
    setLoading(false)
  }, [desde, hasta, modo, sh])

  useEffect(() => { cargar() }, [cargar])

  const pedirProveedor = async (pKey: string, prov: ProveedorData) => {
    if (pedidosHechos.has(pKey)) return
    setPedidosEnCurso(prev => new Set([...prev, pKey]))
    await fetch('/api/owner/eventos/produccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ proveedor_id: pKey === 'sin_proveedor' ? null : pKey, articulos: prov.articulos.filter(a => a.cantidad_a_pedir > 0), notas_pedido: `Producción ${desde} → ${hasta}` }),
    })
    setPedidosHechos(prev => new Set([...prev, pKey]))
    setPedidosEnCurso(prev => { const s = new Set(prev); s.delete(pKey); return s })
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, fontStyle: 'italic', color: C.ink, marginBottom: 3 }}>🏭 Panel de producción</div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Escandallo consolidado de todos los eventos → lista de compra automática por proveedor</div>
      </div>

      {/* Controles responsive */}
      <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Desde</div>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              style={{ padding: '6px 8px', border: `1px solid ${C.rule}`, borderRadius: 6, fontFamily: SN, fontSize: 13, width: 140 }} />
          </div>
          <div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Hasta</div>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              style={{ padding: '6px 8px', border: `1px solid ${C.rule}`, borderRadius: 6, fontFamily: SN, fontSize: 13, width: 140 }} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['local', 'grupo'] as const).map(m => (
              <button key={m} onClick={() => setModo(m)}
                style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${modo === m ? C.red : C.rule}`, background: modo === m ? C.red + '15' : 'transparent', color: modo === m ? C.red : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer', fontWeight: modo === m ? 600 : 400 }}>
                {m === 'local' ? '🏠 Local' : '🏢 Grupo'}
              </button>
            ))}
            {[['7d', 0, 7], ['14d', 0, 14], ['Mes', 0, 30]].map(([l, , d1]) => (
              <button key={l as string} onClick={() => { const h = new Date(); const f = new Date(); f.setDate(h.getDate() + (d1 as number)); setDesde(h.toISOString().slice(0,10)); setHasta(f.toISOString().slice(0,10)) }}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 11, color: C.ink3, cursor: 'pointer' }}>
                {l as string}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 32, color: C.ink3, fontFamily: SN }}>Calculando escandallos…</div>}

      {!loading && data && (
        <>
          {/* KPIs responsive */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Eventos', val: String(data.eventos.length), color: C.ink },
              { label: 'Artículos', val: String(data.total_articulos), color: C.ink },
              { label: 'Coste est.', val: fmtEur(data.total_coste_estimado), color: C.ink },
              { label: 'Sin stock', val: String(data.articulos_sin_stock), color: data.articulos_sin_stock > 0 ? C.red : C.green },
            ].map(k => (
              <div key={k.label} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Tabs vista */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['proveedor', '📦 Proveedor'], ['completa', '📋 Lista'], ['eventos', '📅 Eventos']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVista(v)}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${vista === v ? C.red : C.rule}`, background: vista === v ? C.red + '15' : 'transparent', color: vista === v ? C.red : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer', fontWeight: vista === v ? 600 : 400 }}>
                {l}
              </button>
            ))}
          </div>

          {/* Vista por proveedor */}
          {vista === 'proveedor' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {Object.entries(data.por_proveedor).length === 0 && (
                <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 24, textAlign: 'center', color: C.ink3, fontFamily: SN, fontSize: 13 }}>
                  Sin escandallos asignados a los eventos del período
                </div>
              )}
              {Object.entries(data.por_proveedor).map(([pKey, prov]) => {
                const hecho = pedidosHechos.has(pKey)
                const enCurso = pedidosEnCurso.has(pKey)
                const pendientes = prov.articulos.filter(a => !a.stock_suficiente)
                return (
                  <div key={pKey} style={{ background: C.paper, border: `1px solid ${prov.tiene_pendiente && !hecho ? C.red + '55' : C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{prov.proveedor_nombre}</div>
                        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>
                          {prov.articulos.length} artículos · {fmtEur(prov.total_coste)}
                          {pendientes.length > 0 && <span style={{ color: C.red, marginLeft: 6 }}>⚠️ {pendientes.length} sin stock</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setDetalle(detalle === pKey ? null : pKey)}
                          style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink2, cursor: 'pointer' }}>
                          {detalle === pKey ? '▲' : '▼'}
                        </button>
                        {prov.proveedor_email && (
                          <button onClick={() => pedirProveedor(pKey, prov)} disabled={hecho || enCurso || pendientes.length === 0}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: hecho ? C.green : pendientes.length === 0 ? C.rule : C.red, color: pendientes.length === 0 ? C.ink3 : '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: hecho || pendientes.length === 0 ? 'not-allowed' : 'pointer' }}>
                            {hecho ? '✅ Enviado' : enCurso ? '⏳…' : pendientes.length === 0 ? '✓ OK' : `📧 Pedir ${pendientes.length}`}
                          </button>
                        )}
                      </div>
                    </div>
                    {detalle === pKey && (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 480 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 70px 80px', padding: '5px 14px', background: '#f5f5f5', borderBottom: `1px solid ${C.rule}` }}>
                            {['Artículo', 'Necesario', 'Stock', 'Pedir', 'Coste'].map(h => (
                              <div key={h} style={{ fontFamily: SN, fontSize: 10, color: C.ink3, fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
                            ))}
                          </div>
                          {prov.articulos.map((art, i) => (
                            <div key={art.articulo_id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 70px 80px', padding: '7px 14px', borderBottom: `1px solid ${C.rule}`, background: !art.stock_suficiente ? '#FFF5F5' : i % 2 === 0 ? '#fff' : C.paper + '44' }}>
                              <div>
                                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink }}>{art.nombre}</div>
                                {!art.stock_suficiente && <div style={{ color: C.red, fontSize: 10 }}>⚠️ falta</div>}
                              </div>
                              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, alignSelf: 'center' }}>{fmtNum(art.cantidad_total)} {art.unidad}</div>
                              <div style={{ fontFamily: SE, fontSize: 12, color: art.stock_suficiente ? C.green : C.red, fontWeight: 600, alignSelf: 'center' }}>{fmtNum(art.stock_actual)}</div>
                              <div style={{ fontFamily: SE, fontSize: 12, color: art.cantidad_a_pedir > 0 ? C.red : C.ink3, fontWeight: art.cantidad_a_pedir > 0 ? 700 : 400, alignSelf: 'center' }}>
                                {art.cantidad_a_pedir > 0 ? `${fmtNum(art.cantidad_a_pedir)}` : '—'}
                              </div>
                              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, alignSelf: 'center' }}>{fmtEur(art.coste_total)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Vista lista completa */}
          {vista === 'completa' && (
            <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      {['Artículo', 'Necesario', 'Stock', 'Pedir', 'Proveedor', 'Coste'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontFamily: SN, fontSize: 10, color: C.ink3, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${C.rule}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.lista_compra.map((art, i) => (
                      <tr key={art.articulo_id} style={{ background: !art.stock_suficiente ? '#FFF5F5' : i % 2 === 0 ? '#fff' : C.paper + '55' }}>
                        <td style={{ padding: '8px 12px', fontFamily: SN, fontSize: 12 }}>
                          {art.nombre}{!art.stock_suficiente && <span style={{ color: C.red, fontSize: 10, marginLeft: 4 }}>⚠️</span>}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: SN, fontSize: 12, color: C.ink2, whiteSpace: 'nowrap' }}>{fmtNum(art.cantidad_total)} {art.unidad}</td>
                        <td style={{ padding: '8px 12px', fontFamily: SE, fontSize: 12, fontWeight: 600, color: art.stock_suficiente ? C.green : C.red, whiteSpace: 'nowrap' }}>{fmtNum(art.stock_actual)}</td>
                        <td style={{ padding: '8px 12px', fontFamily: SE, fontSize: 12, fontWeight: art.cantidad_a_pedir > 0 ? 700 : 400, color: art.cantidad_a_pedir > 0 ? C.red : C.ink3 }}>
                          {art.cantidad_a_pedir > 0 ? `${fmtNum(art.cantidad_a_pedir)} ${art.unidad}` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: SN, fontSize: 11, color: C.ink3, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.proveedor_nombre ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: SN, fontSize: 12, color: C.ink3, whiteSpace: 'nowrap' }}>{fmtEur(art.coste_total)}</td>
                      </tr>
                    ))}
                    {data.lista_compra.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: C.ink3, fontFamily: SN }}>Sin artículos con escandallo</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Vista eventos */}
          {vista === 'eventos' && (
            <div style={{ display: 'grid', gap: 8 }}>
              {data.eventos.length === 0 && (
                <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 24, textAlign: 'center', color: C.ink3, fontFamily: SN }}>Sin eventos en el período seleccionado</div>
              )}
              {data.eventos.map(ev => (
                <div key={ev.id} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14 }}>{TIPO_ICON[ev.tipo] ?? '📅'}</span>
                        <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{ev.cliente_nombre}</span>
                        {modo === 'grupo' && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>· {ev.restaurante_nombre}</span>}
                      </div>
                      <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                        {fmtFecha(ev.fecha_evento)}{ev.hora_inicio ? ` · ${ev.hora_inicio.slice(0,5)}` : ''} · {ev.aforo} pax
                      </div>
                      {ev.tiene_menu && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontFamily: SN, fontSize: 11, color: C.green, background: C.green + '18', padding: '2px 8px', borderRadius: 99 }}>
                            ✅ {ev.num_pases} pases · {ev.num_items} items
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {!ev.tiene_menu && <span style={{ fontFamily: SN, fontSize: 11, color: C.amber, background: C.amber + '18', padding: '2px 8px', borderRadius: 99 }}>⚠️ Sin menú</span>}
                      <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#6B728018', color: '#6B7280' }}>{ev.estado.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
