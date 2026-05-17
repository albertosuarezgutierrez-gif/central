'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface FueraCartaProducto {
  id: string
  nombre: string
  precio: number
  descripcion: string | null
  categoria: string
  alergenos: string[]
  expira_at: string | null
  expira_label: string
  horas_restantes: number | null
  stock_raciones:   number | null
  stock_restante:   number | null
  stock_agotado:    boolean
  stock_agotado_at: string | null
}

interface SeccionCocina { id: string; nombre: string }

interface NuevoEspecial {
  nombre: string; precio: string; descripcion: string
  categoria: string; alergenos: string[]; seccion_id: string; dias: number
  stock_activo: boolean; stock_raciones: string
}

const ALERGENOS_EU = [
  'Gluten','Crustáceos','Huevo','Pescado','Cacahuetes','Soja','Lácteos',
  'Frutos de cáscara','Apio','Mostaza','Sésamo','Dióxido de azufre','Altramuces','Moluscos'
]
const CATEGORIAS_DEFAULT = [
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
    <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:6,fontSize:11,fontFamily:'monospace',
      background:urgente?'#A8311E22':pronto?'#E8A33B22':'#3F7D4422',
      color:urgente?'#D9442B':pronto?'#E8A33B':'#3F7D44',
      border:`1px solid ${urgente?'#D9442B44':pronto?'#E8A33B44':'#3F7D4444'}`}}>
      {urgente?'⚡':pronto?'⏳':'📅'} {label}
    </span>
  )
}

// ── Badge stock (barra de progreso)
function StockBadge({p}:{p:FueraCartaProducto}) {
  if (p.stock_raciones === null) return null
  const restante = p.stock_restante ?? 0
  const total    = p.stock_raciones
  const pct      = total > 0 ? (restante / total) * 100 : 0
  const critico  = !p.stock_agotado && pct <= 20
  const bajo     = !p.stock_agotado && pct <= 50
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div style={{width:52,height:5,borderRadius:3,background:'#2C2520',overflow:'hidden',flexShrink:0}}>
        <div style={{width:`${pct}%`,height:'100%',borderRadius:3,transition:'width .3s',
          background:p.stock_agotado?'#3A3226':critico?'#D9442B':bajo?'#E8A33B':'#3F7D44'}} />
      </div>
      <span style={{fontFamily:'monospace',fontSize:11,whiteSpace:'nowrap',
        color:p.stock_agotado?'#6B5F52':critico?'#D9442B':bajo?'#E8A33B':'#3F7D44'}}>
        {p.stock_agotado ? 'AGOTADO' : `${restante}/${total}`}
      </span>
    </div>
  )
}

// ── Modal nuevo especial
function ModalNuevoEspecial({restauranteId,secciones,onCreado,onCerrar}:
  {restauranteId:string;secciones:SeccionCocina[];onCreado:()=>void;onCerrar:()=>void}) {
  const [form,setForm] = useState<NuevoEspecial>({
    nombre:'',precio:'',descripcion:'',categoria:'Especiales',alergenos:[],
    seccion_id:'',dias:1,stock_activo:false,stock_raciones:'10'
  })
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')

  const toggleAlergeno = (a:string) =>
    setForm(f=>({...f,alergenos:f.alergenos.includes(a)?f.alergenos.filter(x=>x!==a):[...f.alergenos,a]}))

  const guardar = async () => {
    if (!form.nombre.trim())                             {setError('El nombre es obligatorio');return}
    if (!form.precio||isNaN(parseFloat(form.precio)))   {setError('Precio no válido');return}
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

  const IS:React.CSSProperties={width:'100%',padding:'9px 12px',borderRadius:8,fontSize:13,
    background:'#14110E',border:'1px solid #2C2520',color:'#F6F1E7',outline:'none',boxSizing:'border-box'}

  return (
    <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',
      padding:16,background:'rgba(20,17,14,0.88)',backdropFilter:'blur(4px)'}}>
      <div style={{width:'100%',maxWidth:480,borderRadius:16,overflow:'hidden',background:'#1C1814',
        border:'1px solid #2C2520',maxHeight:'90vh',overflowY:'auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid #2C2520'}}>
          <div>
            <p style={{color:'#F6F1E7',fontFamily:'Newsreader, Georgia, serif',fontWeight:600,fontSize:15,margin:0}}>Nuevo especial fuera de carta</p>
            <p style={{color:'#6B5F52',fontSize:11,margin:'2px 0 0',fontStyle:'italic'}}>Se añade a la carta y desaparece al expirar o agotarse</p>
          </div>
          <button onClick={onCerrar} style={{color:'#6B5F52',background:'none',border:'none',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>

        <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
          {/* Nombre */}
          <div>
            <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Nombre *</label>
            <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}
              placeholder="Ej: Arroz meloso de pato…" style={IS}/>
          </div>

          {/* Precio + Categoría */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Precio (€) *</label>
              <input type="number" step="0.5" min="0" value={form.precio}
                onChange={e=>setForm(f=>({...f,precio:e.target.value}))}
                placeholder="0.00" style={{...IS,fontFamily:'monospace'}}/>
            </div>
            <div>
              <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Categoría</label>
              <select value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={IS}>
                {CATEGORIAS_DEFAULT.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>
              Descripción <span style={{color:'#6B5F52'}}>(opcional)</span>
            </label>
            <textarea value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}
              placeholder="Notas para sala o cocina…" rows={2} style={{...IS,resize:'none'}}/>
          </div>

          {/* Partida */}
          {secciones.length>0 && (
            <div>
              <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Partida de cocina</label>
              <select value={form.seccion_id} onChange={e=>setForm(f=>({...f,seccion_id:e.target.value}))} style={IS}>
                <option value="">Sin asignar</option>
                {secciones.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}

          {/* Tiempo */}
          <div>
            <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:8}}>¿Hasta cuándo está disponible?</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {OPCION_DIAS.map(op=>(
                <button key={op.value} onClick={()=>setForm(f=>({...f,dias:op.value}))}
                  style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',fontWeight:500,
                    background:form.dias===op.value?'#D9442B':'#14110E',
                    color:form.dias===op.value?'#F6F1E7':'#6B5F52',
                    border:`1px solid ${form.dias===op.value?'#D9442B':'#2C2520'}`}}>
                  {op.label}
                </button>
              ))}
            </div>
            <p style={{color:'#6B5F52',fontSize:11,margin:'6px 0 0',fontStyle:'italic'}}>
              Se desactiva automáticamente a las 23:59 del último día
            </p>
          </div>

          {/* ── CONTROL DE RACIONES ── */}
          <div style={{borderRadius:10,border:`1px solid ${form.stock_activo?'#D9442B44':'#2C2520'}`,
            overflow:'hidden',transition:'border-color .2s'}}>
            {/* Toggle */}
            <button onClick={()=>setForm(f=>({...f,stock_activo:!f.stock_activo}))}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'11px 14px',background:form.stock_activo?'#D9442B0A':'transparent',
                border:'none',cursor:'pointer',transition:'background .2s'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:36,height:20,borderRadius:10,position:'relative',
                  background:form.stock_activo?'#D9442B':'#2C2520',transition:'background .2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:form.stock_activo?19:3,width:14,height:14,
                    borderRadius:'50%',background:'#F6F1E7',transition:'left .2s'}}/>
                </div>
                <div style={{textAlign:'left'}}>
                  <div style={{color:'#D8CDB6',fontSize:13,fontWeight:500}}>Limitar por raciones</div>
                  <div style={{color:'#6B5F52',fontSize:11,marginTop:1}}>Desaparece automáticamente al agotarse</div>
                </div>
              </div>
              {form.stock_activo && <span style={{color:'#D9442B',fontSize:11,fontFamily:'monospace',fontWeight:600}}>ACTIVO</span>}
            </button>

            {/* Input raciones */}
            {form.stock_activo && (
              <div style={{padding:'0 14px 14px',borderTop:'1px solid #2C252044'}}>
                <div style={{paddingTop:12}}>
                  <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:8}}>
                    Número de raciones disponibles
                  </label>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <button onClick={()=>setForm(f=>({...f,stock_raciones:String(Math.max(1,parseInt(f.stock_raciones||'1')-1))}))
                    } style={{width:32,height:32,borderRadius:8,background:'#14110E',border:'1px solid #2C2520',
                      color:'#D8CDB6',fontSize:18,cursor:'pointer',flexShrink:0,display:'flex',
                      alignItems:'center',justifyContent:'center'}}>−</button>
                    <input type="number" min="1" max="999" value={form.stock_raciones}
                      onChange={e=>setForm(f=>({...f,stock_raciones:e.target.value}))}
                      style={{...IS,width:80,textAlign:'center',fontFamily:'monospace',fontSize:22,fontWeight:700,padding:'6px 0'}}/>
                    <button onClick={()=>setForm(f=>({...f,stock_raciones:String(Math.min(999,parseInt(f.stock_raciones||'1')+1))}))
                    } style={{width:32,height:32,borderRadius:8,background:'#14110E',border:'1px solid #2C2520',
                      color:'#D8CDB6',fontSize:18,cursor:'pointer',flexShrink:0,display:'flex',
                      alignItems:'center',justifyContent:'center'}}>+</button>
                    <span style={{color:'#6B5F52',fontSize:13}}>raciones</span>
                  </div>
                  <p style={{color:'#6B5F52',fontSize:11,margin:'8px 0 0',fontStyle:'italic'}}>
                    Al vender la última, desaparece del sistema de pedidos automáticamente
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Alérgenos */}
          <div>
            <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:8}}>
              Alérgenos <span style={{color:'#6B5F52'}}>(EU 1169/2011)</span>
            </label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {ALERGENOS_EU.map(a=>(
                <button key={a} onClick={()=>toggleAlergeno(a)}
                  style={{padding:'4px 8px',borderRadius:6,fontSize:11,cursor:'pointer',
                    background:form.alergenos.includes(a)?'#E8A33B22':'#14110E',
                    color:form.alergenos.includes(a)?'#E8A33B':'#6B5F52',
                    border:`1px solid ${form.alergenos.includes(a)?'#E8A33B':'#2C2520'}`}}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {error && <p style={{fontSize:12,padding:'8px 12px',borderRadius:8,
            background:'#D9442B22',color:'#D9442B',border:'1px solid #D9442B44',margin:0}}>{error}</p>}
        </div>

        <div style={{display:'flex',gap:10,padding:'16px 20px',borderTop:'1px solid #2C2520'}}>
          <button onClick={onCerrar} style={{flex:1,padding:10,borderRadius:10,fontSize:13,cursor:'pointer',
            background:'#14110E',color:'#6B5F52',border:'1px solid #2C2520'}}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{flex:1,padding:10,borderRadius:10,fontSize:13,
            fontWeight:600,cursor:'pointer',background:guardando?'#6B5F52':'#D9442B',
            color:'#F6F1E7',border:'none',opacity:guardando?0.6:1}}>
            {guardando?'Añadiendo…':'+ Añadir a carta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal reponer stock
function ModalReponerStock({producto,restauranteId,onRepuesto,onCerrar}:
  {producto:FueraCartaProducto;restauranteId:string;onRepuesto:()=>void;onCerrar:()=>void}) {
  const [cantidad,setCantidad] = useState(String(producto.stock_raciones??10))
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')

  const reponer = async () => {
    const n = parseInt(cantidad)
    if (isNaN(n)||n<1){setError('Número inválido');return}
    setGuardando(true)
    try {
      const session = JSON.parse(document.cookie.match(/ia-session=([^;]+)/)?.[1]??'{}')
      const r = await fetch('/api/owner/fuera-carta/stock',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-ia-session':JSON.stringify(session),'x-restaurante-id':restauranteId},
        body:JSON.stringify({accion:'reponer',producto_id:producto.id,nuevo_stock:n}),
      })
      const d = await r.json()
      if (!r.ok||d.error) throw new Error(d.error||'Error')
      onRepuesto();onCerrar()
    } catch(e:unknown){
      setError(e instanceof Error?e.message:'Error')
      setGuardando(false)
    }
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',
      padding:16,background:'rgba(20,17,14,0.88)',backdropFilter:'blur(4px)'}}>
      <div style={{width:'100%',maxWidth:360,borderRadius:16,background:'#1C1814',border:'1px solid #2C2520',overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #2C2520'}}>
          <p style={{color:'#F6F1E7',fontFamily:'Newsreader, Georgia, serif',fontWeight:600,fontSize:15,margin:0}}>Reponer raciones</p>
          <p style={{color:'#6B5F52',fontSize:12,margin:'3px 0 0'}}>{producto.nombre}</p>
        </div>
        <div style={{padding:20}}>
          <label style={{color:'#D8CDB6',fontSize:12,fontWeight:500,display:'block',marginBottom:10}}>
            Nuevas raciones disponibles
          </label>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <button onClick={()=>setCantidad(s=>String(Math.max(1,parseInt(s||'1')-1)))}
              style={{width:36,height:36,borderRadius:8,background:'#14110E',border:'1px solid #2C2520',
                color:'#D8CDB6',fontSize:20,cursor:'pointer',flexShrink:0,display:'flex',
                alignItems:'center',justifyContent:'center'}}>−</button>
            <input type="number" min="1" max="999" value={cantidad}
              onChange={e=>setCantidad(e.target.value)}
              style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:24,fontWeight:700,textAlign:'center',
                background:'#14110E',border:'1px solid #2C2520',color:'#F6F1E7',outline:'none',fontFamily:'monospace'}}/>
            <button onClick={()=>setCantidad(s=>String(Math.min(999,parseInt(s||'1')+1)))}
              style={{width:36,height:36,borderRadius:8,background:'#14110E',border:'1px solid #2C2520',
                color:'#D8CDB6',fontSize:20,cursor:'pointer',flexShrink:0,display:'flex',
                alignItems:'center',justifyContent:'center'}}>+</button>
          </div>
          {producto.stock_raciones && (
            <button onClick={()=>setCantidad(String(producto.stock_raciones))}
              style={{fontSize:11,color:'#6B5F52',background:'none',border:'none',cursor:'pointer',
                padding:0,textDecoration:'underline'}}>
              Restaurar original ({producto.stock_raciones} raciones)
            </button>
          )}
          {error && <p style={{fontSize:12,color:'#D9442B',marginTop:8}}>{error}</p>}
        </div>
        <div style={{display:'flex',gap:10,padding:'12px 20px',borderTop:'1px solid #2C2520'}}>
          <button onClick={onCerrar} style={{flex:1,padding:10,borderRadius:10,fontSize:13,cursor:'pointer',
            background:'#14110E',color:'#6B5F52',border:'1px solid #2C2520'}}>Cancelar</button>
          <button onClick={reponer} disabled={guardando} style={{flex:1,padding:10,borderRadius:10,fontSize:13,
            fontWeight:600,cursor:'pointer',background:guardando?'#6B5F52':'#3F7D44',color:'#F6F1E7',border:'none'}}>
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
  const [modalAbierto,setModal]    = useState(false)
  const [eliminando,setEliminando] = useState<string|null>(null)
  const [reponiendo,setReponiendo] = useState<FueraCartaProducto|null>(null)
  const [decrement,setDecrement]   = useState<string|null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [{data:prods},{data:secc}] = await Promise.all([
      supabase.from('v_fuera_carta_activos').select('*').eq('restaurante_id',restauranteId),
      supabase.from('secciones_cocina').select('id,nombre').eq('restaurante_id',restauranteId).order('nombre'),
    ])
    setProductos(prods??[])
    setSecciones(secc??[])
    setCargando(false)
  },[restauranteId])

  useEffect(()=>{cargar()},[cargar])

  const eliminar = async (id:string) => {
    setEliminando(id)
    await supabase.from('productos').update({activo:false,es_fuera_carta:false}).eq('id',id).eq('restaurante_id',restauranteId)
    await cargar()
    setEliminando(null)
  }

  const decrementarManual = async (p:FueraCartaProducto) => {
    if (decrement) return
    setDecrement(p.id)
    try {
      const session = JSON.parse(document.cookie.match(/ia-session=([^;]+)/)?.[1]??'{}')
      await fetch('/api/owner/fuera-carta/stock',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-ia-session':JSON.stringify(session),'x-restaurante-id':restauranteId},
        body:JSON.stringify({accion:'decrementar',producto_id:p.id,cantidad:1}),
      })
      await cargar()
    } finally { setDecrement(null) }
  }

  const agotados = productos.filter(p=>p.stock_agotado).length

  return (
    <>
      <div style={{borderRadius:12,overflow:'hidden',marginBottom:24,border:'1px solid #D9442B33',background:'#1C1814'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',
          background:'#D9442B0A',borderBottom:productos.length>0?'1px solid #2C2520':'none'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#D9442B',fontSize:12}}>✦</span>
            <span style={{color:'#F6F1E7',fontFamily:'Newsreader, Georgia, serif',fontWeight:600,fontSize:14}}>Fuera de carta</span>
            {productos.length>0 && (
              <span style={{background:'#D9442B22',color:'#D9442B',fontSize:11,fontFamily:'monospace',padding:'1px 6px',borderRadius:5}}>
                {productos.length}
              </span>
            )}
            {agotados>0 && (
              <span style={{background:'#3A332644',color:'#6B5F52',fontSize:10,fontFamily:'monospace',padding:'1px 6px',borderRadius:5}}>
                {agotados} agotado{agotados>1?'s':''}
              </span>
            )}
          </div>
          <button onClick={()=>setModal(true)} style={{background:'#D9442B',color:'#F6F1E7',border:'none',
            padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
            + Añadir especial
          </button>
        </div>

        {cargando ? (
          <div style={{padding:'18px 14px',textAlign:'center',color:'#6B5F52',fontSize:13}}>Cargando…</div>
        ) : productos.length===0 ? (
          <div style={{padding:'18px 14px',textAlign:'center'}}>
            <p style={{color:'#6B5F52',fontSize:13,margin:0}}>Sin especiales activos hoy</p>
            <p style={{color:'#3A332C',fontSize:12,margin:'4px 0 0',fontStyle:'italic'}}>El chuletón de hoy, el postre especial…</p>
          </div>
        ) : (
          productos.map((p:FueraCartaProducto,i:number)=>(
            <div key={p.id} style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',
              padding:'10px 14px',gap:12,borderTop:i>0?'1px solid #2C2520':'none',
              opacity:p.stock_agotado?0.55:1,
              background:p.stock_agotado?'#14110E88':'transparent',transition:'opacity .2s'}}>

              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{color:p.stock_agotado?'#6B5F52':'#F6F1E7',fontWeight:600,fontSize:14}}>{p.nombre}</span>
                  {p.stock_agotado && (
                    <span style={{background:'#3A3226',color:'#6B5F52',fontFamily:'monospace',fontSize:10,
                      padding:'2px 7px',borderRadius:5,fontWeight:700,letterSpacing:'0.05em'}}>AGOTADO</span>
                  )}
                  <ExpiraBadge label={p.expira_label} horas={p.horas_restantes}/>
                </div>
                {p.descripcion && (
                  <p style={{color:'#6B5F52',fontSize:12,margin:'3px 0 4px',overflow:'hidden',
                    textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.descripcion}</p>
                )}
                <div style={{display:'flex',alignItems:'center',gap:12,marginTop:4,flexWrap:'wrap'}}>
                  <span style={{color:'#E8A33B',fontFamily:'monospace',fontSize:13}}>{Number(p.precio).toFixed(2)} €</span>
                  {p.categoria!=='Especiales' && <span style={{color:'#6B5F52',fontSize:11}}>{p.categoria}</span>}
                  {p.alergenos?.length>0 && (
                    <span style={{color:'#E8A33B',fontSize:11}}>
                      ⚠ {p.alergenos.slice(0,2).join(', ')}{p.alergenos.length>2?` +${p.alergenos.length-2}`:''}
                    </span>
                  )}
                  <StockBadge p={p}/>
                </div>
              </div>

              {/* Acciones */}
              <div style={{display:'flex',flexDirection:'column',gap:5,flexShrink:0,alignItems:'flex-end'}}>
                {p.stock_raciones!==null && p.stock_agotado && (
                  <button onClick={()=>setReponiendo(p)}
                    style={{color:'#3F7D44',border:'1px solid #3F7D4444',background:'#3F7D4411',
                      padding:'4px 8px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
                    ↺ Reponer
                  </button>
                )}
                {p.stock_raciones!==null && !p.stock_agotado && (
                  <button onClick={()=>decrementarManual(p)} disabled={decrement===p.id}
                    title="Marcar 1 ración vendida manualmente"
                    style={{color:'#6B5F52',border:'1px solid #2C2520',background:'#14110E',
                      padding:'4px 8px',borderRadius:6,fontSize:11,cursor:'pointer',
                      opacity:decrement===p.id?0.5:1,whiteSpace:'nowrap'}}>
                    {decrement===p.id?'…':'−1 ración'}
                  </button>
                )}
                <button onClick={()=>eliminar(p.id)} disabled={eliminando===p.id}
                  style={{color:'#6B5F52',border:'1px solid #2C2520',background:'#14110E',
                    padding:'4px 8px',borderRadius:6,fontSize:11,cursor:'pointer',
                    opacity:eliminando===p.id?0.4:1}}>
                  {eliminando===p.id?'…':'Quitar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {modalAbierto && (
        <ModalNuevoEspecial restauranteId={restauranteId} secciones={secciones}
          onCreado={cargar} onCerrar={()=>setModal(false)}/>
      )}
      {reponiendo && (
        <ModalReponerStock producto={reponiendo} restauranteId={restauranteId}
          onRepuesto={cargar} onCerrar={()=>setReponiendo(null)}/>
      )}
    </>
  )
}
