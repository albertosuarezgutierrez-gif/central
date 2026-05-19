'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'


const ESTADOS = [
  { key:'pendiente',  label:'Pedido recibido',  sub:'Esperando confirmación' },
  { key:'confirmado', label:'Confirmado',        sub:'Lo tenemos' },
  { key:'en_cocina',  label:'En cocina',         sub:'Preparando tu pedido' },
  { key:'listo',      label:'Listo',             sub:'Preparado para entregar' },
  { key:'entregado',  label:'Entregado',         sub:'¡Disfrútalo!' },
]

interface Pedido {
  id:string; numero:number; estado:string; tipo:string
  cliente_nombre:string
  items:Array<{nombre:string; cantidad:number; precio_unitario:number}>
  total:number; created_at:string
}

export default function TrackingPage({ params }:{ params:{ slug:string; id:string } }) {
  const [pedido, setPedido] = useState<Pedido|null>(null)
  const [cargando, setLoad] = useState(true)

  useEffect(() => {
    fetch(`/api/storefront/pedido?id=${params.id}`)
      .then(r => r.json())
      .then(d => { if (d.pedido) setPedido(d.pedido) })
      .finally(() => setLoad(false))

    const ch = supabase.channel(`tracking-${params.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'pedidos_online', filter:`id=eq.${params.id}` },
        payload => setPedido(prev => prev ? {...prev, ...(payload.new as Partial<Pedido>)} : prev))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [params.id])

  if (cargando) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:32, height:32, border:`3px solid ${C.verm}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!pedido) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <p style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>Pedido no encontrado</p>
    </div>
  )

  const estadoIdx = ESTADOS.findIndex(e => e.key===pedido.estado)
  const estadoActual = ESTADOS[estadoIdx]

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, fontFamily:SN }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ maxWidth:480, margin:'0 auto', padding:'32px 16px 40px' }}>

        {/* Estado principal */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>
            Pedido #{pedido.numero}
          </div>
          <div style={{ fontFamily:SE, fontSize:26, color:C.ink, marginBottom:4 }}>
            {estadoActual?.label ?? pedido.estado}
          </div>
          <div style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>{estadoActual?.sub}</div>
          {pedido.estado!=='entregado' && (
            <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginTop:8 }}>Actualizando en tiempo real</div>
          )}
        </div>

        {/* Barra de progreso */}
        <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, padding:'16px 20px', marginBottom:12 }}>
          {ESTADOS.map((estado, idx) => {
            const completado = idx<=estadoIdx
            const activo     = idx===estadoIdx
            const ultimo     = idx===ESTADOS.length-1
            return (
              <div key={estado.key} style={{ display:'flex', gap:14 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{
                    width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                    background:completado?C.verm:C.bg2, color:completado?C.bg:C.ink4,
                    fontFamily:SM, fontSize:11, fontWeight:700, flexShrink:0,
                    transform:activo?'scale(1.15)':'scale(1)',
                    boxShadow:activo?`0 0 0 3px ${C.verm}33`:'none',
                    transition:'all .2s',
                  }}>
                    {completado&&!activo ? '✓' : idx+1}
                  </div>
                  {!ultimo && (
                    <div style={{ width:2, height:20, margin:'2px 0', background:idx<estadoIdx?C.verm:C.rule, transition:'background .3s' }} />
                  )}
                </div>
                <div style={{ flex:1, paddingTop:6, paddingBottom:ultimo?0:4 }}>
                  <div style={{ fontFamily:SN, fontSize:13, fontWeight:completado?600:400, color:completado?C.ink:C.ink4 }}>
                    {estado.label}
                  </div>
                  {activo && (
                    <div style={{ fontFamily:SN, fontSize:11, color:C.verm, marginTop:1 }}>{estado.sub}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Resumen del pedido */}
        <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:`1px solid ${C.rule}` }}>
            <span style={{ fontFamily:SN, fontSize:11, fontWeight:600, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em' }}>
              {pedido.tipo==='delivery' ? 'Delivery' : 'Recogida en local'}
            </span>
          </div>
          {pedido.items.map((item,i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderBottom:i<pedido.items.length-1?`1px solid ${C.rule}`:'none' }}>
              <span style={{ fontFamily:SN, fontSize:13, color:C.ink2 }}>
                <span style={{ color:C.ink4, marginRight:6 }}>{item.cantidad}×</span>
                {item.nombre}
              </span>
              <span style={{ fontFamily:SM, fontSize:12, color:C.ink3 }}>
                {(item.precio_unitario*item.cantidad).toFixed(2)} €
              </span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderTop:`1px solid ${C.rule}` }}>
            <span style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:C.ink }}>Total</span>
            <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:C.verm }}>{pedido.total.toFixed(2)} €</span>
          </div>
        </div>

        <p style={{ fontFamily:SN, fontSize:11, color:C.ink4, textAlign:'center', marginTop:20 }}>
          Esta página se actualiza sola
        </p>
      </div>
    </div>
  )
}
