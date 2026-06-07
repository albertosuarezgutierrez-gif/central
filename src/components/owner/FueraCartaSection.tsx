'use client'
import React from 'react'
import { C, SE, SN, SM, SC } from '@/lib/colors'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Paleta light — igual que owner/page.tsx

// ── Sesión (patrón owner: localStorage)
const getSession = () => {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}

// ── Tipos
interface FueraCartaProducto {
  id: string; nombre: string; precio: number
  descripcion: string | null; categoria: string; alergenos: string[]
  expira_at: string | null; expira_label: string; horas_restantes: number | null
  stock_raciones: number | null; stock_restante: number | null
  stock_agotado: boolean; stock_agotado_at: string | null
}
interface SeccionCocina { id: string; nombre: string }
interface NuevoEspecial {
  nombre: string; precio: string; descripcion: string
  categoria: string; alergenos: string[]; seccion_id: string; dias: number
  stock_activo: boolean; stock_raciones: string
}

// ── Constantes UI
const ALERGENOS_EU = [
  'Gluten','Crustáceos','Huevo','Pescado','Cacahuetes','Soja','Lácteos',
  'Frutos de cáscara','Apio','Mostaza','Sésamo','Dióxido de azufre','Altramuces','Moluscos'
]
const CATEGORIAS = [
  'Especiales','Entrantes','Principales','Postres','Bebidas','Sugerencias del chef'
]
const OPCION_DIAS = [
  {label:'Solo hoy',value:0},{label:'1 día',value:1},{label:'2 días',value:2},
  {label:'3 días',value:3},{label:'5 días',value:5},{label:'1 semana',value:7},
]

// ── Badge expiración
function ExpiraBadge({label,horas}:{label:string;horas:number|null}) {
  const urgente = horas !== null && horas < 2
  const pronto  = horas !== null && horas < 6
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',
      borderRadius:6,fontSize:11,fontFamily:SM,
      background:urgente?'#A8311E18':pronto?'#E8A33B18':'#3F7D4418',
      color:urgente?C.redD:pronto?C.amb:C.green,
      border:`1px solid ${urgente?'#D9442B33':pronto?'#E8A33B33':'#3F7D4433'}`}}>
      {urgente?'⚡':pronto?'⏳':'📅'} {label}
    </span>
  )
}

// ── Badge stock con barra de progreso
function StockBadge({p}:{p:FueraCartaProducto}) {
  if (p.stock_raciones === null) return null
  const restante = p.stock_restante ?? 0
  const total    = p.stock_raciones
  const pct      = total > 0 ? (restante / total) * 100 : 0
  const critico  = !p.stock_agotado && pct <= 20
  const bajo     = !p.stock_agotado && pct <= 50
  const barColor = p.stock_agotado ? C.rule : critico ? C.red : bajo ? C.amb : C.green
  const txtColor = p.stock_agotado ? C.ink4  : critico ? C.redD : bajo ? C.amb : C.green
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div style={{width:52,height:4,borderRadius:3,background:C.rule,overflow:'hidden',flexShrink:0}}>
        <div style={{width:`${pct}%`,height:'100%',borderRadius:3,transition:'width .4s ease',
          background:barColor}}/>
      </div>
      <span style={{fontFamily:SM,fontSize:11,whiteSpace:'nowrap',fontWeight:600,color:txtColor}}>
        {p.stock_agotado ? 'AGOTADO' : `${restante}/${total}`}
      </span>
    </div>
  )
}

// ── Input style light
const IS: React.CSSProperties = {
  width:'100%', padding:'8px 10px', borderRadius:4, fontSize:13,
  background:C.paper, border:`1px solid ${C.rule}`,
  color:C.ink, outline:'none', boxSizing:'border-box', fontFamily:SN,
}

// ── Modal nuevo especial
function ModalNuevo({restauranteId,secciones,onCreado,onCerrar}:{
  restauranteId:string; secciones:SeccionCocina[]; onCreado:()=>void; onCerrar:()=>void
}) {
  const [form,setForm] = useState<NuevoEspecial>({
    nombre:'',precio:'',descripcion:'',categoria:'Especiales',
    alergenos:[],seccion_id:'',dias:1,stock_activo:false,stock_raciones:'10'
  })
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')

  const toggleAlergeno = (a:string) =>
    setForm(f=>({...f,alergenos:f.alergenos.includes(a)?f.alergenos.filter(x=>x!==a):[...f.alergenos,a]}))

  const guardar = async () => {
    if (!form.nombre.trim())                           {setError('El nombre es obligatorio');return}
    if (!form.precio||isNaN(parseFloat(form.precio))) {setError('Precio no válido');return}
    if (form.stock_activo) {
      const s = parseInt(form.stock_raciones)
      if (isNaN(s)||s<1) {setError('Número de raciones no válido (mín. 1)');return}
    }
    setGuardando(true);setError('')
    const {error:err} = await supabase.rpc('crear_fuera_carta',{
      p_restaurante_id:restauranteId,
      p_nombre:form.nombre.trim(),
      p_precio:parseFloat(form.precio),
      p_descripcion:form.descripcion.trim()||null,
      p_categoria:form.categoria,
      p_alergenos:form.alergenos,
      p_seccion_id:form.seccion_id||null,
      p_dias:form.dias,
      p_stock:form.stock_activo?parseInt(form.stock_raciones):null,
    })
    if (err){setError(err.message);setGuardando(false);return}
    onCreado();onCerrar()
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',
      justifyContent:'center',padding:16,background:'rgba(26,23,20,0.5)',backdropFilter:'blur(4px)'}}>
      <div style={{width:'100%',maxWidth:480,borderRadius:12,overflow:'hidden',
        background:C.bone,border:`1px solid ${C.rule}`,maxHeight:'90vh',overflowY:'auto',
        boxShadow:'0 8px 40px rgba(26,23,20,0.2)'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 18px',borderBottom:`1px solid ${C.rule}`,background:C.bone}}>
          <div>
            <p style={{color:C.ink,fontFamily:SE,fontWeight:600,fontSize:15,margin:0}}>Nuevo especial fuera de carta</p>
            <p style={{color:C.ink3,fontSize:11,margin:'2px 0 0',fontStyle:'italic',fontFamily:SC}}>
              Se añade a la carta y desaparece al expirar o agotarse
            </p>
          </div>
          <button onClick={onCerrar} style={{color:C.ink4,background:'none',border:'none',fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
        </div>

        <div style={{padding:18,display:'flex',flexDirection:'column',gap:14}}>
          {/* Nombre */}
          <div>
            <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
              textTransform:'uppercase',display:'block',marginBottom:5,fontFamily:SM}}>Nombre *</label>
            <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}
              placeholder="Ej: Arroz meloso de pato…" style={IS}/>
          </div>

          {/* Precio + Categoría */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
                textTransform:'uppercase',display:'block',marginBottom:5,fontFamily:SM}}>Precio (€) *</label>
              <input type="number" step="0.5" min="0" value={form.precio}
                onChange={e=>setForm(f=>({...f,precio:e.target.value}))}
                placeholder="0.00" style={{...IS,fontFamily:SM}}/>
            </div>
            <div>
              <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
                textTransform:'uppercase',display:'block',marginBottom:5,fontFamily:SM}}>Categoría</label>
              <select value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}
                style={IS}>
                {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
              textTransform:'uppercase',display:'block',marginBottom:5,fontFamily:SM}}>
              Descripción <span style={{color:C.ink4,textTransform:'none',fontWeight:400}}>(opcional)</span>
            </label>
            <textarea value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}
              placeholder="Notas para sala o cocina…" rows={2}
              style={{...IS,resize:'none'} as React.CSSProperties}/>
          </div>

          {/* Partida */}
          {secciones.length>0 && (
            <div>
              <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
                textTransform:'uppercase',display:'block',marginBottom:5,fontFamily:SM}}>Partida de cocina</label>
              <select value={form.seccion_id} onChange={e=>setForm(f=>({...f,seccion_id:e.target.value}))}
                style={IS}>
                <option value="">Sin asignar</option>
                {secciones.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}

          {/* Tiempo */}
          <div>
            <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
              textTransform:'uppercase',display:'block',marginBottom:8,fontFamily:SM}}>
              ¿Hasta cuándo está disponible?
            </label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {OPCION_DIAS.map(op=>(
                <button key={op.value} onClick={()=>setForm(f=>({...f,dias:op.value}))}
                  style={{padding:'5px 12px',borderRadius:20,fontSize:12,cursor:'pointer',
                    fontWeight:500,fontFamily:SN,transition:'all .15s',
                    background:form.dias===op.value?C.ink:'transparent',
                    color:form.dias===op.value?C.paper:C.ink3,
                    border:`1px solid ${form.dias===op.value?C.ink:C.rule}`}}>
                  {op.label}
                </button>
              ))}
            </div>
            <p style={{color:C.ink4,fontSize:11,margin:'5px 0 0',fontStyle:'italic',fontFamily:SC}}>
              Se desactiva automáticamente a las 23:59 del último día
            </p>
          </div>

          {/* ── CONTROL DE RACIONES ── */}
          <div style={{borderRadius:8,border:`1px solid ${form.stock_activo?C.ruleS:C.rule}`,
            overflow:'hidden',transition:'border-color .2s',background:C.paper}}>
            {/* Toggle */}
            <button onClick={()=>setForm(f=>({...f,stock_activo:!f.stock_activo}))}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'11px 14px',background:form.stock_activo?C.paper2:'transparent',
                border:'none',cursor:'pointer',transition:'background .2s'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {/* Toggle pill */}
                <div style={{width:36,height:20,borderRadius:10,position:'relative',flexShrink:0,
                  background:form.stock_activo?C.ink:C.rule,transition:'background .2s'}}>
                  <div style={{position:'absolute',top:3,left:form.stock_activo?19:3,width:14,height:14,
                    borderRadius:'50%',background:C.bone,transition:'left .2s',
                    boxShadow:'0 1px 3px rgba(0,0,0,.15)'}}/>
                </div>
                <div style={{textAlign:'left'}}>
                  <div style={{color:C.ink2,fontSize:13,fontWeight:500,fontFamily:SN}}>Limitar por raciones</div>
                  <div style={{color:C.ink4,fontSize:11,marginTop:1,fontFamily:SC}}>
                    Desaparece automáticamente al agotarse
                  </div>
                </div>
              </div>
              {form.stock_activo && (
                <span style={{color:C.ink,fontSize:10,fontFamily:SM,fontWeight:700,letterSpacing:'.08em'}}>
                  ACTIVO
                </span>
              )}
            </button>

            {/* Input raciones (visible solo cuando activo) */}
            {form.stock_activo && (
              <div style={{padding:'2px 14px 14px',borderTop:`1px solid ${C.rule}`}}>
                <div style={{paddingTop:12}}>
                  <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
                    textTransform:'uppercase',display:'block',marginBottom:8,fontFamily:SM}}>
                    Raciones disponibles
                  </label>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <button
                      onClick={()=>setForm(f=>({...f,stock_raciones:String(Math.max(1,parseInt(f.stock_raciones||'1')-1))}))}
                      style={{width:32,height:32,borderRadius:6,background:C.paper2,
                        border:`1px solid ${C.rule}`,color:C.ink2,fontSize:18,cursor:'pointer',
                        flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>−</button>
                    <input type="number" min="1" max="999" value={form.stock_raciones}
                      onChange={e=>setForm(f=>({...f,stock_raciones:e.target.value}))}
                      style={{...IS,width:76,textAlign:'center',fontFamily:SM,fontSize:22,fontWeight:700,padding:'4px 0'}}/>
                    <button
                      onClick={()=>setForm(f=>({...f,stock_raciones:String(Math.min(999,parseInt(f.stock_raciones||'1')+1))}))}
                      style={{width:32,height:32,borderRadius:6,background:C.paper2,
                        border:`1px solid ${C.rule}`,color:C.ink2,fontSize:18,cursor:'pointer',
                        flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>+</button>
                    <span style={{color:C.ink3,fontSize:13,fontFamily:SN}}>raciones</span>
                  </div>
                  <p style={{color:C.ink4,fontSize:11,margin:'7px 0 0',fontStyle:'italic',fontFamily:SC}}>
                    Al vender la última, desaparece del panel del camarero automáticamente
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Alérgenos */}
          <div>
            <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
              textTransform:'uppercase',display:'block',marginBottom:8,fontFamily:SM}}>
              Alérgenos <span style={{color:C.ink4,textTransform:'none',fontWeight:400}}>(EU 1169/2011)</span>
            </label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {ALERGENOS_EU.map(a=>(
                <button key={a} onClick={()=>toggleAlergeno(a)}
                  style={{padding:'4px 8px',borderRadius:4,fontSize:11,cursor:'pointer',
                    transition:'all .12s',fontFamily:SN,
                    background:form.alergenos.includes(a)?C.ambS:C.paper2,
                    color:form.alergenos.includes(a)?'#7A5200':C.ink3,
                    border:`1px solid ${form.alergenos.includes(a)?C.amb:C.rule}`}}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p style={{fontSize:12,padding:'8px 12px',borderRadius:6,margin:0,
              background:C.redS,color:C.redD,border:`1px solid #D9442B33`,fontFamily:SN}}>
              {error}
            </p>
          )}
        </div>

        <div style={{display:'flex',gap:10,padding:'14px 18px',borderTop:`1px solid ${C.rule}`,background:C.paper}}>
          <button onClick={onCerrar}
            style={{flex:1,padding:10,borderRadius:6,fontSize:13,cursor:'pointer',fontFamily:SN,
              background:'transparent',color:C.ink3,border:`1px solid ${C.rule}`}}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            style={{flex:1,padding:10,borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:SN,
              background:guardando?C.rule:C.red,color:guardando?C.ink3:'#fff',border:'none',
              opacity:guardando?0.6:1}}>
            {guardando?'Añadiendo…':'+ Añadir a carta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal reponer stock
function ModalReponer({producto,restauranteId,onRepuesto,onCerrar}:{
  producto:FueraCartaProducto; restauranteId:string; onRepuesto:()=>void; onCerrar:()=>void
}) {
  const [cantidad,setCantidad] = useState(String(producto.stock_raciones??10))
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')

  const reponer = async () => {
    const n = parseInt(cantidad)
    if (isNaN(n)||n<1){setError('Número inválido');return}
    setGuardando(true)
    try {
      const r = await fetch('/api/owner/fuera-carta/stock',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-ia-session':getSession()},
        body:JSON.stringify({accion:'reponer',producto_id:producto.id,nuevo_stock:n}),
      })
      const d = await r.json()
      if (!r.ok||d.error) throw new Error(d.error||'Error al reponer')
      onRepuesto();onCerrar()
    } catch(e:unknown){
      setError(e instanceof Error?e.message:'Error')
      setGuardando(false)
    }
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',
      justifyContent:'center',padding:16,background:'rgba(26,23,20,0.5)',backdropFilter:'blur(4px)'}}>
      <div style={{width:'100%',maxWidth:340,borderRadius:12,background:C.bone,
        border:`1px solid ${C.rule}`,overflow:'hidden',boxShadow:'0 8px 40px rgba(26,23,20,0.2)'}}>
        <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.rule}`}}>
          <p style={{color:C.ink,fontFamily:SE,fontWeight:600,fontSize:15,margin:0}}>Reponer raciones</p>
          <p style={{color:C.ink3,fontSize:12,margin:'3px 0 0',fontFamily:SC}}>{producto.nombre}</p>
        </div>
        <div style={{padding:18}}>
          <label style={{color:C.ink3,fontSize:11,fontWeight:700,letterSpacing:'.1em',
            textTransform:'uppercase',display:'block',marginBottom:10,fontFamily:SM}}>
            Nuevas raciones disponibles
          </label>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <button onClick={()=>setCantidad(s=>String(Math.max(1,parseInt(s||'1')-1)))}
              style={{width:36,height:36,borderRadius:6,background:C.paper2,border:`1px solid ${C.rule}`,
                color:C.ink2,fontSize:20,cursor:'pointer',flexShrink:0,
                display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
            <input type="number" min="1" max="999" value={cantidad}
              onChange={e=>setCantidad(e.target.value)}
              style={{flex:1,padding:'6px 0',borderRadius:6,fontSize:26,fontWeight:700,textAlign:'center',
                background:C.paper,border:`1px solid ${C.rule}`,color:C.ink,outline:'none',fontFamily:SM}}/>
            <button onClick={()=>setCantidad(s=>String(Math.min(999,parseInt(s||'1')+1)))}
              style={{width:36,height:36,borderRadius:6,background:C.paper2,border:`1px solid ${C.rule}`,
                color:C.ink2,fontSize:20,cursor:'pointer',flexShrink:0,
                display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
          </div>
          {producto.stock_raciones && (
            <button onClick={()=>setCantidad(String(producto.stock_raciones))}
              style={{fontSize:11,color:C.ink4,background:'none',border:'none',cursor:'pointer',
                padding:0,textDecoration:'underline',fontFamily:SN}}>
              Restaurar original ({producto.stock_raciones} raciones)
            </button>
          )}
          {error && <p style={{fontSize:12,color:C.redD,marginTop:8,fontFamily:SN}}>{error}</p>}
        </div>
        <div style={{display:'flex',gap:10,padding:'12px 18px',borderTop:`1px solid ${C.rule}`,background:C.paper}}>
          <button onClick={onCerrar}
            style={{flex:1,padding:10,borderRadius:6,fontSize:13,cursor:'pointer',fontFamily:SN,
              background:'transparent',color:C.ink3,border:`1px solid ${C.rule}`}}>Cancelar</button>
          <button onClick={reponer} disabled={guardando}
            style={{flex:1,padding:10,borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:SN,
              background:guardando?C.rule:C.green,color:guardando?C.ink3:'#fff',border:'none'}}>
            {guardando?'Reponiendo…':'↺ Reponer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal
export default function FueraCartaSection({restauranteId}:{restauranteId:string}) {
  const [productos,setProductos]   = useState<FueraCartaProducto[]>([])
  const [secciones,setSecciones]   = useState<SeccionCocina[]>([])
  const [cargando,setCargando]     = useState(true)
  const [modalNuevo,setModalNuevo] = useState(false)
  const [eliminando,setEliminando] = useState<string|null>(null)
  const [reponiendo,setReponiendo] = useState<FueraCartaProducto|null>(null)
  const [decrement,setDecrement]   = useState<string|null>(null)

  const cargar = useCallback(async()=>{
    setCargando(true)
    const [{data:prods},{data:secc}] = await Promise.all([
      supabase.from('v_fuera_carta_activos').select('*').eq('restaurante_id',restauranteId),
      supabase.from('secciones_cocina').select('id,nombre').eq('local_id',restauranteId).order('nombre'),
    ])
    setProductos(prods??[])
    setSecciones(secc??[])
    setCargando(false)
  },[restauranteId])

  useEffect(()=>{cargar()},[cargar])

  const eliminar = async(id:string)=>{
    setEliminando(id)
    await supabase.from('productos').update({activo:false,es_fuera_carta:false})
      .eq('id',id).eq('local_id',restauranteId)
    await cargar()
    setEliminando(null)
  }

  const decrementarManual = async(p:FueraCartaProducto)=>{
    if (decrement) return
    setDecrement(p.id)
    try {
      const r = await fetch('/api/owner/fuera-carta/stock',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-ia-session':getSession()},
        body:JSON.stringify({accion:'decrementar',producto_id:p.id,cantidad:1}),
      })
      await r.json()
      await cargar()
    } finally { setDecrement(null) }
  }

  const agotados = productos.filter(p=>p.stock_agotado).length

  return (
    <>
      <div style={{borderRadius:8,overflow:'hidden',marginBottom:24,
        border:`1px solid ${C.ruleS}`,background:C.bone}}>

        {/* ── Header sección */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'10px 14px',background:C.paper2,
          borderBottom:productos.length>0?`1px solid ${C.rule}`:'none'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:C.red,fontSize:11}}>✦</span>
            <span style={{color:C.ink,fontFamily:SE,fontWeight:600,fontSize:14}}>Fuera de carta</span>
            {productos.length>0 && (
              <span style={{background:C.redS,color:C.redD,fontSize:11,fontFamily:SM,
                padding:'1px 6px',borderRadius:4}}>{productos.length}</span>
            )}
            {agotados>0 && (
              <span style={{background:C.paper3,color:C.ink4,fontSize:10,fontFamily:SM,
                padding:'1px 6px',borderRadius:4}}>
                {agotados} agotado{agotados>1?'s':''}
              </span>
            )}
          </div>
          <button onClick={()=>setModalNuevo(true)}
            style={{background:C.red,color:'#fff',border:'none',padding:'5px 12px',
              borderRadius:5,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:SN}}>
            + Añadir especial
          </button>
        </div>

        {/* ── Lista */}
        {cargando ? (
          <div style={{padding:'18px 14px',textAlign:'center',color:C.ink4,fontSize:13,fontFamily:SM}}>
            CARGANDO…
          </div>
        ) : productos.length===0 ? (
          <div style={{padding:'18px 14px',textAlign:'center'}}>
            <p style={{color:C.ink3,fontSize:13,margin:0,fontFamily:SN}}>Sin especiales activos hoy</p>
            <p style={{color:C.ink4,fontSize:12,margin:'4px 0 0',fontStyle:'italic',fontFamily:SC}}>
              El chuletón de hoy, el postre especial, la sugerencia del chef…
            </p>
          </div>
        ) : (
          productos.map((p:FueraCartaProducto,i:number)=>(
            <div key={p.id} style={{
              display:'flex',alignItems:'flex-start',justifyContent:'space-between',
              padding:'10px 14px',gap:12,
              borderTop:i>0?`1px solid ${C.rule}`:'none',
              opacity:p.stock_agotado?0.55:1,
              background:p.stock_agotado?C.paper3:'transparent',
              transition:'opacity .2s,background .2s',
            }}>
              <div style={{flex:1,minWidth:0}}>
                {/* Nombre + badges */}
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{color:p.stock_agotado?C.ink4:C.ink,fontWeight:600,
                    fontSize:14,fontFamily:SN}}>{p.nombre}</span>
                  {p.stock_agotado && (
                    <span style={{background:C.paper3,color:C.ink4,fontFamily:SM,fontSize:9,
                      padding:'2px 7px',borderRadius:4,fontWeight:700,letterSpacing:'.06em',
                      border:`1px solid ${C.rule}`}}>
                      AGOTADO
                    </span>
                  )}
                  <ExpiraBadge label={p.expira_label} horas={p.horas_restantes}/>
                </div>
                {/* Descripción */}
                {p.descripcion && (
                  <p style={{color:C.ink3,fontSize:12,margin:'3px 0 4px',overflow:'hidden',
                    textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:SN}}>{p.descripcion}</p>
                )}
                {/* Meta row */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4,flexWrap:'wrap'}}>
                  <span style={{color:C.amb,fontFamily:SM,fontSize:13}}>
                    {Number(p.precio).toFixed(2)} €
                  </span>
                  {p.categoria!=='Especiales' && (
                    <span style={{color:C.ink4,fontSize:11,fontFamily:SN}}>{p.categoria}</span>
                  )}
                  {p.alergenos?.length>0 && (
                    <span style={{color:C.amb,fontSize:11,fontFamily:SN}}>
                      ⚠ {p.alergenos.slice(0,2).join(', ')}{p.alergenos.length>2?` +${p.alergenos.length-2}`:''}
                    </span>
                  )}
                  <StockBadge p={p}/>
                </div>
              </div>

              {/* ── Acciones */}
              <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0,alignItems:'flex-end'}}>
                {/* Reponer (si agotado) */}
                {p.stock_raciones!==null && p.stock_agotado && (
                  <button onClick={()=>setReponiendo(p)}
                    style={{color:C.green,border:`1px solid #3F7D4444`,background:C.greenS,
                      padding:'4px 9px',borderRadius:5,fontSize:11,cursor:'pointer',
                      fontWeight:600,fontFamily:SN,whiteSpace:'nowrap'}}>
                    ↺ Reponer
                  </button>
                )}
                {/* −1 ración (si tiene stock activo y no agotado) */}
                {p.stock_raciones!==null && !p.stock_agotado && (
                  <button onClick={()=>decrementarManual(p)} disabled={decrement===p.id}
                    title="Marcar 1 ración vendida manualmente"
                    style={{color:C.ink3,border:`1px solid ${C.rule}`,background:C.paper2,
                      padding:'4px 9px',borderRadius:5,fontSize:11,cursor:'pointer',
                      fontFamily:SN,whiteSpace:'nowrap',opacity:decrement===p.id?0.5:1}}>
                    {decrement===p.id?'…':'−1 ración'}
                  </button>
                )}
                {/* Quitar */}
                <button onClick={()=>eliminar(p.id)} disabled={eliminando===p.id}
                  style={{color:C.ink4,border:`1px solid ${C.rule}`,background:C.paper2,
                    padding:'4px 9px',borderRadius:5,fontSize:11,cursor:'pointer',
                    fontFamily:SN,opacity:eliminando===p.id?0.4:1}}>
                  {eliminando===p.id?'…':'Quitar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {modalNuevo && (
        <ModalNuevo restauranteId={restauranteId} secciones={secciones}
          onCreado={cargar} onCerrar={()=>setModalNuevo(false)}/>
      )}
      {reponiendo && (
        <ModalReponer producto={reponiendo} restauranteId={restauranteId}
          onRepuesto={cargar} onCerrar={()=>setReponiendo(null)}/>
      )}
    </>
  )
}
