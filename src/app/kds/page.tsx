'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Comanda } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const K={bg:'#0D0B08',c1:'#161310',fg:'#F6F1E7',fg2:'#C9BFAA',fg3:'#8D8270',rule:'#2F2820',rS:'#4A3F33',red:'#D9442B',amb:'#E8A33B',gr:'#3F7D44'}
const SE="'Newsreader',Georgia,serif"
const SN="'Inter Tight',system-ui,sans-serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

function edadStr(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m===0)return'AHORA';if(m<60)return`+${m}m`;return`+${Math.floor(m/60)}h${m%60?m%60+'m':''}`}
function edadColor(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);return m<10?K.gr:m<20?K.amb:K.red}

export default function KDSPage(){
  const { session, checking } = useAuth('admin')
  const [comandas,setComandasState]=useState<Comanda[]>([])
  const [time,setTime]=useState(new Date())

  const fetch=useCallback(async()=>{
    const {data}=await supabase.from('comandas').select('*,mesa:mesas(codigo),camarero:camareros(nombre),items:comanda_items(*)').in('tipo',['comanda','marchar']).in('estado',['nueva','en_cocina']).order('created_at',{ascending:true})
    if(data) setComandasState(data)
  },[])

  useEffect(()=>{
    fetch()
    const ch=supabase.channel('kds').on('postgres_changes',{event:'*',schema:'public',table:'comandas'},fetch).on('postgres_changes',{event:'*',schema:'public',table:'comanda_items'},fetch).subscribe()
    const t=setInterval(()=>{fetch();setTime(new Date())},5000)
    const c=setInterval(()=>setTime(new Date()),1000)
    return()=>{supabase.removeChannel(ch);clearInterval(t);clearInterval(c)}
  },[fetch])

  const toggle=async(comandaId:string,itemId:string,estado:string)=>{
    await supabase.from('comanda_items').update({estado:estado==='listo'?'pendiente':'listo'}).eq('id',itemId)
    fetch()
  }
  const cerrar=async(id:string,mesaId:string)=>{
    await supabase.from('comandas').update({estado:'lista'}).eq('id',id)
    await supabase.from('mesas').update({estado:'activa'}).eq('id',mesaId)
    fetch()
  }

  if (checking || !session) return <div style={{minHeight:'100dvh',background:K.bg}}/>

  return(
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',background:K.bg}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @media(min-width:640px){.kds-grid{grid-template-columns:repeat(2,1fr)!important}}
        @media(min-width:1024px){.kds-grid{grid-template-columns:repeat(3,1fr)!important}}
        @media(min-width:1400px){.kds-grid{grid-template-columns:repeat(4,1fr)!important}}
      `}</style>

      {/* HEADER */}
      <div style={{padding:'0 16px',height:52,borderBottom:`1px solid ${K.rule}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:K.c1,flexShrink:0,position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <svg width="22" height="22" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
          <span style={{fontFamily:SN,fontSize:12,color:K.fg2,fontWeight:500,letterSpacing:'.04em'}}>COCINA · KDS</span>
          <span style={{width:6,height:6,borderRadius:999,background:K.gr}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',gap:10}}>
            {[['OK',K.gr],['AVISO',K.amb],['URGENTE',K.red]].map(([l,c])=>(
              <span key={l} style={{fontFamily:SN,fontSize:9,fontWeight:700,letterSpacing:'.08em',color:c,display:'flex',gap:3,alignItems:'center'}}>
                <span style={{width:5,height:5,borderRadius:999,background:c}}/>{l}
              </span>
            ))}
          </div>
          <span style={{fontFamily:SM,fontSize:16,fontWeight:700,color:K.fg}}>{time.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        </div>
      </div>

      {/* TICKETS */}
      <div style={{flex:1,padding:10,overflowY:'auto'}}>
        {comandas.length===0?(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
            <span style={{fontFamily:SE,fontSize:28,color:K.fg3,fontStyle:'italic'}}>Cocina libre.</span>
          </div>
        ):(
          <div className="kds-grid" style={{display:'grid',gridTemplateColumns:'1fr',gap:10}}>
            {comandas.map(c=>{
              const allDone=(c.items||[]).every(it=>it.estado==='listo')
              const col=edadColor(c.created_at)
              const urgente=col===K.red
              return(
                <div key={c.id} style={{position:'relative',background:urgente?'rgba(217,68,43,.08)':col===K.amb?'rgba(232,163,59,.08)':'rgba(63,125,68,.06)',border:`1px solid ${urgente?'rgba(217,68,43,.35)':col===K.amb?'rgba(232,163,59,.3)':'rgba(63,125,68,.25)'}`,borderRadius:0,padding:14,animation:'slideIn .3s ease'}}>
                  {allDone&&(
                    <div onClick={()=>cerrar(c.id,c.mesa_id)} style={{position:'absolute',inset:0,background:'rgba(13,11,8,.75)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',zIndex:2,borderRadius:0}}>
                      <span style={{fontFamily:SM,fontSize:14,fontWeight:700,letterSpacing:'.1em',color:K.gr}}>LISTO — TAP</span>
                    </div>
                  )}
                  {/* Ticket header */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                    <div style={{display:'flex',gap:10,alignItems:'baseline'}}>
                      <span style={{fontFamily:SE,fontSize:36,fontWeight:500,color:K.fg,lineHeight:1}}>{c.mesa?.codigo}</span>
                      <span style={{fontFamily:SM,fontSize:10,color:K.fg3}}>#{c.numero_ticket}</span>
                    </div>
                    <span style={{fontFamily:SM,fontSize:22,fontWeight:700,color:col,animation:urgente?'pulse 1.5s ease-in-out infinite':'none'}}>{edadStr(c.created_at)}</span>
                  </div>
                  {/* Items */}
                  <div style={{borderTop:`1px solid ${K.rS}`,paddingTop:10}}>
                    {(c.items||[]).map(it=>(
                      <div key={it.id} onClick={()=>toggle(c.id,it.id,it.estado)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:`1px solid ${K.rule}`,cursor:'pointer',opacity:it.estado==='listo'?.4:1,transition:'opacity .15s',minHeight:44}}>
                        <div style={{width:20,height:20,borderRadius:3,border:`2px solid ${it.estado==='listo'?K.gr:K.rS}`,background:it.estado==='listo'?K.gr:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                          {it.estado==='listo'&&<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1 5 4 8 9 2" stroke={K.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span style={{fontFamily:SM,fontSize:14,fontWeight:700,letterSpacing:'.05em',color:K.fg,textTransform:'uppercase',flex:1,textDecoration:it.estado==='listo'?'line-through':'none'}}>{it.nombre}</span>
                        <span style={{fontFamily:SM,fontSize:13,color:K.fg3}}>{it.cantidad}x</span>
                      </div>
                    ))}
                  </div>
                  {/* Footer */}
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontFamily:SN,fontSize:10,color:K.fg3}}>
                    <span>{c.camarero?.nombre}</span>
                    <span>{new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
