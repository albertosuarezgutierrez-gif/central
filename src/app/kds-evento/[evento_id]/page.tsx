'use client'
import { useEffect, useState, useCallback } from 'react'
import { SE, SN } from '@/lib/colors'

const K={ bg:'#F6F1E7', fg:'#1A1714', fg3:'#6B5F52', rule:'#D8CDB6', red:'#D9442B', amb:'#E8A33B', gr:'#3F7D44' }
interface PaseItem { id:string; nombre:string; cantidad:number; estado:string }
interface Pase { id:string; numero_pase:number; nombre:string; hora_prevista:string|null; comensales:number|null; estado:string; hora_inicio_at:string|null; hora_real:string|null; notas:string|null; items:PaseItem[] }
interface Evento { nombre:string; fecha_evento:string; hora_inicio:string|null; aforo_confirmado:number|null }
const EL: Record<string,{label:string;color:string}> = { pendiente:{label:'En espera',color:K.fg3}, en_preparacion:{label:'Preparando',color:K.amb}, listo:{label:'¡Listo!',color:K.gr}, servido:{label:'Servido',color:'#9CA3AF'} }
const mins = (d:string|null) => { if(!d)return''; const m=Math.floor((Date.now()-new Date(d).getTime())/60000); return m<60?`${m}m`:`${Math.floor(m/60)}h${m%60}m` }

export default function KdsEvento({ params }: { params: Promise<{ evento_id: string }> }) {
  const [eventoId, setEventoId] = useState('')
  const [evento, setEvento] = useState<Evento|null>(null)
  const [pases, setPases] = useState<Pase[]>([])
  const [loading, setLoading] = useState(true)
  const [act, setAct] = useState<string|null>(null)
  const [ahora, setAhora] = useState(new Date())

  useEffect(()=>{ params.then(p=>setEventoId(p.evento_id)) }, [params])
  useEffect(()=>{ const t=setInterval(()=>setAhora(new Date()),1000); return ()=>clearInterval(t) },[])

  const cargar = useCallback(async()=>{
    if(!eventoId)return
    const r = await fetch(`/api/kds-evento/${eventoId}`)
    if(!r.ok)return
    const d = await r.json(); setEvento(d.evento); setPases(d.pases??[]); setLoading(false)
  },[eventoId])

  useEffect(()=>{ cargar(); const t=setInterval(cargar,15000); return ()=>clearInterval(t) },[cargar])

  const accion = async(paseId:string, a:string)=>{ setAct(paseId); await fetch(`/api/kds-evento/${eventoId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pase_id:paseId,accion:a})}); await cargar(); setAct(null) }

  if(loading)return <div style={{minHeight:'100dvh',background:K.bg,display:'flex',alignItems:'center',justifyContent:'center',color:K.fg3,fontFamily:SN}}>Cargando KDS…</div>

  const activo = pases.find(p=>p.estado==='en_preparacion')
  const sig = pases.filter(p=>p.estado==='pendiente')[0]

  return (
    <div style={{minHeight:'100dvh',background:K.bg,color:K.fg,fontFamily:SN}}>
      <div style={{background:'#fff',borderBottom:`2px solid ${K.rule}`,padding:'1rem 1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontFamily:SE,fontSize:'1.05rem',fontWeight:700}}>KDS Eventos</div>{evento&&<div style={{color:K.fg3,fontSize:'.78rem'}}>{evento.nombre}</div>}</div>
        <div style={{fontFamily:SE,fontSize:'1.6rem',color:K.red,fontVariantNumeric:'tabular-nums'}}>{ahora.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div style={{padding:'1rem',maxWidth:680,margin:'0 auto'}}>
        {activo && (
          <div style={{background:'#fff',border:`2px solid ${K.amb}`,borderRadius:14,padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}>
              <div><div style={{color:K.amb,fontSize:'.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em'}}>PREPARANDO AHORA</div><div style={{fontFamily:SE,fontSize:'1.3rem',fontWeight:700,marginTop:'.15rem'}}>Pase {activo.numero_pase} — {activo.nombre}</div>{activo.comensales&&<div style={{color:K.fg3,fontSize:'.82rem'}}>👥 {activo.comensales}</div>}</div>
              <div style={{textAlign:'right'}}>{activo.hora_prevista&&<div style={{color:K.fg3,fontSize:'.78rem'}}>Previsto {activo.hora_prevista}</div>}<div style={{color:K.amb,fontFamily:SE,fontSize:'1.2rem'}}>{mins(activo.hora_inicio_at)}</div></div>
            </div>
            {activo.items.length>0&&<div style={{display:'grid',gap:'.4rem',marginBottom:'1rem'}}>{activo.items.map(i=><div key={i.id} style={{background:K.bg,borderRadius:8,padding:'.6rem .85rem',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'.88rem'}}>{i.nombre}</span><span style={{fontFamily:SE,fontVariantNumeric:'tabular-nums'}}>{i.cantidad} uds</span></div>)}</div>}
            <button onClick={()=>accion(activo.id,'listo')} disabled={act===activo.id} style={{width:'100%',padding:'1rem',background:act===activo.id?K.fg3:K.gr,color:'#fff',border:'none',borderRadius:10,fontFamily:SN,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>✅  PASE LISTO — SERVIR</button>
          </div>
        )}
        {!activo&&sig&&(
          <div style={{background:'#fff',border:`1px solid ${K.rule}`,borderRadius:14,padding:'1.25rem',marginBottom:'1rem'}}>
            <div style={{color:K.fg3,fontSize:'.68rem',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:'.5rem'}}>Siguiente</div>
            <div style={{fontFamily:SE,fontSize:'1.2rem',fontWeight:700,marginBottom:'1rem'}}>Pase {sig.numero_pase} — {sig.nombre}</div>
            <button onClick={()=>accion(sig.id,'iniciar')} disabled={act===sig.id} style={{width:'100%',padding:'.9rem',background:K.red,color:'#fff',border:'none',borderRadius:10,fontFamily:SN,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>🔥  INICIAR PREPARACIÓN</button>
          </div>
        )}
        <div style={{background:'#fff',borderRadius:12,border:`1px solid ${K.rule}`,overflow:'hidden'}}>
          <div style={{padding:'.65rem 1rem',borderBottom:`1px solid ${K.rule}`,color:K.fg3,fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em'}}>Pases ({pases.length})</div>
          {pases.map((p,i)=>{const ec=EL[p.estado]??{label:p.estado,color:K.fg3}; return(
            <div key={p.id} style={{padding:'.7rem 1rem',borderBottom:i<pases.length-1?`1px solid ${K.rule}`:'none',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:p.estado==='servido'?.45:1}}>
              <div><div style={{fontSize:'.85rem',fontWeight:p.estado==='en_preparacion'?700:400}}>{p.numero_pase}. {p.nombre}</div>{p.hora_prevista&&<div style={{color:K.fg3,fontSize:'.72rem'}}>{p.hora_prevista}</div>}</div>
              <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>{p.hora_real&&<span style={{color:K.fg3,fontSize:'.72rem'}}>✓{p.hora_real}</span>}<div style={{background:ec.color+'22',color:ec.color,borderRadius:6,padding:'.18rem .55rem',fontSize:'.68rem',fontWeight:700}}>{ec.label}</div></div>
            </div>
          )})}
          {pases.length===0&&<div style={{padding:'1.5rem',textAlign:'center',color:K.fg3,fontSize:'.85rem'}}>Sin pases</div>}
        </div>
      </div>
    </div>
  )
}
