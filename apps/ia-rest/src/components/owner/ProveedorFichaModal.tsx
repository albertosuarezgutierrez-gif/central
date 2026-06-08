'use client'
// ProveedorFichaModal — Ficha completa del proveedor: estadísticas, incidencias, ASN
// Usado desde ProveedoresTab en /owner

import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Proveedor {
  id: string; nombre: string; email: string | null; telefono: string | null
  whatsapp?: string | null; fiabilidad_pct?: number | null; incidencias_total?: number
  asn_activo?: boolean
}

interface Incidencia {
  id: string; tipo: string; articulo_nombre: string | null
  detalle: Record<string, unknown>; estado: string
  notificado_proveedor: boolean; created_at: string
}

interface Stats {
  total_pedidos: number; total_recepciones: number; total_incidencias: number
  tasa_incidencias_pct: number; desviacion_precio_media_pct: number
  fiabilidad_entrega_pct: number | null; items_total: number; items_con_incidencia: number
}

const TIPO_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  merma:           { label: 'Merma',          color: '#E8A33B', icon: '⬇️' },
  precio_diferente: { label: 'Precio diferente', color: '#D9442B', icon: '💰' },
  no_pedido:       { label: 'No pedido',      color: '#6366F1', icon: '❓' },
  retraso:         { label: 'Retraso',        color: '#8B5CF6', icon: '🕐' },
  calidad:         { label: 'Calidad',        color: '#EF4444', icon: '⚠️' },
}

export default function ProveedorFichaModal({
  proveedor, sh, onClose
}: {
  proveedor: Proveedor
  sh: () => Record<string, string>
  onClose: () => void
}) {
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [loading,     setLoading]     = useState(true)
  const [dias,        setDias]        = useState(90)
  const [asnLoading,  setAsnLoading]  = useState(false)
  const [asnUrl,      setAsnUrl]      = useState<string | null>(null)
  const [pedidoIdAsn, setPedidoIdAsn] = useState('')
  const [copied,      setCopied]      = useState(false)

  const load = async () => {
    setLoading(true)
    const r = await fetch(`/api/owner/proveedores/informe?proveedor_id=${proveedor.id}&dias=${dias}`, { headers: sh() })
    const d = await r.json()
    setStats(d.stats ?? null)
    setIncidencias(d.incidencias ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [dias])

  const generarASN = async () => {
    if (!pedidoIdAsn.trim()) return
    setAsnLoading(true)
    const r = await fetch('/api/owner/proveedores/asn-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ pedido_id: pedidoIdAsn.trim() }),
    })
    const d = await r.json()
    if (d.ok) setAsnUrl(d.asn_url)
    setAsnLoading(false)
  }

  const copiarASN = () => {
    if (!asnUrl) return
    navigator.clipboard.writeText(asnUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fiabilidad = stats?.fiabilidad_entrega_pct ?? proveedor.fiabilidad_pct ?? null
  const fiabColor  = fiabilidad == null ? C.ink3 : fiabilidad >= 90 ? C.green : fiabilidad >= 75 ? C.amber : C.red

  return (
    <div style={{ position:'fixed', inset:0, background:'#00000088', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:C.paper, borderRadius:16, padding:24, width:'100%', maxWidth:640, maxHeight:'92vh', overflowY:'auto' as const, boxShadow:'0 24px 80px #00000055' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:21, color:C.ink }}>{proveedor.nombre}</div>
            <div style={{ fontFamily:SM, fontSize:10, color:C.ink3, marginTop:2 }}>
              {proveedor.email && <span style={{ marginRight:12 }}>✉ {proveedor.email}</span>}
              {(proveedor.whatsapp || proveedor.telefono) && <span>📱 {proveedor.whatsapp || proveedor.telefono}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:C.ink3, fontSize:20 }}>✕</button>
        </div>

        {/* Selector periodo */}
        <div style={{ display:'flex', gap:6, marginBottom:18 }}>
          {[30, 60, 90, 180].map(d => (
            <button key={d} onClick={() => setDias(d)} style={{
              fontFamily:SM, fontSize:10, padding:'4px 10px',
              background: dias === d ? C.ink : C.bone,
              color: dias === d ? C.paper : C.ink3,
              border:`1px solid ${C.rule}`, borderRadius:6, cursor:'pointer',
            }}>
              {d}d
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:40, fontFamily:SE, fontStyle:'italic', color:C.ink3 }}>Cargando…</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:20 }}>
              {[
                { label:'Fiabilidad', value: fiabilidad != null ? `${fiabilidad}%` : '—', color: fiabColor },
                { label:'Incidencias', value: stats?.total_incidencias ?? 0, color: stats?.total_incidencias ? C.red : C.green },
                { label:'Desv. precio', value: stats?.desviacion_precio_media_pct != null ? `${stats.desviacion_precio_media_pct > 0 ? '+' : ''}${stats.desviacion_precio_media_pct}%` : '—', color: (stats?.desviacion_precio_media_pct ?? 0) > 5 ? C.red : C.ink },
                { label:'Pedidos', value: stats?.total_pedidos ?? 0, color: C.ink },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background:C.bone, borderRadius:10, padding:'10px 12px', border:`1px solid ${C.rule}` }}>
                  <div style={{ fontFamily:SM, fontSize:8, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:5 }}>{label}</div>
                  <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Lista incidencias */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
                Incidencias últimos {dias} días ({incidencias.length})
              </div>
              {incidencias.length === 0 ? (
                <div style={{ fontFamily:SN, fontSize:13, color:C.green, padding:'10px 0' }}>✅ Sin incidencias en este periodo</div>
              ) : (
                incidencias.slice(0, 12).map(inc => {
                  const tipo = TIPO_LABELS[inc.tipo] ?? { label: inc.tipo, color: C.ink3, icon: '•' }
                  return (
                    <div key={inc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.rule}` }}>
                      <span style={{ fontSize:16 }}>{tipo.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:SN, fontSize:12, color:C.ink, fontWeight:600 }}>{inc.articulo_nombre ?? '—'}</div>
                        <div style={{ fontFamily:SM, fontSize:10, color:C.ink3 }}>
                          {new Date(inc.created_at).toLocaleDateString('es')}
                          {inc.detalle?.cantidad_pedida != null && inc.detalle?.cantidad_recibida != null && (
                            <span> · Pedido {String(inc.detalle.cantidad_pedida)}, recibido {String(inc.detalle.cantidad_recibida)}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                        <span style={{ fontFamily:SM, fontSize:9, color: tipo.color, fontWeight:700 }}>{tipo.label}</span>
                        {inc.notificado_proveedor && (
                          <span style={{ fontFamily:SM, fontSize:8, color:C.green }}>✓ notificado</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* ASN — Portal proveedor */}
            <div style={{ background:C.paper2, borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
                🔗 Portal ASN — Pre-notificación de envío
              </div>
              <div style={{ fontFamily:SN, fontSize:12, color:C.ink2, marginBottom:12 }}>
                Genera un link para que el proveedor confirme el envío antes de llegar. La recepción queda pre-cargada automáticamente.
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <input
                  value={pedidoIdAsn}
                  onChange={e => setPedidoIdAsn(e.target.value)}
                  placeholder="ID del pedido (de la lista de pedidos)"
                  style={{ flex:1, padding:'7px 11px', border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:12, color:C.ink, background:C.bone, outline:'none' }}
                />
                <button onClick={generarASN} disabled={asnLoading || !pedidoIdAsn.trim()} style={{
                  fontFamily:SN, fontSize:12, fontWeight:700, padding:'7px 14px',
                  background: asnLoading ? C.rule : C.ink, color:C.paper,
                  border:'none', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap' as const,
                }}>
                  {asnLoading ? '…' : 'Generar link'}
                </button>
              </div>
              {asnUrl && (
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ flex:1, fontFamily:SM, fontSize:10, color:C.ink3, background:C.bone, border:`1px solid ${C.rule}`, borderRadius:6, padding:'6px 10px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                    {asnUrl}
                  </div>
                  <button onClick={copiarASN} style={{
                    fontFamily:SN, fontSize:11, padding:'6px 12px', background:C.green, color:'#fff',
                    border:'none', borderRadius:6, cursor:'pointer', whiteSpace:'nowrap' as const,
                  }}>
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              )}
            </div>

            {/* Exportar informe */}
            <button
              onClick={() => {
                const lines = [
                  `INFORME PROVEEDOR: ${proveedor.nombre}`,
                  `Periodo: últimos ${dias} días`,
                  `Fecha: ${new Date().toLocaleDateString('es')}`,
                  '',
                  `ESTADÍSTICAS`,
                  `Fiabilidad entrega: ${fiabilidad != null ? fiabilidad + '%' : 'Sin datos'}`,
                  `Total incidencias: ${stats?.total_incidencias ?? 0}`,
                  `Tasa incidencias: ${stats?.tasa_incidencias_pct ?? 0}%`,
                  `Desviación media precio: ${stats?.desviacion_precio_media_pct ?? 0}%`,
                  `Pedidos realizados: ${stats?.total_pedidos ?? 0}`,
                  '',
                  `DETALLE INCIDENCIAS`,
                  ...incidencias.map(i => `${new Date(i.created_at).toLocaleDateString('es')} · ${TIPO_LABELS[i.tipo]?.label ?? i.tipo} · ${i.articulo_nombre ?? '—'}`),
                ]
                const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `informe-${proveedor.nombre.toLowerCase().replace(/\s+/g,'-')}-${dias}d.txt`
                a.click(); URL.revokeObjectURL(url)
              }}
              style={{ width:'100%', padding:'10px', fontFamily:SN, fontSize:13, background:C.bone, color:C.ink2, border:`1px solid ${C.rule}`, borderRadius:8, cursor:'pointer' }}
            >
              📄 Exportar informe para reunión
            </button>
          </>
        )}
      </div>
    </div>
  )
}
