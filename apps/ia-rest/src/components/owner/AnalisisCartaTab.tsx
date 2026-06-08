'use client'
import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Clasificacion = 'estrella' | 'vaca' | 'interrogante' | 'perro'

type Producto = {
  id: string
  nombre: string
  precio: number
  categoria: string
  unidades: number
  ingresos: number
  margen_pct: number | null
  margen_eur: number | null
  ultima_venta: string | null
  sin_ventas: boolean
  clasificacion: Clasificacion | 'sin_datos'
}

type Resumen = {
  total: number
  estrellas: number
  perros: number
  sin_ventas: number
  ingreso_total: number
}

const CLASES: Record<Clasificacion, { label: string; emoji: string; color: string; bg: string; desc: string }> = {
  estrella:     { label: 'Estrellas',     emoji: '⭐', color: '#B87333', bg: '#FEF3C7', desc: 'Alto volumen · alto margen — tus mejores platos' },
  vaca:         { label: 'Vacas',         emoji: '🐄', color: '#1D6A4E', bg: '#D1FAE5', desc: 'Alto volumen · margen bajo o sin datos — generan caja' },
  interrogante: { label: 'Interrogantes', emoji: '❓', color: '#1E4A8A', bg: '#DBEAFE', desc: 'Buen margen · pocas ventas — empújalos más' },
  perro:        { label: 'Perros',        emoji: '🐕', color: '#7F1D1D', bg: '#FEE2E2', desc: 'Pocas ventas · margen bajo — revisar o retirar' },
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function fmtEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

export default function AnalisisCartaTab({ sh }: { sh: () => Record<string, string> }) {
  const [dias, setDias] = useState(30)
  const [loading, setLoading] = useState(true)
  const [productos, setProductos] = useState<Producto[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [umbral, setUmbral] = useState(5)
  const [filtro, setFiltro] = useState<Clasificacion | 'todos' | 'sin_ventas'>('todos')
  const [err, setErr] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`/api/owner/carta/analisis?dias=${dias}`, { headers: sh() })
      if (!r.ok) throw new Error('Error cargando análisis')
      const d = await r.json()
      setProductos(d.productos ?? [])
      setResumen(d.resumen ?? null)
      setUmbral(d.umbral_ventas ?? 5)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [dias, sh])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = productos.filter(p => {
    if (filtro === 'todos') return true
    if (filtro === 'sin_ventas') return p.sin_ventas
    return p.clasificacion === filtro
  })

  // Alertas automáticas
  const alertas: string[] = []
  const sinVender = productos.filter(p => p.sin_ventas)
  if (sinVender.length > 0) alertas.push(`${sinVender.length} plato${sinVender.length > 1 ? 's' : ''} sin una sola venta en ${dias} días: ${sinVender.slice(0, 3).map(p => p.nombre).join(', ')}${sinVender.length > 3 ? '…' : ''}`)
  const interrogantes = productos.filter(p => p.clasificacion === 'interrogante')
  if (interrogantes.length > 0) alertas.push(`${interrogantes.length} plato${interrogantes.length > 1 ? 's' : ''} con buen margen pero pocas ventas — empújalos: ${interrogantes.slice(0, 2).map(p => `${p.nombre} (${p.margen_pct?.toFixed(0)}%)`).join(', ')}`)
  const perrosConMargen = productos.filter(p => p.clasificacion === 'perro' && p.margen_pct !== null && p.margen_pct < 40)
  if (perrosConMargen.length > 0) alertas.push(`${perrosConMargen.length} plato${perrosConMargen.length > 1 ? 's' : ''} con bajo margen Y pocas ventas — considera retirarlos de la carta`)

  return (
    <div style={{ fontFamily: SN }}>
      {/* ── Header con selector de período ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 2 }}>Análisis de carta</div>
          <div style={{ fontSize: 12, color: C.ink3 }}>Rendimiento real de cada plato — ventas × margen</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDias(d)} style={{
              padding: '5px 14px', borderRadius: 20, border: `1px solid ${dias === d ? C.red : C.rule}`,
              background: dias === d ? C.red : C.bone, color: dias === d ? '#fff' : C.ink3,
              fontFamily: SN, fontSize: 12, cursor: 'pointer', fontWeight: dias === d ? 700 : 400,
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {err && <div style={{ background: '#FEE2E2', border: '1px solid #F87171', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7F1D1D' }}>{err}</div>}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: C.ink3, fontFamily: SE, fontStyle: 'italic' }}>Analizando carta…</div>
      ) : (
        <>
          {/* ── Cards resumen ── */}
          {resumen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Ingresos', val: fmtEur(resumen.ingreso_total), sub: `últimos ${dias}d`, color: C.green },
                { label: 'Estrellas', val: String(resumen.estrellas), sub: 'alto vol + margen', color: '#B87333' },
                { label: 'Sin ventas', val: String(resumen.sin_ventas), sub: `en ${dias} días`, color: resumen.sin_ventas > 0 ? C.red : C.ink3 },
                { label: 'Total platos', val: String(resumen.total), sub: 'activos en carta', color: C.ink3 },
              ].map(card => (
                <div key={card.label} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{card.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: SE, fontStyle: 'italic' }}>{card.val}</div>
                  <div style={{ fontSize: 11, color: C.ink4 }}>{card.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Alertas automáticas ── */}
          {alertas.length > 0 && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#78350F', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>⚠️</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Grid BCG visual ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {(Object.entries(CLASES) as [Clasificacion, typeof CLASES[Clasificacion]][]).map(([clave, info]) => {
              const items = productos.filter(p => p.clasificacion === clave)
              return (
                <div
                  key={clave}
                  onClick={() => setFiltro(filtro === clave ? 'todos' : clave)}
                  style={{
                    background: filtro === clave ? info.bg : C.bone,
                    border: `1.5px solid ${filtro === clave ? info.color + '88' : C.rule}`,
                    borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{info.emoji} {info.label}</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: info.color, fontFamily: SE, fontStyle: 'italic' }}>{items.length}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.ink3, marginBottom: 8 }}>{info.desc}</div>
                  {items.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                      {items.slice(0, 3).map(p => (
                        <span key={p.id} style={{ fontSize: 11, background: info.bg, border: `1px solid ${info.color}44`, borderRadius: 12, padding: '2px 8px', color: info.color, fontWeight: 500 }}>
                          {p.nombre}
                        </span>
                      ))}
                      {items.length > 3 && <span style={{ fontSize: 11, color: C.ink4 }}>+{items.length - 3} más</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Filtros lista ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
            {[
              { id: 'todos', label: `Todos (${productos.length})` },
              { id: 'estrella', label: `⭐ ${productos.filter(p => p.clasificacion === 'estrella').length}` },
              { id: 'vaca', label: `🐄 ${productos.filter(p => p.clasificacion === 'vaca').length}` },
              { id: 'interrogante', label: `❓ ${productos.filter(p => p.clasificacion === 'interrogante').length}` },
              { id: 'perro', label: `🐕 ${productos.filter(p => p.clasificacion === 'perro').length}` },
              { id: 'sin_ventas', label: `🚫 Sin ventas (${productos.filter(p => p.sin_ventas).length})` },
            ].map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id as typeof filtro)} style={{
                padding: '4px 12px', borderRadius: 20,
                border: `1px solid ${filtro === f.id ? C.red : C.rule}`,
                background: filtro === f.id ? C.red : C.bone,
                color: filtro === f.id ? '#fff' : C.ink3,
                fontFamily: SN, fontSize: 12, cursor: 'pointer',
              }}>{f.label}</button>
            ))}
          </div>

          {/* ── Tabla de productos ── */}
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
            {/* Cabecera */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px 80px 90px', gap: 0, background: C.bone, padding: '8px 14px', borderBottom: `1px solid ${C.rule}` }}>
              {['Plato', 'Precio', 'Vendidos', 'Ingresos', 'Margen', 'Estado'].map(h => (
                <span key={h} style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>{h}</span>
              ))}
            </div>

            {filtrados.length === 0 && (
              <div style={{ padding: '28px 14px', textAlign: 'center' as const, color: C.ink3, fontFamily: SE, fontStyle: 'italic', fontSize: 14 }}>
                No hay platos en esta categoría
              </div>
            )}

            {filtrados.map((p, i) => {
              const info = p.clasificacion !== 'sin_datos' ? CLASES[p.clasificacion as Clasificacion] : null
              const diasSinVenta = diasDesde(p.ultima_venta)
              return (
                <div key={p.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px 80px 90px',
                  padding: '10px 14px', borderBottom: i < filtrados.length - 1 ? `1px solid ${C.rule}` : 'none',
                  background: p.sin_ventas ? '#FFF7F7' : 'transparent',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: C.ink3 }}>{p.categoria}{diasSinVenta !== null && diasSinVenta > 7 ? ` · última venta hace ${diasSinVenta}d` : ''}</div>
                  </div>
                  <span style={{ fontSize: 13, color: C.ink2 }}>{p.precio.toFixed(2)} €</span>
                  <span style={{ fontSize: 13, color: p.unidades > 0 ? C.ink : C.ink4, fontWeight: p.unidades > 0 ? 600 : 400 }}>{p.unidades}</span>
                  <span style={{ fontSize: 13, color: C.ink2 }}>{p.ingresos > 0 ? p.ingresos.toFixed(0) + ' €' : '—'}</span>
                  <span style={{ fontSize: 13, color: p.margen_pct !== null ? (p.margen_pct >= 55 ? C.green : p.margen_pct >= 40 ? C.amber : C.red) : C.ink4 }}>
                    {p.margen_pct !== null ? `${p.margen_pct.toFixed(0)}%` : '—'}
                  </span>
                  {info ? (
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, background: info.bg, color: info.color, fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' as const }}>
                      {info.emoji} {info.label.slice(0, -1)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: C.ink4 }}>—</span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: C.ink4 }}>
            Umbral ventas: {umbral} unidades en {dias} días · Umbral margen: 55%
          </div>
        </>
      )}
    </div>
  )
}
