'use client'
import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type StockItem   = { id: string; nombre: string; stock_actual: number; stock_minimo: number; unidad_compra: string }
type ElabItem    = { id: string; nombre: string; lote: string; fecha_caducidad: string; horas_restantes: number; urgencia: string }
type TopProducto = { nombre: string; unidades: number; ingresos: number }
type GraficaDay  = { fecha: string; total: number }

type DashData = {
  ventas_hoy: number; ventas_ayer: number; variacion_pct: number | null
  num_comandas: number; stock_critico: StockItem[]
  elaboraciones_criticas: ElabItem[]; top_productos_hoy: TopProducto[]
  grafica_semana: GraficaDay[]
}

const eur = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

function MiniBar({ data }: { data: GraficaDay[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.total), 1)
  const dias = ['L','M','X','J','V','S','D']
  return (
    <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:48 }}>
      {data.slice(-7).map((d, i) => {
        const isHoy = i === data.length - 1
        const h = Math.max(6, (d.total / max) * 100)
        const fecha = new Date(d.fecha)
        return (
          <div key={d.fecha} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
            <div title={`${d.fecha}: ${eur(d.total)}`} style={{
              width:'100%', borderRadius:'3px 3px 0 0',
              height:`${h}%`,
              background: isHoy ? C.green : `${C.ink4}66`,
              transition:'height .4s',
            }}/>
            <div style={{ fontFamily:SM, fontSize:9, color: isHoy ? C.green : C.ink4 }}>
              {dias[fecha.getDay()] ?? '?'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardTab({
  session,
  sh,
}: {
  session: { restaurante_id: string }
  sh: () => Record<string, string>
}) {
  const [data, setData]       = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hora, setHora]       = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/owner/dashboard', { headers: sh() })
    const d = await r.json().catch(() => null)
    if (d && !d.error) setData(d)
    setLoading(false)
  }, [sh])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }))
    tick()
    const iv = setInterval(tick, 30000)
    return () => clearInterval(iv)
  }, [])

  // Refrescar cada 5 min
  useEffect(() => {
    const iv = setInterval(cargar, 300000)
    return () => clearInterval(iv)
  }, [cargar])

  if (loading || !data) return (
    <div style={{ padding:40, textAlign:'center', fontFamily:SE, fontStyle:'italic', color:C.ink3, fontSize:15 }}>
      Cargando…
    </div>
  )

  const variPos = data.variacion_pct !== null && data.variacion_pct >= 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Cabecera del día */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:22, color:C.ink }}>
          {new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}
        </div>
        <div style={{ fontFamily:SM, fontSize:12, color:C.ink3 }}>{hora}</div>
      </div>

      {/* Ventas hoy — card principal */}
      <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:14, padding:'18px 20px' }}>
        <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>
          Ventas hoy
        </div>
        <div style={{ display:'flex', alignItems:'baseline', gap:14, marginBottom:12 }}>
          <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:40, color:C.ink }}>
            {eur(data.ventas_hoy)}
          </div>
          {data.variacion_pct !== null && (
            <div style={{ fontSize:14, fontWeight:700, color: variPos ? C.green : C.red }}>
              {variPos ? '+' : ''}{data.variacion_pct}% vs ayer
            </div>
          )}
        </div>
        <MiniBar data={data.grafica_semana} />
        <div style={{ fontFamily:SM, fontSize:11, color:C.ink4, marginTop:8 }}>
          {data.num_comandas} comandas cerradas hoy · Ayer: {eur(data.ventas_ayer)}
        </div>
      </div>

      {/* Alertas críticas — stock + elaboraciones */}
      {(data.stock_critico.length > 0 || data.elaboraciones_criticas.length > 0) && (
        <div style={{ background:'#FEF2F2', border:`1px solid ${C.red}33`, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.red, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>
            ⚠️ Alertas ahora
          </div>
          {data.elaboraciones_criticas.map(e => {
            const h = Math.round(Number(e.horas_restantes))
            return (
              <div key={e.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:`1px solid ${C.red}22` }}>
                <div style={{ fontSize:13, color:C.ink }}>🏷️ {e.nombre} <span style={{ color:C.ink3 }}>(lote {e.lote})</span></div>
                <div style={{ fontSize:12, fontWeight:700, color: h < 4 ? C.red : '#D97706' }}>
                  {h < 1 ? '< 1h' : `${h}h`}
                </div>
              </div>
            )
          })}
          {data.stock_critico.map(s => (
            <div key={s.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:`1px solid ${C.red}22` }}>
              <div style={{ fontSize:13, color:C.ink }}>📦 {s.nombre}</div>
              <div style={{ fontSize:12, color:C.red }}>
                {s.stock_actual} {s.unidad_compra} (mín {s.stock_minimo})
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top 5 productos de hoy */}
      {data.top_productos_hoy.length > 0 && (
        <div style={{ background:C.bone, border:`1px solid ${C.rule}`, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>
            Top productos hoy
          </div>
          {data.top_productos_hoy.map((p, i) => {
            const maxI = Math.max(...data.top_productos_hoy.map(x => x.ingresos), 1)
            return (
              <div key={p.nombre} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:13, color:C.ink }}>{i+1}. {p.nombre}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>
                    {eur(p.ingresos)} <span style={{ fontWeight:400, color:C.ink3 }}>({p.unidades} ud)</span>
                  </span>
                </div>
                <div style={{ height:4, background:C.paper, borderRadius:2, overflow:'hidden' }}>
                  <div style={{
                    height:'100%', width:`${(p.ingresos/maxI)*100}%`,
                    background: i===0 ? C.green : C.ink3+'88', borderRadius:2, transition:'width .5s'
                  }}/>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sin datos de hoy */}
      {data.num_comandas === 0 && data.stock_critico.length === 0 && data.elaboraciones_criticas.length === 0 && (
        <div style={{ padding:'40px 0', textAlign:'center' }}>
          <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:18, color:C.ink3, marginBottom:6 }}>
            Sin actividad hoy todavía
          </div>
          <div style={{ fontSize:13, color:C.ink4 }}>Las ventas y alertas aparecerán aquí en tiempo real</div>
        </div>
      )}

    </div>
  )
}
