'use client'
import React, { useState, useEffect, useCallback } from 'react'

const K = {
  bg:'#14110E',bg2:'#1E1A15',bg3:'#2A221A',
  paper:'#F6F1E7',bone:'#EDE8DF',
  ink:'#F6F1E7',ink2:'#D8CDB6',ink3:'#9C8E7E',ink4:'#6B5F52',
  red:'#D9442B',amber:'#E8A33B',green:'#3F7D44',teal:'#2B6A6E',
  rule:'#2E2720',
  SE:"'Newsreader',Georgia,serif",
  SN:"'Inter Tight',system-ui,sans-serif",
  SM:"'Inter Tight',monospace",
}

type Session={id:string;nombre:string;rol:string;restaurante_id:string}
type Espacio={id:string;nombre:string;tipo:string;aforo_maximo:number|null;descripcion:string|null}
type OcupacionFecha={fecha?:string;fecha_inicio?:string;fecha_fin?:string;tipo:string;descripcion:string;numero?:string;es_propio?:boolean;confirmado?:boolean;expira_at?:string|null}
type DisponibilidadEspacio={espacio:Espacio;ocupadas:OcupacionFecha[];opciones:OcupacionFecha[];bloqueados:OcupacionFecha[]}
type Evento={id:string;numero_evento:string;tipo:string;estado:string;fecha_evento:string;hora_inicio:string|null;cliente_nombre:string;cliente_telefono:string|null;cliente_email:string|null;aforo_previsto:number;precio_total:number|null;precio_por_persona:number|null;espacio_id:string|null;modo_local:string;senial_pagada:boolean;espacio_bloqueado_hasta:string|null;espacios_evento:{nombre:string}|null}

const TIPO_LABELS:Record<string,string>={boda:'💍 Boda',comunion:'⛪ Comunión',bautizo:'👶 Bautizo',cumpleanos:'🎂 Cumpleaños',empresa:'🏢 Empresa',otro:'📅 Otro'}
const ESTADO_COLOR:Record<string,string>={presupuesto:K.amber,confirmado:K.green,en_curso:K.red,completado:K.ink3,facturado:K.teal}
const fmt=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})
const fmtEur=(n:number|null)=>n?`${n.toLocaleString('es-ES',{minimumFractionDigits:0})} €`:'—'
const diasHasta=(d:string)=>{const diff=Math.ceil((new Date(d+'T00:00:00').getTime()-Date.now())/86400000);if(diff<0)return null;if(diff===0)return'¡HOY!';return diff===1?'mañana':`${diff}d`}

function CalendarioDisponibilidad({esp,ocupadas,opciones,bloqueados,onReservar}:{esp:Espacio;ocupadas:OcupacionFecha[];opciones:OcupacionFecha[];bloqueados:OcupacionFecha[];onReservar:(espacio:Espacio,fecha:string)=>void}){
  const hoy=new Date()
  const [mes,setMes]=useState(hoy.getMonth())
  const [anio,setAnio]=useState(hoy.getFullYear())
  const offset=new Date(anio,mes,1).getDay();const oAdjusted=offset===0?6:offset-1
  const diasMes=new Date(anio,mes+1,0).getDate()
  const fechaStr=(d:number)=>`${anio}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  const esPasado=(d:number)=>new Date(fechaStr(d))<new Date(hoy.toISOString().slice(0,10))
  const estadoFecha=(d:number)=>{
    if(esPasado(d))return'pasado'
    const f=fechaStr(d)
    if(ocupadas.some(o=>o.fecha===f))return'ocupado'
    if(bloqueados.some(b=>{const ini=b.fecha_inicio??b.fecha;const fin=b.fecha_fin??b.fecha;return ini&&fin&&f>=ini&&f<=fin}))return'bloqueado'
    if(opciones.some(o=>o.fecha===f))return'opcion'
    return'libre'
  }
  const colorE:Record<string,string>={libre:K.green+'33',ocupado:K.red+'55',opcion:K.amber+'44',bloqueado:K.ink3+'33',pasado:'transparent'}
  const borderE:Record<string,string>={libre:K.green,ocupado:K.red,opcion:K.amber,bloqueado:K.ink3,pasado:'transparent'}
  const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return(
    <div style={{background:K.bg2,border:`1px solid ${K.rule}`,borderRadius:10,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontFamily:K.SE,fontSize:16,fontWeight:700,color:K.ink,fontStyle:'italic'}}>{esp.nombre}</div>
          <div style={{fontFamily:K.SN,fontSize:11,color:K.ink3}}>{esp.tipo} · Máx. {esp.aforo_maximo??'—'} personas</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>{if(mes===0){setMes(11);setAnio(a=>a-1)}else setMes(m=>m-1)}} style={{background:'none',border:`1px solid ${K.rule}`,color:K.ink2,borderRadius:5,padding:'4px 8px',cursor:'pointer',fontFamily:K.SN,fontSize:13}}>‹</button>
          <span style={{fontFamily:K.SN,fontSize:12,color:K.ink2,minWidth:110,textAlign:'center'}}>{MESES[mes]} {anio}</span>
          <button onClick={()=>{if(mes===11){setMes(0);setAnio(a=>a+1)}else setMes(m=>m+1)}} style={{background:'none',border:`1px solid ${K.rule}`,color:K.ink2,borderRadius:5,padding:'4px 8px',cursor:'pointer',fontFamily:K.SN,fontSize:13}}>›</button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
        {['L','M','X','J','V','S','D'].map(d=><div key={d} style={{textAlign:'center',fontFamily:K.SN,fontSize:10,color:K.ink4,padding:'3px 0'}}>{d}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
        {Array.from({length:oAdjusted}).map((_,i)=><div key={`e-${i}`}/>)}
        {Array.from({length:diasMes},(_,i)=>i+1).map(d=>{
          const estado=estadoFecha(d);const esLibre=estado==='libre'
          return(<button key={d} onClick={()=>esLibre?onReservar(esp,fechaStr(d)):null} disabled={!esLibre} style={{background:colorE[estado],border:`1px solid ${borderE[estado]}`,borderRadius:5,padding:'6px 2px',cursor:esLibre?'pointer':'default',fontFamily:K.SN,fontSize:12,color:estado==='pasado'?K.ink4:estado==='libre'?K.green:K.ink2,fontWeight:estado==='ocupado'?700:400}}>{d}</button>)
        })}
      </div>
      <div style={{display:'flex',gap:10,marginTop:10,flexWrap:'wrap'}}>
        {[{color:K.green,label:'Libre'},{color:K.red,label:'Ocupado'},{color:K.amber,label:'Opción'},{color:K.ink3,label:'Bloqueado'}].map(l=>(
          <div key={l.label} style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:10,height:10,borderRadius:2,background:l.color+'55',border:`1px solid ${l.color}`}}/>
            <span style={{fontFamily:K.SN,fontSize:10,color:K.ink3}}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModalReservar({espacio,fecha,onDone,onCancel}:{espacio:Espacio;fecha:string;onDone:()=>void;onCancel:()=>void}){
  const [opcion48h,setOpcion48h]=useState(true)
  const [nota,setNota]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const handleReservar=async()=>{
    setSaving(true);setError('')
    try{
      const res=await fetch('/api/eventos-wp/reservar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({espacio_id:espacio.id,fecha_inicio:fecha,fecha_fin:fecha,tipo:'reserva',nota,opcion_48h:opcion48h})})
      const data=await res.json()
      if(!res.ok){setError(data.error);return}
      onDone()
    }finally{setSaving(false)}
  }
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
      <div style={{background:K.bg2,border:`1px solid ${K.rule}`,borderRadius:12,padding:24,width:'100%',maxWidth:360}}>
        <div style={{fontFamily:K.SE,fontSize:18,fontWeight:700,color:K.ink,fontStyle:'italic',marginBottom:4}}>Reservar espacio</div>
        <div style={{fontFamily:K.SN,fontSize:13,color:K.ink2,marginBottom:16}}>{espacio.nombre} · {fmt(fecha)}</div>
        <div style={{display:'flex',gap:6,marginBottom:14}}>
          {[{v:true,label:'⏱ Opción 48h',sub:'Provisional. Expira si no confirmas.'},{v:false,label:'✓ Reserva fija',sub:'Sin expiración.'}].map(o=>(
            <button key={String(o.v)} onClick={()=>setOpcion48h(o.v)} style={{flex:1,padding:'10px 8px',borderRadius:7,border:`1px solid ${opcion48h===o.v?K.amber:K.rule}`,background:opcion48h===o.v?K.amber+'22':'transparent',cursor:'pointer',textAlign:'left'}}>
              <div style={{fontFamily:K.SN,fontSize:12,fontWeight:600,color:opcion48h===o.v?K.amber:K.ink2}}>{o.label}</div>
              <div style={{fontFamily:K.SN,fontSize:10,color:K.ink3,marginTop:2}}>{o.sub}</div>
            </button>
          ))}
        </div>
        <input type="text" placeholder="Nota (cliente, tipo evento...)" value={nota} onChange={e=>setNota(e.target.value)}
          style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'8px 10px',fontFamily:K.SN,fontSize:13,color:K.ink,marginBottom:14,boxSizing:'border-box'}}/>
        {error&&<div style={{color:K.red,fontFamily:K.SN,fontSize:12,marginBottom:10}}>{error}</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:'9px',borderRadius:6,border:`1px solid ${K.rule}`,background:'transparent',fontFamily:K.SN,fontSize:13,color:K.ink3,cursor:'pointer'}}>Cancelar</button>
          <button onClick={handleReservar} disabled={saving} style={{flex:2,padding:'9px',borderRadius:6,border:'none',background:K.amber,color:'#fff',fontFamily:K.SN,fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.7:1}}>
            {saving?'...':opcion48h?'Reservar opción 48h':'Reservar espacio'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoginWP({onLogin}:{onLogin:(s:Session)=>void}){
  const [pin,setPin]=useState('')
  const [rid,setRid]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const handleLogin=async()=>{
    if(!pin||!rid){setError('Introduce el PIN y el ID del restaurante');return}
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/auth/eventos-wp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin,restaurante_id:rid})})
      const data=await res.json()
      if(!res.ok){setError(data.error);return}
      onLogin(data.session)
    }finally{setLoading(false)}
  }
  return(
    <div style={{minHeight:'100vh',background:K.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:340}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontFamily:K.SE,fontSize:28,fontStyle:'italic',color:K.ink,marginBottom:4}}>ia.rest</div>
          <div style={{fontFamily:K.SN,fontSize:13,color:K.ink3}}>Portal coordinador de eventos</div>
        </div>
        <div style={{background:K.bg2,border:`1px solid ${K.rule}`,borderRadius:12,padding:24}}>
          <div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>ID Restaurante</div>
          <input type="text" placeholder="Código del restaurante" value={rid} onChange={e=>setRid(e.target.value)}
            style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'10px 12px',fontFamily:K.SN,fontSize:14,color:K.ink,marginBottom:14,boxSizing:'border-box'}}/>
          <div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>PIN</div>
          <input type="password" placeholder="••••" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()}
            style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'10px 12px',fontFamily:K.SN,fontSize:20,color:K.ink,marginBottom:16,boxSizing:'border-box',letterSpacing:4}}/>
          {error&&<div style={{color:K.red,fontFamily:K.SN,fontSize:12,marginBottom:12}}>{error}</div>}
          <button onClick={handleLogin} disabled={loading} style={{width:'100%',padding:'12px',borderRadius:7,border:'none',background:K.red,color:'#fff',fontFamily:K.SN,fontSize:15,fontWeight:700,cursor:'pointer',opacity:loading?0.7:1}}>
            {loading?'Entrando...':'Entrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PanelWP({session}:{session:Session}){
  const [tab,setTab]=useState<'disponibilidad'|'mis_eventos'|'nuevo'>('disponibilidad')
  const [disponibilidad,setDisponibilidad]=useState<DisponibilidadEspacio[]>([])
  const [misEventos,setMisEventos]=useState<Evento[]>([])
  const [loading,setLoading]=useState(false)
  const [modalReservar,setModalReservar]=useState<{espacio:Espacio;fecha:string}|null>(null)
  const [form,setForm]=useState({tipo:'boda',cliente_nombre:'',cliente_telefono:'',cliente_email:'',fecha_evento:'',hora_inicio:'',aforo_previsto:'',precio_por_persona:'',espacio_id:'',notas_internas:'',reservar_espacio:true,opcion_48h:true})
  const [savingEvento,setSavingEvento]=useState(false)
  const [errorEvento,setErrorEvento]=useState('')

  const cargarDisponibilidad=useCallback(async()=>{
    setLoading(true)
    try{const res=await fetch('/api/eventos-wp/disponibilidad');const data=await res.json();setDisponibilidad(data.disponibilidad??[])}
    finally{setLoading(false)}
  },[])

  const cargarEventos=useCallback(async()=>{
    const res=await fetch('/api/eventos-wp');const data=await res.json();setMisEventos(data.eventos??[])
  },[])

  useEffect(()=>{if(tab==='disponibilidad')cargarDisponibilidad();if(tab==='mis_eventos')cargarEventos()},[tab,cargarDisponibilidad,cargarEventos])

  const handleCrearEvento=async()=>{
    if(!form.cliente_nombre||!form.fecha_evento||!form.aforo_previsto){setErrorEvento('Cliente, fecha y aforo son obligatorios');return}
    setSavingEvento(true);setErrorEvento('')
    try{
      const res=await fetch('/api/eventos-wp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
      const data=await res.json()
      if(!res.ok){setErrorEvento(data.error);return}
      setTab('mis_eventos')
      setForm({tipo:'boda',cliente_nombre:'',cliente_telefono:'',cliente_email:'',fecha_evento:'',hora_inicio:'',aforo_previsto:'',precio_por_persona:'',espacio_id:'',notas_internas:'',reservar_espacio:true,opcion_48h:true})
    }finally{setSavingEvento(false)}
  }

  const espaciosDisponibles=disponibilidad.map(d=>d.espacio)
  const totalPrevistos=misEventos.reduce((s,e)=>s+(e.precio_total??0),0)
  const confirmados=misEventos.filter(e=>e.estado==='confirmado').length
  const inp=(field:string,type='text',ph='')=>(<input type={type} placeholder={ph} value={(form as Record<string,unknown>)[field] as string} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'8px 10px',fontFamily:K.SN,fontSize:13,color:K.ink,boxSizing:'border-box'}}/>)

  return(
    <div style={{minHeight:'100vh',background:K.bg,paddingBottom:60}}>
      <div style={{background:K.bg2,borderBottom:`1px solid ${K.rule}`,padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
        <div>
          <div style={{fontFamily:K.SE,fontSize:17,fontStyle:'italic',color:K.ink}}>Eventos</div>
          <div style={{fontFamily:K.SN,fontSize:11,color:K.ink3}}>{session.nombre}</div>
        </div>
        <div style={{display:'flex',gap:16}}>
          <div style={{textAlign:'right'}}><div style={{fontFamily:K.SN,fontSize:10,color:K.ink3}}>Confirmados</div><div style={{fontFamily:K.SE,fontSize:18,fontStyle:'italic',color:K.green}}>{confirmados}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontFamily:K.SN,fontSize:10,color:K.ink3}}>Previsto</div><div style={{fontFamily:K.SE,fontSize:18,fontStyle:'italic',color:K.ink}}>{fmtEur(totalPrevistos)}</div></div>
        </div>
      </div>

      <div style={{display:'flex',background:K.bg2,borderBottom:`1px solid ${K.rule}`}}>
        {(['disponibilidad','mis_eventos','nuevo'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'12px 8px',border:'none',borderBottom:tab===t?`2px solid ${K.red}`:'2px solid transparent',background:'transparent',fontFamily:K.SN,fontSize:12,fontWeight:tab===t?700:400,color:tab===t?K.ink:K.ink3,cursor:'pointer'}}>
            {t==='disponibilidad'?'📅 Disponibilidad':t==='mis_eventos'?'📋 Mis eventos':'+ Nuevo'}
          </button>
        ))}
      </div>

      <div style={{padding:'16px 16px 0'}}>
        {tab==='disponibilidad'&&(loading?
          <div style={{textAlign:'center',padding:40,fontFamily:K.SN,fontSize:13,color:K.ink3}}>Cargando...</div>:
          disponibilidad.length===0?
          <div style={{textAlign:'center',padding:40,fontFamily:K.SN,fontSize:13,color:K.ink3}}>Sin espacios configurados</div>:
          disponibilidad.map(d=><CalendarioDisponibilidad key={d.espacio.id} esp={d.espacio} ocupadas={d.ocupadas} opciones={d.opciones} bloqueados={d.bloqueados} onReservar={(esp,fecha)=>setModalReservar({espacio:esp,fecha})}/>)
        )}

        {tab==='mis_eventos'&&(misEventos.length===0?
          <div style={{textAlign:'center',padding:40,background:K.bg2,borderRadius:10,border:`1px solid ${K.rule}`}}>
            <div style={{fontSize:32,marginBottom:8}}>📅</div>
            <div style={{fontFamily:K.SE,fontSize:16,color:K.ink}}>Sin eventos</div>
          </div>:
          misEventos.map(e=>(
            <div key={e.id} style={{background:K.bg2,border:`1px solid ${K.rule}`,borderRadius:10,padding:'14px 16px',marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                <div>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:2}}>
                    <span style={{fontFamily:K.SM,fontSize:10,color:K.ink3}}>{e.numero_evento}</span>
                    <span style={{fontFamily:K.SN,fontSize:11,padding:'2px 7px',borderRadius:99,background:(ESTADO_COLOR[e.estado]??K.ink3)+'22',color:ESTADO_COLOR[e.estado]??K.ink3,fontWeight:600}}>{e.estado}</span>
                    {(()=>{const d=diasHasta(e.fecha_evento);return d?<span style={{fontFamily:K.SN,fontSize:10,color:K.amber}}>{d}</span>:null})()}
                  </div>
                  <div style={{fontFamily:K.SE,fontSize:16,fontWeight:700,color:K.ink,fontStyle:'italic'}}>{TIPO_LABELS[e.tipo]??e.tipo} — {e.cliente_nombre}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:K.SE,fontSize:18,color:K.ink,fontStyle:'italic'}}>{fmtEur(e.precio_total)}</div>
                  <div style={{fontFamily:K.SN,fontSize:10,color:K.ink3}}>{e.aforo_previsto} pers.</div>
                </div>
              </div>
              <div style={{fontFamily:K.SN,fontSize:12,color:K.ink2}}>📅 {fmt(e.fecha_evento)}{e.hora_inicio?` · ${e.hora_inicio}`:''}{e.espacios_evento?` · 📍 ${e.espacios_evento.nombre}`:''}</div>
              {e.espacio_bloqueado_hasta&&<div style={{fontFamily:K.SN,fontSize:11,color:K.amber,marginTop:4}}>⏱ Opción hasta {new Date(e.espacio_bloqueado_hasta).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>}
              <button onClick={()=>window.open(`/api/owner/eventos/presupuesto?evento_id=${e.id}`,'_blank')} style={{marginTop:8,padding:'5px 10px',borderRadius:5,border:`1px solid ${K.rule}`,background:'transparent',fontFamily:K.SN,fontSize:11,color:K.teal,cursor:'pointer'}}>📄 Presupuesto</button>
            </div>
          ))
        )}

        {tab==='nuevo'&&(
          <div style={{background:K.bg2,border:`1px solid ${K.rule}`,borderRadius:10,padding:18}}>
            <div style={{fontFamily:K.SE,fontSize:17,fontStyle:'italic',color:K.ink,marginBottom:16}}>Nuevo evento</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Tipo</div>
              <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'8px 10px',fontFamily:K.SN,fontSize:13,color:K.ink}}>
                {Object.entries(TIPO_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></div>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Cliente *</div>{inp('cliente_nombre','text','Nombre del cliente')}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Teléfono</div>{inp('cliente_telefono','tel','600 000 000')}</div>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Email</div>{inp('cliente_email','email','cliente@email.com')}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Fecha *</div>{inp('fecha_evento','date')}</div>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Hora</div>{inp('hora_inicio','time')}</div>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Aforo *</div>{inp('aforo_previsto','number','100')}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>€/persona</div>{inp('precio_por_persona','number','45')}</div>
              <div><div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Espacio</div>
              <select value={form.espacio_id} onChange={e=>setForm(f=>({...f,espacio_id:e.target.value}))} style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'8px 10px',fontFamily:K.SN,fontSize:13,color:K.ink}}>
                <option value="">— Sin espacio —</option>
                {espaciosDisponibles.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select></div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontFamily:K.SN,fontSize:11,color:K.ink3,marginBottom:4,textTransform:'uppercase',letterSpacing:'.08em'}}>Notas</div>
              <textarea value={form.notas_internas} onChange={e=>setForm(f=>({...f,notas_internas:e.target.value}))} rows={2} placeholder="Alergias, peticiones especiales..." style={{width:'100%',background:K.bg3,border:`1px solid ${K.rule}`,borderRadius:6,padding:'8px 10px',fontFamily:K.SN,fontSize:13,color:K.ink,resize:'vertical',boxSizing:'border-box'}}/>
            </div>
            {form.espacio_id&&(
              <div style={{background:K.amber+'11',border:`1px solid ${K.amber}44`,borderRadius:8,padding:'10px 12px',marginBottom:14}}>
                <div style={{fontFamily:K.SN,fontSize:12,color:K.amber,fontWeight:600,marginBottom:6}}>Reserva del espacio</div>
                <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontFamily:K.SN,fontSize:12,color:K.ink2,marginBottom:4}}>
                  <input type="checkbox" checked={form.reservar_espacio} onChange={e=>setForm(f=>({...f,reservar_espacio:e.target.checked}))}/>
                  Bloquear espacio al crear el evento
                </label>
                {form.reservar_espacio&&(
                  <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontFamily:K.SN,fontSize:12,color:K.ink3}}>
                    <input type="checkbox" checked={form.opcion_48h} onChange={e=>setForm(f=>({...f,opcion_48h:e.target.checked}))}/>
                    Opción provisional 48h (expira si no confirmas)
                  </label>
                )}
              </div>
            )}
            {errorEvento&&<div style={{color:K.red,fontFamily:K.SN,fontSize:12,marginBottom:10}}>{errorEvento}</div>}
            <button onClick={handleCrearEvento} disabled={savingEvento} style={{width:'100%',padding:'12px',borderRadius:7,border:'none',background:K.red,color:'#fff',fontFamily:K.SN,fontSize:14,fontWeight:700,cursor:'pointer',opacity:savingEvento?0.7:1}}>
              {savingEvento?'Creando...':'Crear evento'}
            </button>
          </div>
        )}
      </div>

      {modalReservar&&<ModalReservar espacio={modalReservar.espacio} fecha={modalReservar.fecha} onDone={()=>{setModalReservar(null);cargarDisponibilidad()}} onCancel={()=>setModalReservar(null)}/>}
    </div>
  )
}

export default function PortalEventosPage(){
  const [session,setSession]=useState<Session|null>(null)
  return session?<PanelWP session={session}/>:<LoginWP onLogin={setSession}/>
}
