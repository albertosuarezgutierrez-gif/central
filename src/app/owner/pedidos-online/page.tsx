'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'


interface PedidoOnline {
  id:string; numero:number; tipo:string; canal:string; estado:string
  cliente_nombre:string; cliente_telefono:string; cliente_direccion?:string
  items:Array<{nombre:string;cantidad:number;precio_unitario:number;notas?:string}>
  total:number; cobro:string; tiempo_recogida_min:number; created_at:string
}
interface Session { id:string; nombre:string; rol:string; restaurante_id:string }

const ESTADO_CFG: Record<string,{label:string;bg:string;fg:string;next:string;nextLabel:string}> = {
  pendiente:  {label:'Pendiente', bg:C.ambS, fg:C.amb, next:'confirmado', nextLabel:'Confirmar'},
  confirmado: {label:'Confirmado',bg:C.blS,  fg:C.bl,  next:'en_cocina',  nextLabel:'Enviar a cocina'},
  en_cocina:  {label:'En cocina', bg:'#EDE9FE',fg:'#7C3AED',next:'listo',nextLabel:'Marcar listo'},
  listo:      {label:'Listo',     bg:C.grS,  fg:C.gr,  next:'entregado', nextLabel:'Entregado ✓'},
  entregado:  {label:'Entregado', bg:C.bg2,  fg:C.ink4,next:'',          nextLabel:''},
  cancelado:  {label:'Cancelado', bg:C.vermS,fg:C.verm,next:'',          nextLabel:''},
}

function TarjetaPedido({ pedido, session, onActualizar }:{ pedido:PedidoOnline; session:Session; onActualizar:(id:string,e:string)=>void }) {
  const [av, setAv] = useState(false)
  const [ca, setCa] = useState(false)
  const cfg = ESTADO_CFG[pedido.estado] ?? ESTADO_CFG.pendiente
  const mins = Math.floor((Date.now()-new Date(pedido.created_at).getTime())/60000)

  const avanzar = async (nuevoEstado:string, setBusy:(v:boolean)=>void) => {
    setBusy(true)
    const res = await fetch('/api/storefront/estado', {
      method:'PATCH',
      headers:{'Content-Type':'application/json','x-ia-session':JSON.stringify(session)},
      body:JSON.stringify({pedido_id:pedido.id, estado:nuevoEstado}),
    })
    const d = await res.json()
    setBusy(false)
    if (d.ok) onActualizar(pedido.id, nuevoEstado)
  }

  return (
    <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden', fontFamily:SN }}>
      {/* Header tarjeta */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:`1px solid ${C.rule}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, color:C.ink }}>#{pedido.numero}</span>
          <span style={{ fontFamily:SN, fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:cfg.bg, color:cfg.fg }}>{cfg.label}</span>
          <span style={{ fontFamily:SN, fontSize:11, color:C.ink4 }}>
            {pedido.canal==='telefono'?'📞':pedido.canal==='mostrador'?'🏪':'🌐'}
            {' '}{pedido.tipo==='delivery'?'Delivery':'Recogida'}
          </span>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:C.verm }}>{Number(pedido.total).toFixed(2)} €</div>
          <div style={{ fontFamily:SN, fontSize:11, color:C.ink4 }}>{mins}' · {pedido.cobro==='online'?'Pagado':pedido.cobro==='contraentrega'?'Al entregar':pedido.cobro}</div>
        </div>
      </div>

      {/* Cliente */}
      <div style={{ padding:'8px 14px', borderBottom:`1px solid ${C.rule}` }}>
        <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:C.ink }}>{pedido.cliente_nombre}</div>
        {pedido.cliente_telefono && <div style={{ fontFamily:SM, fontSize:11, color:C.ink3, marginTop:1 }}>{pedido.cliente_telefono}</div>}
        {pedido.cliente_direccion && <div style={{ fontFamily:SN, fontSize:11, color:C.ink2, marginTop:2 }}>📍 {pedido.cliente_direccion}</div>}
        {pedido.tiempo_recogida_min>0 && <div style={{ fontFamily:SN, fontSize:11, color:C.amb, marginTop:2 }}>⏱ {pedido.tiempo_recogida_min} min</div>}
      </div>

      {/* Items */}
      <div style={{ padding:'8px 14px', borderBottom:`1px solid ${C.rule}` }}>
        {pedido.items.map((item,i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', fontFamily:SN, fontSize:12, color:C.ink2, marginBottom:i<pedido.items.length-1?4:0 }}>
            <span><span style={{ color:C.ink4, marginRight:4 }}>{item.cantidad}×</span>{item.nombre}{item.notas?<span style={{ color:C.ink4 }}> — {item.notas}</span>:null}</span>
            <span style={{ fontFamily:SM, color:C.ink3 }}>{(item.precio_unitario*item.cantidad).toFixed(2)} €</span>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div style={{ padding:'10px 14px', display:'flex', gap:8 }}>
        {cfg.next && (
          <button onPointerDown={() => avanzar(cfg.next,setAv)} disabled={av}
            style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background:av?C.bg3:C.verm, color:av?C.ink4:C.bg, fontFamily:SN, fontSize:13, fontWeight:700, cursor:av?'default':'pointer' }}>
            {av?'…':cfg.nextLabel}
          </button>
        )}
        {!['entregado','cancelado'].includes(pedido.estado) && (
          <button onPointerDown={() => avanzar('cancelado',setCa)} disabled={ca}
            style={{ padding:'10px 14px', borderRadius:8, border:`1px solid ${C.rule}`, background:'transparent', color:C.ink3, fontFamily:SN, fontSize:12, cursor:'pointer' }}>
            {ca?'…':'Cancelar'}
          </button>
        )}
        {pedido.estado==='entregado' && (
          <div style={{ flex:1, textAlign:'center', fontFamily:SN, fontSize:12, color:C.gr, padding:'10px 0', fontWeight:600 }}>✓ Completado</div>
        )}
      </div>
    </div>
  )
}

export default function PedidosOnlinePage() {
  const [session, setSession] = useState<Session|null>(null)
  const [pedidos, setPedidos] = useState<PedidoOnline[]>([])
  const [cargando, setLoad]   = useState(true)
  const [filtro, setFiltro]   = useState<string>('todos')

  useEffect(() => {
    try { const r = localStorage.getItem('ia_session'); if(r) setSession(JSON.parse(r)) } catch{}
  }, [])

  const cargar = useCallback(async () => {
    if (!session) return
    const res = await fetch('/api/storefront/estado?activos=1', { headers:{'x-ia-session':JSON.stringify(session)} })
    const d = await res.json()
    setPedidos(d.pedidos??[]); setLoad(false)
  }, [session])

  useEffect(() => { if(session) cargar() }, [session, cargar])

  useEffect(() => {
    if (!session) return
    const ch = supabase.channel('pedidos-online-owner')
      .on('postgres_changes', { event:'*', schema:'public', table:'pedidos_online', filter:`restaurante_id=eq.${session.restaurante_id}` },
        () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session, cargar])

  const onActualizar = (id:string, estado:string) => {
    setPedidos(prev => ['entregado','cancelado'].includes(estado)
      ? prev.filter(p => p.id!==id)
      : prev.map(p => p.id===id ? {...p, estado} : p)
    )
  }

  if (!session) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <p style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>Inicia sesión primero</p>
    </div>
  )

  const filtrados = filtro==='todos' ? pedidos : pedidos.filter(p => p.tipo===filtro||p.canal===filtro)
  const counts = {
    total:pedidos.length,
    delivery:pedidos.filter(p=>p.tipo==='delivery').length,
    recogida:pedidos.filter(p=>p.tipo==='recogida'||p.canal==='mostrador').length,
    telefono:pedidos.filter(p=>p.canal==='telefono').length,
  }

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, fontFamily:SN }}>
      <style>{`* { -webkit-tap-highlight-color:transparent; } button,a { touch-action:manipulation; } ::-webkit-scrollbar{display:none}`}</style>

      {/* Header */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:C.bg1, borderBottom:`1px solid ${C.rule}`, boxShadow:'0 1px 0 rgba(26,23,20,.06)' }}>
        <div style={{ padding:'12px 16px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div>
              <div style={{ fontFamily:SE, fontSize:18, color:C.ink }}>Pedidos online</div>
              <div style={{ fontFamily:SN, fontSize:12, color:C.ink4, marginTop:1 }}>
                {counts.total===0?'Sin pedidos activos':`${counts.total} activo${counts.total>1?'s':''}`}
              </div>
            </div>
            <button onPointerDown={cargar}
              style={{ border:`1px solid ${C.rule}`, background:'none', borderRadius:6, padding:'6px 12px', fontFamily:SN, fontSize:12, color:C.ink3, cursor:'pointer' }}>
              ↻
            </button>
          </div>
          <div style={{ display:'flex', gap:0, overflowX:'auto', marginBottom:-1 }}>
            {[
              {key:'todos', label:`Todos (${counts.total})`},
              {key:'delivery', label:`Delivery (${counts.delivery})`},
              {key:'recogida', label:`Recogida (${counts.recogida})`},
              {key:'telefono', label:`Teléfono (${counts.telefono})`},
            ].map(f => (
              <button key={f.key} onPointerDown={() => setFiltro(f.key)}
                style={{ padding:'8px 12px', border:'none', background:'none', fontFamily:SN, fontSize:12, fontWeight:filtro===f.key?700:500, color:filtro===f.key?C.ink:C.ink3, borderBottom:filtro===f.key?`2px solid ${C.verm}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1, transition:'all .12s' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth:600, margin:'0 auto', padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:10 }}>
        {cargando ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}>
            <div style={{ width:28, height:28, border:`3px solid ${C.verm}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtrados.length===0 ? (
          <div style={{ textAlign:'center', padding:'48px 0' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
            <div style={{ fontFamily:SE, fontSize:16, color:C.ink2, marginBottom:4 }}>Sin pedidos activos</div>
            <div style={{ fontFamily:SN, fontSize:12, color:C.ink4 }}>Los nuevos pedidos aparecen aquí al momento</div>
          </div>
        ) : filtrados.map(p => (
          <TarjetaPedido key={p.id} pedido={p} session={session} onActualizar={onActualizar} />
        ))}
      </div>
    </div>
  )
}
