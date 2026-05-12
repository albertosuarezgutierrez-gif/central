'use client'
// ia.rest · Panel Jefe de Sala — v2.1 (fix: no flicker, restaurante_id, fonts)
// Rol: jefe_sala (PIN 0000) · También accesible por owner y super_admin

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth, Session } from '@/hooks/useAuth'
import { useMesas, useComandas, useTranscripciones, useProductos86, useReloj } from '@/hooks/useRealtime'
import Analytics from '@/components/Analytics'
import SugerenciaButton from '@/components/SugerenciaButton'
import PlanoSala, { MesaPlano, ZonaInfo } from '@/components/PlanoSala'
import SupervisorTab from '@/components/owner/SupervisorTab'

const C = {
  paper:'#F6F1E7', paper2:'#EFE7D6', paper3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6', ruleS:'#B8A98B',
  red:'#D9442B', redD:'#A8311E', redS:'#F4D8CF',
  amber:'#E8A33B', amberS:'#F7E3B6',
  green:'#3F7D44', greenS:'#D4E4D2',
  teal:'#2B6A6E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

type Tab = 'salon'|'cocina'|'comandas'|'stream'|'caja'|'audit'|'analytics'|'supervisor'|'mas'

// Tabs principales en bottom nav — máximo 5, ordenadas de más a menos uso diario
const NAV_PRINCIPAL: {id:Tab;label:string;icon:string}[] = [
  {id:'salon',      label:'Salón',      icon:'M4 4h16v6H4zM4 14h7v6H4zM13 14h7v6h-7z'},
  {id:'supervisor', label:'Supervisor', icon:'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2'},
  {id:'cocina',     label:'Cocina',     icon:'M3 12h18M5 12V8a7 7 0 0 1 14 0v4M7 12v6h10v-6'},
  {id:'caja',       label:'Caja',       icon:'M3 9h18M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9M9 14h6'},
  {id:'mas',        label:'Más',        icon:'M5 12h.01M12 12h.01M19 12h.01'},
]

// Tabs secundarias — accesibles desde el menú "Más" (uso ocasional o técnico)
const NAV_SECUNDARIO: {id:Tab;label:string;icon:string;desc:string}[] = [
  {id:'comandas',  label:'Comandas',       icon:'M5 4h11l3 3v13H5z',                                                       desc:'Lista completa de comandas activas'},
  {id:'analytics', label:'Analytics',      icon:'M18 20V10M12 20V4M6 20v-6',                                                desc:'Métricas del servicio'},
  {id:'audit',     label:'Modificaciones', icon:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',                              desc:'Cambios en comandas · audit trail'},
  {id:'stream',    label:'Stream',         icon:'M4 5h12M4 10h16M4 15h10M4 20h14',                                          desc:'Transcripciones en tiempo real'},
]

// Todos los NAVS juntos — para el sidebar desktop (no hay restricción de espacio)
const NAVS_TODOS = [...NAV_PRINCIPAL.filter(n => n.id !== 'mas'), ...NAV_SECUNDARIO]

const STATUS_PAL: Record<string,{bg:string;fg:string;ac:string}> = {
  libre:  {bg:C.bone,    fg:C.ink3,   ac:C.ruleS},
  activa: {bg:'#FBF8F1', fg:C.ink,    ac:C.green},
  marchar:{bg:C.greenS,  fg:'#2D5C32',ac:C.green},
  aviso:  {bg:C.amberS,  fg:'#7A5614',ac:C.amber},
  urgente:{bg:C.redS,    fg:C.redD,   ac:C.red},
  cuenta: {bg:C.paper2,  fg:C.ink2,   ac:C.ink3},
}

function tiempoDesde(iso:string|null){
  if(!iso) return ''
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000)
  return m<1?'ahora':m<60?`+${m}m`:`+${Math.floor(m/60)}h${m%60?m%60+'m':''}`
}
function edadColor(iso:string|null){
  if(!iso) return C.ink3
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000)
  return m<10?C.green:m<20?C.amber:C.red
}

function NavIcon({path}:{path:string}){
  return(
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={path}/>
    </svg>
  )
}

function fmtEur(n:number){ return `${n>=0?'':'-'}${Math.abs(n).toFixed(2).replace('.',',')} €` }
function fmtTime(iso:string){ return new Date(iso).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) }

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function JefeSalaPage() {
  // useAuth ya inicializa síncronamente → sin parpadeo blanco
  const { session, checking } = useAuth(['jefe_sala', 'owner', 'super_admin'])
  const [tab, setTab] = useState<Tab>('salon')
  const ahora = useReloj()

  // Productos 86 con filtro de restaurante
  const productos86 = useProductos86(undefined, session?.restaurante_id)

  // Pantalla de carga mínima (solo mientras checking=true Y no hay sesión síncrona)
  if (!session) {
    return (
      <div style={{minHeight:'100dvh',background:C.paper,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontFamily:SM,fontSize:11,color:C.ink4,letterSpacing:'.12em'}}>Cargando…</span>
      </div>
    )
  }

  const logout = () => {
    fetch('/api/auth',{method:'DELETE'})
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  const sh = ():Record<string,string> => ({
    'x-ia-session': localStorage.getItem('ia_rest_session') ?? ''
  })

  return(
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',background:C.paper,fontFamily:SN}}>
      {/* Fuentes cargadas via link en layout — NO @import aquí */}
      <style>{`
        *{box-sizing:border-box}
        @media(min-width:768px){
          .jefe-sidebar{display:flex!important}
          .jefe-bottom{display:none!important}
          .jefe-main{padding:20px!important}
        }
        .jefe-bottom button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;background:transparent;border:none;cursor:pointer;font-size:9px;font-weight:600;letter-spacing:.04em;color:${C.ink4};font-family:${SN}}
        .jefe-bottom button.act{color:${C.ink};border-top:2px solid ${C.red}}
        .jefe-sidebar button{display:flex;align-items:center;gap:9px;padding:9px 10px;background:transparent;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;color:${C.ink2};text-align:left;font-family:${SN};width:100%}
        .jefe-sidebar button.act{background:${C.paper2};color:${C.ink};font-weight:600}
      `}</style>
      <SugerenciaButton session={session} tema="light"/>

      {/* HEADER */}
      <div style={{height:52,padding:'0 16px',borderBottom:`1px solid ${C.rule}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:C.bone,flexShrink:0,position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.red}}>ia.rest</span>
          <span style={{fontFamily:SN,fontSize:12,color:C.ink3}}>· Jefe de sala</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {productos86.length>0 && (
            <span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:3,background:C.redS,color:C.redD}}>
              86 {productos86[0].nombre}
            </span>
          )}
          <span style={{fontFamily:SM,fontSize:13,fontWeight:700,color:C.ink}}>
            {ahora.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}
          </span>
          <span style={{fontSize:13,color:C.ink3,fontWeight:500}}>{session.nombre}</span>
          <button onClick={logout} style={{fontFamily:SN,fontSize:10,fontWeight:600,color:C.ink3,background:'transparent',border:`1px solid ${C.rule}`,borderRadius:3,padding:'3px 7px',cursor:'pointer'}}>
            Salir
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:'flex',minHeight:0}}>

        {/* SIDEBAR desktop — muestra todos los tabs sin restricción de espacio */}
        <div className="jefe-sidebar" style={{display:'none',flexDirection:'column',background:C.bone,borderRight:`1px solid ${C.rule}`,padding:'12px 8px',gap:2,width:160,flexShrink:0}}>
          {NAVS_TODOS.map(n=>(
            <button key={n.id} className={tab===n.id?'act':''} onClick={()=>setTab(n.id)}>
              <NavIcon path={n.icon}/>{n.label}
            </button>
          ))}
          <div style={{flex:1}}/>
          <a href="/kds" target="_blank" style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'#1A1714',borderRadius:9999,color:'#F6F1E7',textDecoration:'none',fontSize:12,fontWeight:600,marginBottom:4}}>
            <NavIcon path="M2 3h20v14H2zM8 21h8M12 17v4"/>KDS
          </a>
          <a href="/edge" style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:C.red,borderRadius:6,color:'#fff',textDecoration:'none',fontSize:12,fontWeight:600}}>
            <NavIcon path="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v4"/>Edge
          </a>
        </div>

        {/* MAIN */}
        <div className="jefe-main" style={{flex:1,overflow:'auto',padding:'12px 12px 80px'}}>
          {tab==='salon'    && <SalonTab session={session}/>}
          {tab==='cocina'   && <CocinaTab session={session}/>}
          {tab==='comandas' && <ComandasTab session={session}/>}
          {tab==='stream'   && <StreamTab session={session}/>}
          {tab==='caja'     && <CajaTab sh={sh}/>}
          {tab==='audit'    && <AuditTab sh={sh} restauranteId={session.restaurante_id}/>}
          {tab==='analytics'  && <Analytics/>}
          {tab==='supervisor' && <SupervisorTab rol={session.rol} restauranteId={session.restaurante_id} />}
          {tab==='mas' && (
            <div style={{padding:'24px 16px'}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink,marginBottom:20}}>Más opciones</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
                {NAV_SECUNDARIO.map(n=>(
                  <button key={n.id} onClick={()=>setTab(n.id)}
                    style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:8,padding:'16px 16px',background:C.bone,border:`1px solid ${C.rule}`,borderRadius:10,cursor:'pointer',textAlign:'left'}}>
                    <NavIcon path={n.icon}/>
                    <div>
                      <div style={{fontFamily:SN,fontSize:13,fontWeight:600,color:C.ink}}>{n.label}</div>
                      <div style={{fontFamily:SN,fontSize:11,color:C.ink3,marginTop:2,lineHeight:1.4}}>{n.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM NAV mobile — solo 5 tabs para que el área de toque sea usable */}
      <div className="jefe-bottom" style={{display:'flex',borderTop:`1px solid ${C.rule}`,background:C.bone,position:'sticky',bottom:0,zIndex:10}}>
        {NAV_PRINCIPAL.map(n=>(
          <button key={n.id} className={tab===n.id||((tab==='comandas'||tab==='analytics'||tab==='audit'||tab==='stream')&&n.id==='mas')?'act':''} onClick={()=>setTab(n.id)}>
            <NavIcon path={n.icon}/>{n.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── SALON ────────────────────────────────────────────────────────────────────
function SalonTab({session}:{session:Session}){
  const {mesas,loading}=useMesas(session.restaurante_id)
  const {comandas}=useComandas(undefined,session.restaurante_id)
  const txs=useTranscripciones(undefined, 20, session.restaurante_id)
  const [zonasPlano, setZonasPlano] = useState<ZonaInfo[]>([])
  const [vistaPlano, setVistaPlano] = useState<'zona'|'minimap'>('zona')

  // Cargar zonas
  useEffect(()=>{
    const ses = typeof window!=='undefined' ? localStorage.getItem('ia_rest_session')??'' : ''
    fetch('/api/owner/zonas',{headers:{'x-ia-session':ses}})
      .then(r=>r.json()).then(d=>{
        if(Array.isArray(d)) setZonasPlano(d.map((z:{id:string;tipo:string;nombre:string})=>({id:z.id,tipo:z.tipo,nombre:z.nombre})))
      }).catch(()=>{})
  },[])

  // Servicio pendiente realtime
  const servicioPendienteSet = (() => {
    // carga desde comandas activas — simplificado para jefe
    return new Set<string>()
  })()

  // Fusionar mesas con estados de comandas activas
  const mesasOcupadas = comandas
    .filter(c=>['nueva','en_cocina','lista'].includes(c.estado))
    .reduce((acc:Record<string,typeof comandas[0]>,c)=>{
      if(!acc[c.mesa_id]||new Date(c.created_at)>new Date(acc[c.mesa_id].created_at)) acc[c.mesa_id]=c
      return acc
    },{})

  const mesasPlano: MesaPlano[] = mesas.map(m=>{
    const comanda = mesasOcupadas[m.id]
    const min = comanda ? Math.floor((Date.now()-new Date(comanda.created_at).getTime())/60000) : null
    const estado: MesaPlano['estado'] = !comanda ? 'libre'
      : comanda.tipo==='cuenta' ? 'cuenta'
      : comanda.estado==='en_cocina' ? 'en_cocina'
      : (min??0)>60 ? 'urgente' : 'activa'
    return {
      id:m.id, codigo:m.codigo,
      capacidad:m.capacidad??4,
      zona:(m as {zona?:string}).zona??'salon',
      pos_x:(m as {pos_x?:number|null}).pos_x??null,
      pos_y:(m as {pos_y?:number|null}).pos_y??null,
      forma:(m as {forma?:string|null}).forma as MesaPlano['forma']??null,
      estado,
      num_comensales: comanda?.num_comensales??null,
      camarero_nombre: comanda ? (comanda.camarero as {nombre?:string}|null)?.nombre??null : null,
      minutos_abierta: min,
      servicio_pendiente: servicioPendienteSet.has(m.id),
    }
  })

  // Totales rápidos
  const libres   = mesasPlano.filter(m=>m.estado==='libre').length
  const activas  = mesasPlano.filter(m=>m.estado!=='libre').length
  const urgentes = mesasPlano.filter(m=>(m.minutos_abierta??0)>=45).length

  return(
    <div>
      {/* KPIs rápidos */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:8,marginBottom:14}}>
        {[
          {l:'Libres',  v:libres,   c:C.ink3},
          {l:'Activas', v:activas,  c:C.green},
          {l:'Urgentes',v:urgentes, c:urgentes>0?C.red:C.ink3},
        ].map(k=>(
          <div key={k.l} style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:'8px 12px',textAlign:'center'}}>
            <div style={{fontFamily:SM,fontSize:9,color:C.ink4,letterSpacing:'.08em',marginBottom:2}}>{k.l.toUpperCase()}</div>
            <div style={{fontFamily:SE,fontSize:24,fontWeight:500,color:k.c,lineHeight:1}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Toggle vista */}
      {!loading && mesas.length > 0 && (
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
          <div style={{display:'flex',border:`1px solid ${C.rule}`,borderRadius:7,overflow:'hidden'}}>
            {(['zona','minimap'] as const).map(v=>(
              <button key={v} onClick={()=>setVistaPlano(v)} style={{
                padding:'5px 12px',border:'none',cursor:'pointer',
                background:vistaPlano===v?C.ink:C.bone,
                color:vistaPlano===v?C.paper:C.ink3,
                fontSize:11,fontFamily:SN,fontWeight:500,
              }}>
                {v==='zona' ? '⊞ Por zona' : '⊟ Minimap'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plano visual */}
      {loading ? (
        <div style={{fontFamily:SM,fontSize:12,color:C.ink4,marginBottom:16}}>Cargando mesas…</div>
      ) : mesas.length===0 ? (
        <div style={{fontFamily:SE,fontSize:16,color:C.ink3,fontStyle:'italic',padding:'20px 0',marginBottom:16}}>
          Sin mesas configuradas.
        </div>
      ) : (
        <div style={{marginBottom:20}}>
          <PlanoSala
            mesas={mesasPlano}
            zonas={zonasPlano.length>0 ? zonasPlano : [{id:'default',tipo:'salon',nombre:'Sala'}]}
            resaltarMias={false}
            mostrarLibres={true}
            minimap={vistaPlano==='minimap'}
          />
        </div>
      )}

      <div style={{fontFamily:SE,fontSize:18,fontWeight:500,color:C.ink,marginBottom:8}}>Transcripción en vivo</div>
      <TranscriptBox entries={txs}/>
    </div>
  )
}

// ─── COCINA ───────────────────────────────────────────────────────────────────
function CocinaTab({session}:{session:Session}){
  const {comandas,loading}=useComandas(undefined, session.restaurante_id)
  // El hook ya filtra por estado nueva|en_cocina
  return(
    <div>
      <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>
        Cocina · {loading ? '…' : `${comandas.length} activos`}
      </div>
      {loading && <div style={{fontFamily:SM,fontSize:12,color:C.ink4}}>Cargando…</div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10}}>
        {comandas.map(c=>(
          <div key={c.id} style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:14,fontFamily:SM}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontFamily:SE,fontSize:24,fontWeight:500,color:C.ink}}>{(c.mesa as any)?.codigo}</span>
              <span style={{fontSize:16,fontWeight:700,color:edadColor(c.created_at)}}>{tiempoDesde(c.created_at)}</span>
            </div>
            <div style={{borderTop:`1px dashed ${C.ruleS}`,paddingTop:8}}>
              {((c.items||[]) as any[]).map((it,i)=>(
                <div key={i} style={{display:'flex',gap:8,padding:'3px 0',fontSize:12,fontWeight:600,color:C.ink}}>
                  <span style={{color:C.red,width:22}}>{it.cantidad}x</span>{it.nombre}
                  {it.notas&&<span style={{color:C.amber,fontSize:10,fontStyle:'italic'}}> {it.notas}</span>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:10,color:C.ink3}}>
              <span>{(c.camarero as any)?.nombre}</span>
              <span style={{background:c.estado==='en_cocina'?C.amberS:C.greenS,color:c.estado==='en_cocina'?'#7A5614':C.green,padding:'1px 6px',borderRadius:3,fontWeight:700}}>
                {c.estado.replace('_',' ').toUpperCase()}
              </span>
            </div>
          </div>
        ))}
        {!loading && comandas.length===0 && (
          <div style={{fontFamily:SE,fontSize:18,color:C.ink3,fontStyle:'italic',padding:'20px 0'}}>Cocina libre.</div>
        )}
      </div>
    </div>
  )
}

// ─── COMANDAS ─────────────────────────────────────────────────────────────────
function ComandasTab({session}:{session:Session}){
  const {comandas,loading}=useComandas(undefined, session.restaurante_id)
  return(
    <div>
      <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>
        Comandas activas{!loading&&` (${comandas.length})`}
      </div>
      <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,overflow:'hidden'}}>
        {loading && <div style={{padding:20,fontFamily:SM,fontSize:12,color:C.ink4}}>Cargando…</div>}
        {!loading && comandas.length===0 && <div style={{padding:20,fontFamily:SM,fontSize:12,color:C.ink4}}>Sin comandas activas.</div>}
        {comandas.map(c=>(
          <div key={c.id} style={{display:'flex',gap:10,padding:'10px 14px',borderBottom:`1px solid ${C.rule}`,alignItems:'center'}}>
            <span style={{fontFamily:SE,fontSize:16,fontWeight:500,color:C.ink,minWidth:50,flexShrink:0}}>{(c.mesa as any)?.codigo}</span>
            <span style={{fontFamily:SM,fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:2,background:C.paper2,color:C.ink2,flexShrink:0}}>
              {c.estado.replace('_',' ').toUpperCase()}
            </span>
            <span style={{fontFamily:SN,fontSize:12,color:C.ink2,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {((c.items||[]) as any[]).map(it=>`${it.cantidad}× ${it.nombre}`).join(', ')||'—'}
            </span>
            <span style={{fontFamily:SM,fontSize:10,color:C.ink4,flexShrink:0}}>
              {new Date(c.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── STREAM ───────────────────────────────────────────────────────────────────
function StreamTab({session}:{session:Session}){
  const txs=useTranscripciones(undefined, 30, session.restaurante_id)
  return(
    <div>
      <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Stream de voz en vivo</div>
      <TranscriptBox entries={txs}/>
    </div>
  )
}

// ─── TRANSCRIPTBOX ────────────────────────────────────────────────────────────
function TranscriptBox({entries}:{entries:unknown[]}){
  const es = entries as {id?:string;created_at:string;camarero?:{nombre:string};texto_original:string;texto_brain?:{tipo?:string}}[]
  return(
    <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:12,display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontFamily:SN,fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:C.ink3,display:'flex',gap:5,alignItems:'center'}}>
          <span style={{width:5,height:5,borderRadius:999,background:C.teal}}/>En vivo
        </span>
        <span style={{fontFamily:SM,fontSize:10,color:C.ink4}}>{es.length}</span>
      </div>
      {es.length===0&&<div style={{fontFamily:SM,fontSize:11,color:C.ink4,fontStyle:'italic'}}>Esperando voz...</div>}
      {es.slice(0,20).map((t,i)=>(
        <div key={t.id||i} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'5px 0',borderBottom:`1px solid ${C.rule}`}}>
          <span style={{fontFamily:SM,fontSize:10,color:C.ink4,width:40,flexShrink:0}}>
            {new Date(t.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </span>
          <span style={{fontFamily:SN,fontSize:9,fontWeight:700,padding:'2px 5px',background:C.paper2,borderRadius:2,flexShrink:0,color:C.ink}}>
            {t.camarero?.nombre?.split(' ')[0]||'—'}
          </span>
          <span style={{fontFamily:SM,fontSize:11,color:C.ink2,flex:1,lineHeight:1.4}}>{t.texto_original}</span>
          {t.texto_brain?.tipo&&(
            <span style={{fontFamily:SN,fontSize:9,fontWeight:700,color:C.red,flexShrink:0}}>
              {t.texto_brain.tipo.toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── CAJA ─────────────────────────────────────────────────────────────────────
function CajaTab({ sh }:{ sh:()=>Record<string,string> }) {
  const [data, setData] = useState<{
    turno:{id:string;nombre:string}|null
    movimientos:{id:string;tipo:string;concepto:string;importe:number;saldo_acumulado:number;camarero_nombre:string;mesa_label:string|null;created_at:string}[]
    resumen:{saldo_actual:number;cobros_efectivo:number;cambios:number;retiros:number;gastos:number;apertura:number}|null
  }|null>(null)
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]         = useState({tipo:'retiro',concepto:'',importe:'',notas:''})
  const [saving, setSaving]     = useState(false)
  const [cierreOpen, setCierreOpen]     = useState(false)
  const [cierreEfectivo, setCierreEfectivo] = useState('')
  const [cierreDesvio, setCierreDesvio] = useState<number|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja',{headers:sh()})
    if (r.ok) setData(await r.json())
    setLoading(false)
  },[sh])
  useEffect(()=>{load()},[load])

  const addMov = async () => {
    if(!form.concepto||!form.importe) return
    setSaving(true)
    await fetch('/api/caja',{method:'POST',headers:{...sh(),'Content-Type':'application/json'},
      body:JSON.stringify({tipo:form.tipo,concepto:form.concepto,importe:parseFloat(form.importe),notas:form.notas||undefined})})
    setForm({tipo:'retiro',concepto:'',importe:'',notas:''}); setModalOpen(false); setSaving(false); load()
  }

  const TIPO_ICONO: Record<string,string> = {
    apertura:'🔓',cobro_efectivo:'💵',cambio:'🔄',retiro:'⬆',gasto:'🛒',ingreso_manual:'⬇',cierre:'🔒'
  }

  if(loading) return <div style={{padding:40,textAlign:'center',color:C.ink4,fontFamily:SM,fontSize:12}}>Cargando caja…</div>
  if(!data?.turno) return (
    <div style={{padding:40,textAlign:'center'}}>
      <div style={{fontFamily:SE,fontSize:20,color:C.ink3,fontStyle:'italic',marginBottom:8}}>Sin turno activo</div>
      <div style={{fontFamily:SN,fontSize:13,color:C.ink4}}>Abre un turno desde /owner para usar la caja.</div>
    </div>
  )

  const {resumen,movimientos}=data
  const saldo=resumen?.saldo_actual??0

  return(
    <div>
      <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Control de caja</div>

      {/* SALDO */}
      <div style={{background:saldo>=0?C.greenS:C.redS,border:`1px solid ${saldo>=0?C.green+'44':C.red+'44'}`,borderRadius:12,padding:'16px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:saldo>=0?C.green:C.red,marginBottom:4}}>Saldo en caja · {data.turno.nombre}</div>
          <div style={{fontFamily:SM,fontSize:28,fontWeight:700,color:saldo>=0?C.green:C.red}}>{fmtEur(saldo)}</div>
        </div>
        <div style={{fontSize:36}}>{saldo>=0?'💰':'⚠️'}</div>
      </div>

      {/* STATS */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginBottom:14}}>
        {[
          {l:'Apertura',val:resumen?.apertura??0,c:C.ink3},
          {l:'Cobros',val:resumen?.cobros_efectivo??0,c:C.green},
          {l:'Cambios',val:-(resumen?.cambios??0),c:C.amber},
          {l:'Retiros',val:-(resumen?.retiros??0),c:C.red},
        ].map(({l,val,c})=>(
          <div key={l} style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:C.ink4,marginBottom:3}}>{l}</div>
            <div style={{fontFamily:SM,fontSize:15,fontWeight:600,color:c}}>{fmtEur(val)}</div>
          </div>
        ))}
      </div>

      {/* ACCIONES */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap' as const}}>
        <button onClick={()=>setModalOpen(true)} style={{padding:'8px 14px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:13,fontWeight:600,color:C.ink,cursor:'pointer'}}>＋ Movimiento</button>
        <button onClick={()=>{setCierreOpen(true);setCierreEfectivo('');setCierreDesvio(null)}} style={{padding:'8px 14px',background:C.redS,border:`1px solid ${C.red}44`,borderRadius:8,fontSize:13,fontWeight:600,color:C.red,cursor:'pointer'}}>🔒 Cierre</button>
        <button onClick={load} style={{padding:'8px 14px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:13,color:C.ink3,cursor:'pointer'}}>↺</button>
      </div>

      {/* MODAL MOVIMIENTO */}
      {modalOpen&&(
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:480,background:C.bone,borderRadius:16,padding:24}}>
            <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,marginBottom:14}}>Movimiento manual</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13}}>
                <option value="retiro">⬆ Retiro</option>
                <option value="gasto">🛒 Gasto</option>
                <option value="ingreso_manual">⬇ Ingreso manual</option>
                <option value="apertura">🔓 Fondo inicial</option>
              </select>
              <input placeholder="Concepto" value={form.concepto} onChange={e=>setForm(f=>({...f,concepto:e.target.value}))} style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13}}/>
              <input type="number" inputMode="decimal" placeholder="Importe €" value={form.importe} onChange={e=>setForm(f=>({...f,importe:e.target.value}))} style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SM,fontSize:18}}/>
              <input placeholder="Notas (opcional)" value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13}}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setModalOpen(false)} style={{flex:1,padding:10,border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
                <button onClick={addMov} disabled={saving||!form.concepto||!form.importe} style={{flex:2,padding:10,border:'none',borderRadius:8,background:C.red,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',opacity:saving?.6:1}}>
                  {saving?'…':'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CIERRE */}
      {cierreOpen&&(
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:480,background:C.bone,borderRadius:16,padding:24}}>
            <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,marginBottom:6}}>Cierre de caja</div>
            <div style={{fontSize:12,color:C.ink3,marginBottom:14}}>Saldo sistema: <strong style={{fontFamily:SM}}>{fmtEur(saldo)}</strong></div>
            <input type="number" inputMode="decimal" placeholder="Efectivo contado €" value={cierreEfectivo} onChange={e=>{setCierreEfectivo(e.target.value);setCierreDesvio(null)}}
              style={{width:'100%',padding:'12px 14px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SM,fontSize:22,marginBottom:10}}/>
            {cierreEfectivo&&cierreDesvio===null&&(
              <button onClick={()=>setCierreDesvio(Math.round((parseFloat(cierreEfectivo)-saldo)*100)/100)}
                style={{width:'100%',padding:'10px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper2,fontSize:13,fontWeight:600,marginBottom:10,cursor:'pointer'}}>
                Calcular desvío
              </button>
            )}
            {cierreDesvio!==null&&(
              <div style={{padding:'12px 14px',borderRadius:10,background:Math.abs(cierreDesvio)<0.5?C.greenS:C.redS,marginBottom:10}}>
                <div style={{fontFamily:SM,fontSize:22,fontWeight:700,color:Math.abs(cierreDesvio)<0.5?C.green:C.red}}>
                  {Math.abs(cierreDesvio)<0.01?'✓ Cuadra perfectamente':fmtEur(cierreDesvio)}
                </div>
                {Math.abs(cierreDesvio)>=0.5&&<div style={{fontSize:11,color:C.ink3,marginTop:4}}>Esperado {fmtEur(saldo)} · Contado {fmtEur(parseFloat(cierreEfectivo))}</div>}
              </div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setCierreOpen(false)} style={{flex:1,padding:10,border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',fontSize:13,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
              <button onClick={async()=>{
                await fetch('/api/caja',{method:'POST',headers:{...sh(),'Content-Type':'application/json'},body:JSON.stringify({tipo:'cierre',concepto:`Cierre · contado ${cierreEfectivo}€ · desvío ${fmtEur(cierreDesvio??0)}`,importe:0,notas:`real=${cierreEfectivo}€`})})
                setCierreOpen(false); load()
              }} style={{flex:2,padding:10,border:'none',borderRadius:8,background:C.red,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}}>
                Registrar cierre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOVIMIENTOS */}
      <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.rule}`,fontSize:11,fontWeight:700,color:C.ink3,textTransform:'uppercase',letterSpacing:'1px'}}>
          Movimientos ({movimientos.length})
        </div>
        {movimientos.length===0&&<div style={{padding:20,textAlign:'center',color:C.ink4,fontSize:13}}>Sin movimientos aún</div>}
        {movimientos.map((m,i)=>(
          <div key={m.id} style={{padding:'10px 14px',borderBottom:i<movimientos.length-1?`1px solid ${C.rule}`:'none',display:'flex',alignItems:'center',gap:10,background:i===0?C.paper2:'transparent'}}>
            <span style={{fontSize:18,flexShrink:0}}>{TIPO_ICONO[m.tipo]??'·'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.concepto}</div>
              <div style={{fontSize:10,color:C.ink4}}>{m.camarero_nombre}{m.mesa_label?` · ${m.mesa_label}`:''} · {fmtTime(m.created_at)}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontFamily:SM,fontSize:13,fontWeight:700,color:m.importe>=0?C.green:C.red}}>{m.importe>=0?'+':''}{fmtEur(m.importe)}</div>
              <div style={{fontFamily:SM,fontSize:9,color:C.ink4}}>{fmtEur(m.saldo_acumulado)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────
function AuditTab({ sh, restauranteId }:{ sh:()=>Record<string,string>; restauranteId:string }) {
  const [audit, setAudit] = useState<{id:string;accion:string;camarero_nombre:string;item_nombre:string|null;item_cantidad_antes:number|null;item_cantidad_despues:number|null;es_propietario:boolean;created_at:string}[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async()=>{
    setLoading(true)
    const r = await fetch(`/api/audit/resumen`,{headers:sh()})
    if (r.ok) {
      const d = await r.json()
      setAudit(d.audit??[])
    }
    setLoading(false)
  },[sh])
  useEffect(()=>{load()},[load])

  const externas = audit.filter(a=>!a.es_propietario)

  if(loading) return <div style={{padding:40,textAlign:'center',color:C.ink4,fontFamily:SM,fontSize:12}}>Cargando…</div>

  return(
    <div>
      <div style={{fontFamily:SE,fontSize:22,fontWeight:500,color:C.ink,marginBottom:12}}>Modificaciones de hoy</div>

      {externas.length>0&&(
        <div style={{background:C.redS,border:`1px solid ${C.red}44`,borderRadius:10,padding:'12px 14px',marginBottom:16,display:'flex',gap:10,alignItems:'center'}}>
          <span style={{fontSize:22}}>⚠️</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.red}}>{externas.length} modificación{externas.length>1?'es':''} por camarero ajeno</div>
            <div style={{fontSize:11,color:C.red,opacity:.8}}>Marcadas en rojo abajo</div>
          </div>
        </div>
      )}

      {audit.length===0&&<div style={{padding:40,textAlign:'center',color:C.ink4,fontSize:14}}>Sin modificaciones registradas hoy</div>}

      <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:12,overflow:'hidden'}}>
        {audit.map((a,i)=>(
          <div key={a.id} style={{padding:'10px 14px',borderBottom:i<audit.length-1?`1px solid ${C.rule}`:'none',display:'flex',alignItems:'flex-start',gap:10,background:!a.es_propietario?C.redS:'transparent'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:a.es_propietario?C.green:C.red,flexShrink:0,marginTop:4}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,fontWeight:600,color:a.es_propietario?C.ink:C.red}}>
                  {a.camarero_nombre}
                  {!a.es_propietario&&<span style={{fontSize:9,fontWeight:700,marginLeft:6,padding:'1px 5px',background:C.red,borderRadius:3,color:'#fff'}}>AJENO</span>}
                </span>
                <span style={{fontFamily:SM,fontSize:9,color:C.ink4}}>{fmtTime(a.created_at)}</span>
              </div>
              <div style={{fontSize:11,color:C.ink3,marginTop:2}}>
                <span style={{fontFamily:SM,fontSize:9,textTransform:'uppercase',letterSpacing:'.5px'}}>{a.accion.replace('_',' ')}</span>
                {a.item_nombre&&<span> · {a.item_nombre}</span>}
                {a.item_cantidad_antes!==null&&a.item_cantidad_despues!==null&&a.item_cantidad_antes!==a.item_cantidad_despues&&(
                  <span style={{color:C.amber}}> · {a.item_cantidad_antes}→{a.item_cantidad_despues}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
