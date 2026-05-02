'use client'
import { useState } from 'react'
import { useMesas, useComandas, useTranscripciones, useProductos86, useReloj } from '@/hooks/useRealtime'
import { useAuth } from '@/hooks/useAuth'

const C = {
  paper:'#F6F1E7',paper2:'#EFE7D6',paper3:'#E5DAC2',bone:'#FBF8F1',
  ink:'#1A1714',ink2:'#3A332C',ink3:'#6B5F52',ink4:'#9A8D7C',
  rule:'#D8CDB6',ruleS:'#B8A98B',
  red:'#D9442B',redD:'#A8311E',redS:'#F4D8CF',
  amber:'#E8A33B',amberS:'#F7E3B6',
  teal:'#2B6A6E',green:'#3F7D44',greenS:'#D4E4D2',
}
const SN="'Inter Tight',system-ui,sans-serif"
const SE="'Newsreader',Georgia,serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

const STATUS_PAL: Record<string,{bg:string;fg:string;ac:string}> = {
  libre:  {bg:C.bone,   fg:C.ink3, ac:C.ruleS},
  activa: {bg:'#FBF8F1',fg:C.ink,  ac:C.green},
  marchar:{bg:C.greenS, fg:'#2D5C32',ac:C.green},
  aviso:  {bg:C.amberS, fg:'#7A5614',ac:C.amber},
  urgente:{bg:C.redS,   fg:C.redD, ac:C.red},
  cuenta: {bg:C.paper2, fg:C.ink2, ac:C.ink3},
}

function tiempoDesde(iso:string|null){
  if(!iso) return ''
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000)
  if(m<1) return 'ahora'; if(m<60) return `+${m}m`
  return `+${Math.floor(m/60)}h${m%60?m%60+'m':''}`
}
function edadColor(iso:string|null){
  if(!iso) return C.ink3
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000)
  return m<10?C.green:m<20?C.amber:C.red
}

const LOGO=()=><svg width="28" height="28" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>

const NAVS=[
  {id:'salon',  label:'Salón',  icon:'M4 4h16v6H4zM4 14h7v6H4zM13 14h7v6h-7z'},
  {id:'cocina', label:'Cocina', icon:'M3 12h18M5 12V8a7 7 0 0 1 14 0v4M7 12v6h10v-6'},
  {id:'comandas',label:'Comandas',icon:'M5 4h11l3 3v13H5z'},
  {id:'stream', label:'Stream', icon:'M4 5h12M4 10h16M4 15h10M4 20h14'},
]

export default function HubPage(){
  const { session, checking } = useAuth('admin')
  const [tab,setTab]=useState('salon')
  const [sel,setSel]=useState<string|null>(null)
  const {mesas,loading}=useMesas()
  const {comandas}=useComandas()
  const txs=useTranscripciones()
  const productos86=useProductos86()
  const ahora=useReloj()
  const logout = () => {
    fetch('/api/auth', { method: 'DELETE' })
    localStorage.removeItem('ia_rest_session')
    document.cookie = 'ia_session=; Max-Age=0; path=/'
    window.location.href = '/login'
  }


  const NavIcon=({path}:{path:string})=>(
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={path}/>
    </svg>
  )

  if (checking || !session) return <div style={{minHeight:'100dvh',background:'#F6F1E7'}}/>

  return(
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',background:C.paper,fontFamily:SN}}>
      <style>{`
        @media(min-width:768px){
          .hub-layout{flex-direction:row!important}
          .hub-sidebar{display:flex!important;width:180px!important;flex-shrink:0}
          .hub-bottom-nav{display:none!important}
          .hub-main{padding:16px!important}
          .salon-grid{grid-template-columns:1.6fr 1fr!important}
          .mesas-grid{grid-template-columns:repeat(5,1fr)!important}
          .tickets-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))!important}
        }
        .hub-bottom-nav button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;background:transparent;border:none;cursor:pointer;font-size:10px;font-weight:600;letter-spacing:.04em;color:#6B5F52;font-family:'Inter Tight',system-ui,sans-serif}
        .hub-bottom-nav button.active{color:#1A1714}
        .hub-sidebar button{display:flex;align-items:center;gap:9px;padding:9px 10px;background:transparent;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;color:#3A332C;text-align:left;font-family:'Inter Tight',system-ui,sans-serif;width:100%}
        .hub-sidebar button.active{background:#E5DAC2;color:#1A1714}
        .slide-in{animation:slideIn .25s ease}
        @keyframes slideIn{from{transform:translateY(-6px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {/* HEADER */}
      <div style={{height:52,padding:'0 16px',borderBottom:`1px solid ${C.rule}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:C.bone,flexShrink:0,position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <LOGO/>
          <span style={{fontFamily:SE,fontSize:18,fontWeight:500,color:C.ink}}>ia<span style={{color:C.red}}>.</span>rest</span>
          <span style={{fontFamily:SN,fontSize:11,color:C.ink3,fontWeight:500,display:'none'}}>Hub</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {productos86.length>0&&<span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:3,background:C.redS,color:C.redD}}>86 {productos86[0].nombre}</span>}
          <div style={{display:'flex',gap:4}}>
            {['EAR','BRAIN','VOX'].map(a=>(
              <span key={a} style={{fontFamily:SN,fontSize:9,fontWeight:700,letterSpacing:'0.05em',padding:'2px 6px',borderRadius:999,background:C.greenS,color:'#2D5C32',display:'flex',gap:3,alignItems:'center'}}>
                <span style={{width:4,height:4,borderRadius:999,background:C.green}}/>
                <span style={{display:'none'}}>{a}</span>
                {a.slice(0,1)}
              </span>
            ))}
          </div>
          <span style={{fontFamily:SM,fontSize:13,fontWeight:700,color:C.ink}}>{ahora.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
          <button onClick={logout} style={{fontFamily:SN,fontSize:10,fontWeight:600,color:C.ink3,background:'transparent',border:`1px solid ${C.rule}`,borderRadius:3,padding:'3px 7px',cursor:'pointer'}}>Salir</button>
        </div>
      </div>

      {/* BODY */}
      <div className="hub-layout" style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>

        {/* SIDEBAR desktop */}
        <div className="hub-sidebar" style={{display:'none',flexDirection:'column',background:C.bone,borderRight:`1px solid ${C.rule}`,padding:'12px 8px',gap:2}}>
          {NAVS.map(it=>(
            <button key={it.id} className={tab===it.id?'active':''} onClick={()=>setTab(it.id)}>
              <NavIcon path={it.icon}/>{it.label}
            </button>
          ))}
          <div style={{flex:1}}/>
          <a href="/kds" target="_blank" style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'#14110E',borderRadius:4,color:'#F6F1E7',textDecoration:'none',fontSize:12,fontWeight:600}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Abrir KDS
          </a>
          <a href="/edge" style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:C.red,borderRadius:4,color:'#F6F1E7',textDecoration:'none',fontSize:12,fontWeight:600,marginTop:4}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
            Camarero
          </a>
        </div>

        {/* MAIN */}
        <div className="hub-main" style={{flex:1,overflow:'auto',padding:'12px 12px 80px'}}>

          {/* SALON */}
          {tab==='salon'&&(
            <div>
              <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Salón</div>
              {loading?(
                <div style={{fontFamily:SM,fontSize:12,color:C.ink4}}>Cargando...</div>
              ):(
                <div className="mesas-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
                  {mesas.map(m=>{
                    const p=STATUS_PAL[m.estado]||STATUS_PAL.libre
                    const s=sel===m.id
                    return(
                      <button key={m.id} onClick={()=>setSel(s?null:m.id)} style={{background:p.bg,border:`1px solid ${s?p.ac:C.rule}`,borderRadius:8,padding:'10px 8px',cursor:'pointer',boxShadow:s?`0 0 0 2px ${p.ac}`:'none',display:'flex',flexDirection:'column',gap:4,textAlign:'left',minHeight:70}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                          <span style={{fontFamily:SE,fontSize:18,fontWeight:500,color:p.fg,lineHeight:1}}>{m.codigo}</span>
                          {m.estado!=='libre'&&<span style={{width:6,height:6,borderRadius:999,background:p.ac,flexShrink:0}}/>}
                        </div>
                        {m.camarero&&<div style={{fontFamily:SN,fontSize:9,color:p.fg,opacity:.75}}>{m.camarero.nombre.split(' ')[0]}</div>}
                        {m.ultima_comanda&&<div style={{fontFamily:SM,fontSize:9,color:edadColor(m.ultima_comanda)}}>{tiempoDesde(m.ultima_comanda)}</div>}
                      </button>
                    )
                  })}
                </div>
              )}
              {/* Transcripcion debajo en mobile */}
              <div style={{fontFamily:SE,fontSize:18,fontWeight:500,color:C.ink,marginBottom:8}}>Transcripción</div>
              <TranscriptBox entries={txs}/>
            </div>
          )}

          {/* COCINA */}
          {tab==='cocina'&&(
            <div>
              <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Cocina · {comandas.filter(c=>['comanda','marchar'].includes(c.tipo)).length} activos</div>
              <div className="tickets-grid" style={{display:'grid',gridTemplateColumns:'1fr',gap:10}}>
                {comandas.filter(c=>['comanda','marchar'].includes(c.tipo)).map(c=>(
                  <div key={c.id} className="slide-in" style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:0,padding:14,fontFamily:SM,textTransform:'uppercase'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontFamily:SE,fontSize:26,fontWeight:500,color:C.ink}}>{c.mesa?.codigo}</span>
                      <span style={{fontSize:18,fontWeight:700,color:edadColor(c.created_at)}}>{tiempoDesde(c.created_at)}</span>
                    </div>
                    <div style={{borderTop:`1px dashed ${C.ruleS}`,paddingTop:8}}>
                      {(c.items||[]).map((it,i)=>(
                        <div key={i} style={{display:'flex',gap:8,padding:'4px 0',fontSize:13,fontWeight:600,color:C.ink}}>
                          <span style={{color:C.red,width:22}}>{it.cantidad}x</span>{it.nombre}
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:10,color:C.ink3}}>
                      <span>{c.camarero?.nombre}</span><span>#{c.numero_ticket}</span>
                    </div>
                  </div>
                ))}
                {comandas.filter(c=>c.tipo==='comanda').length===0&&(
                  <div style={{fontFamily:SE,fontSize:18,color:C.ink3,fontStyle:'italic',padding:'20px 0'}}>Cocina libre.</div>
                )}
              </div>
            </div>
          )}

          {/* COMANDAS */}
          {tab==='comandas'&&(
            <div>
              <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Historial</div>
              <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,overflow:'hidden'}}>
                {comandas.length===0&&<div style={{padding:20,fontFamily:SM,fontSize:12,color:C.ink4}}>Sin comandas.</div>}
                {comandas.map(c=>(
                  <div key={c.id} style={{display:'flex',gap:10,padding:'10px 12px',borderBottom:`1px solid ${C.rule}`,alignItems:'center'}}>
                    <span style={{fontFamily:SE,fontSize:16,fontWeight:500,color:C.ink,width:44,flexShrink:0}}>{c.mesa?.codigo}</span>
                    <span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:2,background:c.tipo==='86'?C.redS:C.paper2,color:c.tipo==='86'?C.redD:C.ink2,flexShrink:0}}>{c.tipo.toUpperCase()}</span>
                    <span style={{fontFamily:SN,fontSize:12,color:C.ink2,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(c.items||[]).map(it=>`${it.cantidad}x ${it.nombre}`).join(', ')||'—'}</span>
                    <span style={{fontFamily:SM,fontSize:10,color:C.ink4,flexShrink:0}}>{new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STREAM */}
          {tab==='stream'&&(
            <div>
              <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Stream completo</div>
              <TranscriptBox entries={txs}/>
            </div>
          )}

        </div>
      </div>

      {/* BOTTOM NAV mobile */}
      <div className="hub-bottom-nav" style={{display:'flex',borderTop:`1px solid ${C.rule}`,background:C.bone,position:'sticky',bottom:0,zIndex:10}}>
        {NAVS.map(it=>(
          <button key={it.id} className={tab===it.id?'active':''} onClick={()=>setTab(it.id)}>
            <NavIcon path={it.icon}/>
            {it.label}
          </button>
        ))}
        <a href="/kds" target="_blank" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'8px 4px',background:'#14110E',border:'none',cursor:'pointer',fontSize:10,fontWeight:600,color:'#F6F1E7',textDecoration:'none'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          KDS
        </a>
      </div>
    </div>
  )
}

function TranscriptBox({entries}:{entries:any[]}){
  const SN="'Inter Tight',system-ui,sans-serif"
  const SM="'JetBrains Mono',ui-monospace,monospace"
  const C={bone:'#FBF8F1',rule:'#D8CDB6',ink:'#1A1714',ink2:'#3A332C',ink3:'#6B5F52',ink4:'#9A8D7C',paper2:'#EFE7D6',red:'#D9442B',teal:'#2B6A6E'}
  return(
    <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:12,display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontFamily:SN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:C.ink3,display:'flex',gap:5,alignItems:'center'}}>
          <span style={{width:5,height:5,borderRadius:999,background:C.teal}}/>En vivo
        </span>
        <span style={{fontFamily:SM,fontSize:10,color:C.ink4}}>{entries.length}</span>
      </div>
      {entries.length===0&&<div style={{fontFamily:SM,fontSize:11,color:C.ink4,fontStyle:'italic'}}>Esperando voz...</div>}
      {entries.slice(0,15).map((t,i)=>(
        <div key={t.id||i} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'5px 0',borderBottom:`1px solid ${C.rule}`}}>
          <span style={{fontFamily:SM,fontSize:10,color:C.ink4,width:40,flexShrink:0,paddingTop:1}}>{new Date(t.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          <span style={{fontFamily:SN,fontSize:9,fontWeight:700,padding:'2px 5px',background:C.paper2,borderRadius:2,flexShrink:0,color:C.ink}}>{t.camarero?.nombre?.split(' ')[0]||'CAM'}</span>
          <span style={{fontFamily:SM,fontSize:11,color:C.ink2,flex:1,lineHeight:1.4}}>{t.texto_original}</span>
          {t.texto_brain&&<span style={{fontFamily:SN,fontSize:9,fontWeight:700,color:C.red,flexShrink:0}}>{(t.texto_brain as any).tipo?.toUpperCase()}</span>}
        </div>
      ))}
    </div>
  )
}
