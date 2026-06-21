'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e1b4b', muted: '#64748b', border: '#e2e8f0', white: '#ffffff',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

const PROPS = [
  { id: 'prop_house_sevillana', name: 'House Sevillana', color: '#16a34a', short: 'HS' },
  { id: 'prop_duplex_center',   name: 'Dúplex Center',   color: '#2563eb', short: 'DC' },
  { id: 'prop_luxury_busto',    name: 'Luxury Busto',    color: '#9333ea', short: 'LB' },
  { id: 'prop_busto_reform',    name: 'Busto Reform',    color: '#ea580c', short: 'BR' },
]
const CAT_PROVEEDOR =['general','limpieza','lenceria','lavanderia','mantenimiento','quimicos']
const CAT_PRODUCTO  = ['limpieza','lenceria','amenities','consumible','herramienta']
const CAT_STOCK     = ['limpieza','lenceria','consumible','amenities','herramienta']
const UNIDADES      = ['unidad','kg','litro','rollo','pack','caja','par','ml','gr']
const TIPO_EMOJI: Record<string,string> = { factura:'🧾', albaran:'📦', ticket:'🏷️', curriculum:'👤', otro:'📄', pendiente:'⏳', error:'❌' }
const CONFIANZA_COLOR: Record<string,string> = { alta:'#16a34a', media:'#d97706', baja:'#dc2626' }

function pBy(id: string) { return PROPS.find(p => p.id === id) }
function Spinner() { return <div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>Cargando...</div> }
function StatCard({ value, label, color='#4f46e5' }: { value:any; label:string; color?:string }) {
  return (
    <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:'12px 16px',flex:1,minWidth:90}}>
      <div style={{fontWeight:800,fontSize:22,color}}>{value}</div>
      <div style={{fontSize:11,color:C.muted}}>{label}</div>
    </div>
  )
}
function Badge({ label, color, bg }: { label:string; color:string; bg:string }) {
  return <span style={{fontSize:10,fontWeight:700,color,background:bg,borderRadius:6,padding:'2px 7px'}}>{label}</span>
}
function Btn({ onClick, children, variant='primary', small=false, danger=false, disabled=false }:
  { onClick:()=>void; children:any; variant?:'primary'|'secondary'|'ghost'; small?:boolean; danger?:boolean; disabled?:boolean }) {
  const bg = danger ? C.red : variant==='primary' ? C.primary : variant==='secondary' ? C.white : 'transparent'
  const col = danger||variant==='primary' ? C.white : variant==='secondary' ? C.primary : C.muted
  const bord = variant==='secondary' ? `1px solid ${C.primary}` : variant==='ghost' ? 'none' : 'none'
  return (
    <button onClick={onClick} disabled={disabled}
      style={{background:bg,color:col,border:bord,borderRadius:9,padding:small?'5px 12px':'9px 18px',
        fontSize:small?11:13,fontWeight:700,cursor:disabled?'not-allowed':'pointer',
        fontFamily:'inherit',opacity:disabled?.5:1,transition:'opacity .15s'}}>
      {children}
    </button>
  )
}

const TABS = [
  { id:'stock',       label:'📦 Stock'      },
  { id:'lenceria',    label:'🛏️ Lencería'   },
  { id:'proveedores', label:'🏪 Proveedores' },
  { id:'checklists',  label:'✅ Checklists'  },
  { id:'documentos',  label:'📄 Documentos' },
]

export default function MaterialesPage() {
  const [tab, setTab] = useState('stock')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TABS.some(x => x.id === t)) setTab(t)
  }, [])
  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Nunito',sans-serif"}}>
      <header style={{background:C.primary,padding:'0 24px'}}>
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'18px 0 0'}}>
          <a href="/dashboard" style={{color:'rgba(255,255,255,0.7)',fontSize:13,textDecoration:'none'}}>← Dashboard</a>
          <h1 style={{color:C.white,fontWeight:800,fontSize:20}}>Materiales</h1>
        </div>
        <div style={{display:'flex',gap:0,overflowX:'auto',marginTop:12}}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:'10px 16px',border:'none',cursor:'pointer',fontFamily:'inherit',
                background:'transparent',whiteSpace:'nowrap',fontSize:13,
                color:tab===t.id?C.white:'rgba(255,255,255,0.55)',
                fontWeight:tab===t.id?700:400,
                borderBottom:`2.5px solid ${tab===t.id?C.white:'transparent'}`}}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div style={{padding:'20px 24px',maxWidth:960,margin:'0 auto'}}>
        {tab==='stock'       && <TabStock />}
        {tab==='lenceria'    && <TabLenceria />}
        {tab==='proveedores' && <TabProveedores />}
        {tab==='checklists'  && <TabChecklists />}
        {tab==='documentos'  && <TabDocumentos />}
      </div>
    </div>
  )
}

// ─── TAB STOCK ────────────────────────────────────────────────────
function TabStock() {
  const [items, setItems]     = useState<any[]>([])
  const [provs, setProvs]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [catFil, setCatFil]   = useState('all')
  const [modal, setModal]     = useState<any>(null)   // null | {} nuevo | {id,...} editar
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState<any>({nombre:'',categoria:'limpieza',unidad:'unidad',stock_actual:'',stock_minimo:'',precio_unitario:'',proveedor_id:''})

  const load = useCallback(async () => {
    setLoading(true)
    const [r, rp] = await Promise.all([fetch('/api/admin/stock'), fetch('/api/admin/proveedores')])
    const d = await r.json(); const dp = await rp.json()
    setItems(d.productos || [])
    setProvs(dp.proveedores || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => {
    setForm({nombre:'',categoria:'limpieza',unidad:'unidad',stock_actual:'',stock_minimo:'',precio_unitario:'',proveedor_id:''})
    setModal({})
  }
  const openEdit = (item: any) => {
    setForm({...item, stock_actual: item.stock_actual??'', stock_minimo: item.stock_minimo??'', precio_unitario: item.precio_unitario??''})
    setModal(item)
  }

  const save = async () => {
    if (!form.nombre?.trim()) return
    setSaving(true)
    const isEdit = !!modal?.id
    await fetch('/api/admin/stock', {
      method: isEdit ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        ...(isEdit ? {id: modal.id} : {}),
        nombre: form.nombre, categoria: form.categoria,
        unidad: form.unidad, stock_actual: Number(form.stock_actual||0),
        stock_minimo: Number(form.stock_minimo||0),
        precio_unitario: form.precio_unitario ? Number(form.precio_unitario) : null,
        proveedor_id: form.proveedor_id || null,
      })
    })
    setSaving(false); setModal(null); load()
  }

  const del = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar "${nombre}" del stock?`)) return
    await fetch('/api/admin/stock', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    load()
  }

  const cats = ['all', ...Array.from(new Set(items.map(i=>i.categoria)))]
  const filtered = items.filter(i => {
    const matchCat  = catFil==='all' || i.categoria===catFil
    const matchSrch = !search || i.nombre.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSrch
  })
  const alertas = filtered.filter(i => i.alerta_stock || i.stock_actual <= i.stock_minimo)

  if (loading) return <Spinner />
  return (
    <div>
      {/* KPIs */}
      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <StatCard value={items.length} label="Artículos" />
        <StatCard value={alertas.length} label="⚠️ Stock bajo" color={alertas.length>0?C.red:C.ok} />
        <StatCard value={items.filter(i=>i.precio_unitario).length} label="Con precio" color={C.brand} />
      </div>

      {/* Alertas */}
      {alertas.length>0 && (
        <div style={{background:C.redBg,border:'1px solid #fecaca',borderRadius:12,padding:12,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,color:C.red,marginBottom:6}}>⚠️ Stock bajo</div>
          {alertas.map(i => (
            <div key={i.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'1px solid #fecaca'}}>
              <span>{i.nombre} · <span style={{color:C.muted}}>{i.categoria}</span></span>
              <span style={{color:C.red,fontWeight:700}}>{i.stock_actual} / mín {i.stock_minimo} {i.unidad}</span>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar artículo…"
          style={{flex:1,minWidth:140,border:`1px solid ${C.border}`,borderRadius:9,padding:'8px 12px',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
        <select value={catFil} onChange={e=>setCatFil(e.target.value)}
          style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'8px 10px',fontSize:12,fontFamily:'inherit',background:C.white}}>
          {cats.map(c=><option key={c} value={c}>{c==='all'?'Todas categorías':c}</option>)}
        </select>
        <Btn onClick={openNew}>+ Añadir</Btn>
      </div>

      {/* Lista */}
      {filtered.length===0 && <div style={{textAlign:'center',padding:'32px 16px',color:C.muted,fontSize:13}}>Sin artículos{search?' con ese nombre':''}</div>}
      {filtered.map(item => {
        const bajo = item.alerta_stock || item.stock_actual <= item.stock_minimo
        const pct  = Math.min(100, Math.round(item.stock_actual / Math.max(1, item.stock_minimo) * 100))
        return (
          <div key={item.id} style={{background:bajo?'#fff7ed':C.white,border:`1px solid ${bajo?'#fed7aa':C.border}`,borderRadius:11,padding:'11px 14px',marginBottom:7}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:C.text}}>{item.nombre}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {item.categoria} · {item.unidad}
                  {item.precio_unitario ? ` · ${Number(item.precio_unitario).toFixed(2)} €` : ''}
                </div>
                <div style={{fontSize:11,color:item.proveedor_nombre?C.brand:C.muted,marginTop:2}}>
                  🏪 {item.proveedor_nombre || 'Sin proveedor'}
                  {item.proveedor_tel ? ` · ${item.proveedor_tel}` : ''}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontWeight:800,fontSize:16,color:bajo?C.red:C.text}}>{item.stock_actual}</div>
                <div style={{fontSize:10,color:C.muted}}>mín {item.stock_minimo}</div>
              </div>
              <div style={{display:'flex',gap:5,alignItems:'center',flexShrink:0}}>
                <button onClick={()=>openEdit(item)}
                  style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'4px 8px',fontSize:12,cursor:'pointer'}}>✏️</button>
                <button onClick={()=>del(item.id, item.nombre)}
                  style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
              </div>
            </div>
            <div style={{background:'#f1f5f9',borderRadius:4,height:4,marginTop:8}}>
              <div style={{width:`${pct}%`,height:4,borderRadius:4,background:bajo?C.red:C.ok,transition:'width .3s'}}/>
            </div>
          </div>
        )
      })}

      {/* Modal Añadir/Editar */}
      {modal!==null && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
          <div style={{background:C.white,borderRadius:16,width:'100%',maxWidth:420,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,.15)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <div style={{fontWeight:800,fontSize:17,color:C.text}}>{modal?.id ? 'Editar artículo' : 'Nuevo artículo'}</div>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',fontSize:22,color:C.muted,cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <input placeholder="Nombre *" value={form.nombre||''} onChange={e=>setForm((p:any)=>({...p,nombre:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'10px 12px',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8}}>
                <select value={form.categoria||'limpieza'} onChange={e=>setForm((p:any)=>({...p,categoria:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:13,background:C.white,fontFamily:'inherit'}}>
                  {CAT_STOCK.map(c=><option key={c}>{c}</option>)}
                </select>
                <select value={form.unidad||'unidad'} onChange={e=>setForm((p:any)=>({...p,unidad:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:13,background:C.white,fontFamily:'inherit'}}>
                  {UNIDADES.map(u=><option key={u}>{u}</option>)}
                </select>
                <input type="number" placeholder="Stock actual" value={form.stock_actual||''} onChange={e=>setForm((p:any)=>({...p,stock_actual:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
                <input type="number" placeholder="Stock mínimo" value={form.stock_minimo||''} onChange={e=>setForm((p:any)=>({...p,stock_minimo:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
                <input type="number" placeholder="Precio/ud €" value={form.precio_unitario||''} onChange={e=>setForm((p:any)=>({...p,precio_unitario:e.target.value}))} step="0.01"
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:13,fontFamily:'inherit',outline:'none',gridColumn:'1/-1'}}/>
                <select value={form.proveedor_id||''} onChange={e=>setForm((p:any)=>({...p,proveedor_id:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:13,background:C.white,fontFamily:'inherit',gridColumn:'1/-1'}}>
                  <option value="">🏪 Sin proveedor</option>
                  {provs.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <Btn onClick={()=>setModal(null)} variant="secondary">Cancelar</Btn>
              <Btn onClick={save} disabled={saving||!form.nombre?.trim()}>{saving?'Guardando…':modal?.id?'Actualizar':'Añadir'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB LENCERÍA ─────────────────────────────────────────────────
const ESTADOS_LEN: Record<string,{label:string;color:string;bg:string}> = {
  limpio:        { label:'Limpio',        color:'#16a34a', bg:'#f0fdf4' },
  en_uso:        { label:'En uso',        color:'#6366f1', bg:'#eef2ff' },
  sucio:         { label:'Sucio',         color:'#d97706', bg:'#fffbeb' },
  en_lavanderia: { label:'En lavandería', color:'#7c3aed', bg:'#faf5ff' },
  baja:          { label:'Baja',          color:'#64748b', bg:'#f1f5f9' },
}

function TabLenceria() {
  const [items, setItems]     = useState<any[]>([])
  const [props, setProps]     = useState<any[]>([])
  const [provs, setProvs]     = useState<any[]>([])
  const [tipos, setTipos]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selProp, setSelProp] = useState('all')
  const [modal, setModal]     = useState<any>(null)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState<any>({propiedad_id:'',tipo:'',cantidad:'',estado:'limpio',proveedor_id:'',notas:''})

  const load = useCallback(async () => {
    setLoading(true)
    const [rI,rP,rV,rC] = await Promise.all([
      fetch('/api/admin/lenceria'),
      fetch('/api/admin/propiedades'),
      fetch('/api/admin/proveedores'),
      fetch('/api/admin/catalogos'),
    ])
    const dI=await rI.json(), dP=await rP.json(), dV=await rV.json(), dC=await rC.json()
    setItems(dI.items||[])
    setProps(dP.propiedades||[])
    setProvs(dV.proveedores||[])
    setTipos(dC.catalogos?.tipos_lenceria?.filter((t:any)=>t.activo!==false)||[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const tipoLabel = (id:string) => tipos.find((t:any)=>t.id===id)?.label || (id||'').replace(/_/g,' ')
  const tipoEmoji = (id:string) => tipos.find((t:any)=>t.id===id)?.emoji || '🛏️'

  const openNew = () => {
    setForm({propiedad_id:'',tipo:tipos[0]?.id||'',cantidad:'',estado:'limpio',proveedor_id:'',notas:''})
    setModal({})
  }
  const openEdit = (item:any) => {
    setForm({propiedad_id:item.propiedad_id||'',tipo:item.tipo,cantidad:item.cantidad??'',estado:item.estado||'limpio',proveedor_id:item.proveedor_id||'',notas:item.notas||''})
    setModal(item)
  }

  const save = async () => {
    if(!form.tipo || !form.cantidad) return
    setSaving(true)
    await fetch('/api/admin/lenceria', {
      method: modal?.id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        ...(modal?.id?{id:modal.id}:{}),
        tipo:form.tipo, cantidad:Number(form.cantidad||0),
        propiedad_id:form.propiedad_id||null, proveedor_id:form.proveedor_id||null,
        estado:form.estado||'limpio', notas:form.notas||null,
      })
    })
    setSaving(false); setModal(null); load()
  }

  const del = async (item:any) => {
    if (!confirm(`¿Eliminar ${tipoLabel(item.tipo)}?`)) return
    await fetch('/api/admin/lenceria', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})})
    load()
  }

  const cambiarEstado = async (item:any, estado:string) => {
    await fetch('/api/admin/lenceria/'+item.id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({estado})})
    load()
  }

  if (loading) return <Spinner />

  const filtered = selProp==='all' ? items
    : selProp==='none' ? items.filter(i=>!i.propiedad_id)
    : items.filter(i=>i.propiedad_id===selProp)
  const totalPiezas  = filtered.reduce((a,i)=>a+(i.cantidad||0),0)
  const enLavanderia = filtered.filter(i=>i.estado==='en_lavanderia').reduce((a,i)=>a+(i.cantidad||0),0)
  const sucias       = filtered.filter(i=>i.estado==='sucio').reduce((a,i)=>a+(i.cantidad||0),0)
  const conProv      = filtered.filter(i=>i.proveedor_id).length

  const groups = filtered.reduce((acc:any,i:any)=>{
    const k = i.propiedad_nombre || 'General / sin asignar'
    if(!acc[k])acc[k]=[]; acc[k].push(i); return acc
  },{})

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <StatCard value={totalPiezas} label="Total piezas" />
        <StatCard value={enLavanderia} label="En lavandería" color="#7c3aed" />
        <StatCard value={sucias} label="Sucias" color={C.warn} />
        <StatCard value={conProv} label="Con proveedor" color={C.brand} />
      </div>

      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <select value={selProp} onChange={e=>setSelProp(e.target.value)}
          style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'8px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
          <option value="all">Todas las propiedades</option>
          <option value="none">General / sin asignar</option>
          {props.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div style={{marginLeft:'auto'}}>
          <Btn onClick={openNew}>+ Añadir</Btn>
        </div>
      </div>

      {filtered.length===0 && <div style={{textAlign:'center',padding:'32px 16px',color:C.muted,fontSize:13}}>Sin lencería registrada</div>}

      {Object.entries(groups).map(([propName,its]:any)=>(
        <div key={propName} style={{marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:C.text}}>{propName}</div>
          {its.map((item:any)=>{
            const est = ESTADOS_LEN[item.estado] || ESTADOS_LEN.limpio
            return (
              <div key={item.id} style={{background:C.white,border:`1px solid ${C.border}`,borderLeft:`4px solid ${est.color}`,borderRadius:10,padding:'10px 14px',marginBottom:6}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div>
                      <span style={{fontSize:16,marginRight:6}}>{tipoEmoji(item.tipo)}</span>
                      <span style={{fontWeight:600,fontSize:13}}>{tipoLabel(item.tipo)}</span>
                      <span style={{marginLeft:8,fontSize:11,fontWeight:700,color:est.color,background:est.bg,borderRadius:6,padding:'2px 7px'}}>{est.label}</span>
                    </div>
                    <div style={{fontSize:11,color:item.proveedor_nombre?C.brand:C.muted,marginTop:3}}>
                      🏪 {item.proveedor_nombre || 'Sin proveedor'}{item.proveedor_tel?` · ${item.proveedor_tel}`:''}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                    <div style={{fontWeight:800,fontSize:18,color:est.color}}>{item.cantidad}</div>
                    <select value={item.estado} onChange={e=>cambiarEstado(item,e.target.value)}
                      style={{border:`1px solid ${C.border}`,borderRadius:7,padding:'3px 6px',fontSize:11,background:C.white,fontFamily:'inherit'}}>
                      {Object.entries(ESTADOS_LEN).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={()=>openEdit(item)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'3px 8px',fontSize:11,cursor:'pointer'}}>✏️</button>
                    <button onClick={()=>del(item)} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:16,padding:'0 2px'}}>×</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {modal!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
          <div style={{background:C.white,borderRadius:16,width:'100%',maxWidth:420,padding:24,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <div style={{fontWeight:800,fontSize:17,color:C.text}}>{modal?.id?'Editar lencería':'Nueva lencería'}</div>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',fontSize:22,color:C.muted,cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
              <select value={form.tipo} onChange={e=>setForm((p:any)=>({...p,tipo:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                {tipos.length===0 && <option value="">— sin tipos —</option>}
                {tipos.map((t:any)=><option key={t.id} value={t.id}>{t.emoji?`${t.emoji} `:''}{t.label}</option>)}
              </select>
              <input type="number" placeholder="Cantidad *" value={form.cantidad||''} onChange={e=>setForm((p:any)=>({...p,cantidad:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,fontFamily:'inherit',outline:'none'}}/>
              <select value={form.propiedad_id||''} onChange={e=>setForm((p:any)=>({...p,propiedad_id:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                <option value="">— General / sin asignar —</option>
                {props.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select value={form.estado||'limpio'} onChange={e=>setForm((p:any)=>({...p,estado:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                {Object.entries(ESTADOS_LEN).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={form.proveedor_id||''} onChange={e=>setForm((p:any)=>({...p,proveedor_id:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit',gridColumn:'1/-1'}}>
                <option value="">🏪 Sin proveedor</option>
                {provs.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <input placeholder="Notas" value={form.notas||''} onChange={e=>setForm((p:any)=>({...p,notas:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,fontFamily:'inherit',outline:'none',gridColumn:'1/-1'}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <Btn onClick={()=>setModal(null)} variant="secondary">Cancelar</Btn>
              <Btn onClick={save} disabled={saving||!form.tipo||!form.cantidad}>{saving?'Guardando…':modal?.id?'Actualizar':'Añadir'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB PROVEEDORES ─────────────────────────────────────────────
function TabProveedores() {
  const [proveedores, setProveedores] = useState<any[]>([])
  const [productos, setProductos]     = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState<'proveedores'|'productos'>('proveedores')
  const [modal, setModal]             = useState<any>(null)
  const [modalProd, setModalProd]     = useState<any>(null)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState<any>({nombre:'',empresa:'',telefono:'',email:'',whatsapp:'',categoria:'general',notas:''})
  const [formProd, setFormProd]       = useState<any>({proveedor_id:'',nombre:'',referencia:'',categoria:'limpieza',unidad:'unidad',precio_unitario:'',notas:''})

  const load = useCallback(async () => {
    setLoading(true)
    const [r1,r2] = await Promise.all([fetch('/api/admin/proveedores'),fetch('/api/admin/productos')])
    const d1=await r1.json(); const d2=await r2.json()
    setProveedores(d1.proveedores||[]); setProductos(d2.productos||[])
    setLoading(false)
  },[])
  useEffect(()=>{load()},[load])

  const openNewProv = () => { setForm({nombre:'',empresa:'',telefono:'',email:'',whatsapp:'',categoria:'general',notas:''}); setModal({}) }
  const openEditProv = (p:any) => { setForm({...p}); setModal(p) }
  const saveProv = async () => {
    if(!form.nombre) return
    setSaving(true)
    await fetch('/api/admin/proveedores',{method:modal?.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    setSaving(false); setModal(null); load()
  }
  const delProv = async (id:string,nombre:string) => {
    if(!confirm(`¿Eliminar proveedor "${nombre}"?`)) return
    await fetch('/api/admin/proveedores',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    load()
  }

  const openNewProd = () => { setFormProd({proveedor_id:'',nombre:'',referencia:'',categoria:'limpieza',unidad:'unidad',precio_unitario:'',notas:''}); setModalProd({}) }
  const openEditProd = (p:any) => { setFormProd({...p,precio_unitario:p.precio_unitario??''}); setModalProd(p) }
  const saveProd = async () => {
    if(!formProd.nombre) return
    setSaving(true)
    await fetch('/api/admin/productos',{method:modalProd?.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formProd)})
    setSaving(false); setModalProd(null); load()
  }
  const delProd = async (id:string,nombre:string) => {
    if(!confirm(`¿Eliminar producto "${nombre}"?`)) return
    await fetch('/api/admin/productos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    load()
  }

  if(loading) return <Spinner/>
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {(['proveedores','productos'] as const).map(v=>(
          <button key={v} onClick={()=>setView(v)}
            style={{padding:'7px 18px',borderRadius:9,border:`1px solid ${C.border}`,fontWeight:600,fontSize:13,cursor:'pointer',
              background:view===v?C.primary:'#fff',color:view===v?'#fff':C.text,fontFamily:'inherit'}}>
            {v==='proveedores'?`🏢 Proveedores (${proveedores.length})`:`📦 Catálogo (${productos.length})`}
          </button>
        ))}
      </div>

      {view==='proveedores'&&(
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <Btn onClick={openNewProv}>+ Nuevo proveedor</Btn>
          </div>
          {proveedores.length===0&&<div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>Sin proveedores</div>}
          {proveedores.map(p=>(
            <div key={p.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{p.nombre}</div>
                  {p.empresa&&<div style={{fontSize:12,color:C.muted}}>{p.empresa}</div>}
                  <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
                    <Badge label={p.categoria} color={C.primary} bg={C.light}/>
                    {p.num_productos>0&&<Badge label={`${p.num_productos} productos`} color="#2563eb" bg="#eff6ff"/>}
                    {p.num_pedidos>0&&<Badge label={`${p.num_pedidos} pedidos`} color={C.warn} bg={C.warnBg}/>}
                  </div>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'flex-start',flexShrink:0}}>
                  {p.telefono&&<a href={`tel:${p.telefono}`} style={{fontSize:18,textDecoration:'none'}}>📞</a>}
                  {p.whatsapp&&<a href={`https://wa.me/${p.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{fontSize:18,textDecoration:'none'}}>💬</a>}
                  {p.email&&<a href={`mailto:${p.email}`} style={{fontSize:18,textDecoration:'none'}}>✉️</a>}
                  <button onClick={()=>openEditProv(p)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'4px 8px',fontSize:12,cursor:'pointer'}}>✏️</button>
                  <button onClick={()=>delProv(p.id,p.nombre)} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view==='productos'&&(
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <Btn onClick={openNewProd}>+ Nuevo producto</Btn>
          </div>
          {productos.length===0&&<div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>Sin productos en catálogo</div>}
          {Object.entries(productos.reduce((acc:any,p:any)=>{
            if(!acc[p.categoria])acc[p.categoria]=[]; acc[p.categoria].push(p); return acc
          },{})).map(([cat,prods]:any)=>(
            <div key={cat} style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{cat}</div>
              {prods.map((p:any)=>(
                <div key={p.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{p.nombre}</div>
                    <div style={{fontSize:11,color:C.muted}}>{p.proveedor_nombre||'Sin proveedor'} · {p.unidad}{p.referencia?` · Ref: ${p.referencia}`:''}</div>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                    {p.precio_unitario&&<div style={{fontWeight:700,fontSize:14,color:C.text}}>{Number(p.precio_unitario).toFixed(2)} €</div>}
                    <button onClick={()=>openEditProd(p)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'4px 8px',fontSize:12,cursor:'pointer'}}>✏️</button>
                    <button onClick={()=>delProd(p.id,p.nombre)} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Modal Proveedor */}
      {modal!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
          <div style={{background:C.white,borderRadius:16,width:'100%',maxWidth:420,padding:24,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <div style={{fontWeight:800,fontSize:17,color:C.text}}>{modal?.id?'Editar proveedor':'Nuevo proveedor'}</div>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',fontSize:22,color:C.muted,cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:10}}>
              {([['nombre','Nombre *'],['empresa','Empresa'],['telefono','Teléfono'],['email','Email'],['whatsapp','WhatsApp']] as [string,string][]).map(([k,l])=>(
                <input key={k} placeholder={l} value={form[k]||''} onChange={e=>setForm((p:any)=>({...p,[k]:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,fontFamily:'inherit',outline:'none'}}/>
              ))}
              <select value={form.categoria||'general'} onChange={e=>setForm((p:any)=>({...p,categoria:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                {CAT_PROVEEDOR.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <textarea placeholder="Notas" value={form.notas||''} onChange={e=>setForm((p:any)=>({...p,notas:e.target.value}))} rows={2}
              style={{width:'100%',border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,resize:'none',marginBottom:10,boxSizing:'border-box',fontFamily:'inherit',outline:'none'}}/>
            <div style={{display:'flex',gap:8}}>
              <Btn onClick={()=>setModal(null)} variant="secondary">Cancelar</Btn>
              <Btn onClick={saveProv} disabled={saving||!form.nombre}>{saving?'Guardando…':modal?.id?'Actualizar':'Añadir'}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modal Producto */}
      {modalProd!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
          <div style={{background:C.white,borderRadius:16,width:'100%',maxWidth:420,padding:24,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <div style={{fontWeight:800,fontSize:17,color:C.text}}>{modalProd?.id?'Editar producto':'Nuevo producto'}</div>
              <button onClick={()=>setModalProd(null)} style={{background:'none',border:'none',fontSize:22,color:C.muted,cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:10}}>
              <select value={formProd.proveedor_id||''} onChange={e=>setFormProd((p:any)=>({...p,proveedor_id:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                <option value="">Sin proveedor</option>
                {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select value={formProd.categoria||'limpieza'} onChange={e=>setFormProd((p:any)=>({...p,categoria:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                {CAT_PRODUCTO.map(c=><option key={c}>{c}</option>)}
              </select>
              {([['nombre','Nombre *'],['referencia','Referencia']] as [string,string][]).map(([k,l])=>(
                <input key={k} placeholder={l} value={formProd[k]||''} onChange={e=>setFormProd((p:any)=>({...p,[k]:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,fontFamily:'inherit',outline:'none'}}/>
              ))}
              <select value={formProd.unidad||'unidad'} onChange={e=>setFormProd((p:any)=>({...p,unidad:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,background:C.white,fontFamily:'inherit'}}>
                {UNIDADES.map(u=><option key={u}>{u}</option>)}
              </select>
              <input type="number" placeholder="Precio unitario €" value={formProd.precio_unitario||''} onChange={e=>setFormProd((p:any)=>({...p,precio_unitario:e.target.value}))} step="0.01"
                style={{border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,fontFamily:'inherit',outline:'none'}}/>
            </div>
            <textarea placeholder="Notas" value={formProd.notas||''} onChange={e=>setFormProd((p:any)=>({...p,notas:e.target.value}))} rows={2}
              style={{width:'100%',border:`1px solid ${C.border}`,borderRadius:9,padding:'9px 10px',fontSize:12,resize:'none',marginBottom:10,boxSizing:'border-box',fontFamily:'inherit',outline:'none'}}/>
            <div style={{display:'flex',gap:8}}>
              <Btn onClick={()=>setModalProd(null)} variant="secondary">Cancelar</Btn>
              <Btn onClick={saveProd} disabled={saving||!formProd.nombre}>{saving?'Guardando…':modalProd?.id?'Actualizar':'Añadir'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB CHECKLISTS ──────────────────────────────────────────────
function TabChecklists() {
  const [selProp, setSelProp] = useState(PROPS[0].id)
  const [items, setItems]     = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId]   = useState<string|null>(null)
  const [editData, setEditData] = useState<any>({})
  const [newItem, setNewItem] = useState({description:'',frequency:'per_change',requires_photo:false,es_critico:false})
  const [saving, setSaving]   = useState(false)
  const uploadRefs = useRef<Record<string,HTMLInputElement|null>>({})

  const FREQ_OPTS = [{value:'per_change',label:'Cada cambio'},{value:'weekly',label:'Semanal'},{value:'monthly',label:'Mensual'},{value:'one_time',label:'Puntual'}]

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/checklist?property_id=${selProp}`)
    const d = await r.json()
    setItems(d.items||[]); setTemplates(d.templates||[])
    setLoading(false)
  },[selProp])
  useEffect(()=>{load()},[load])

  const template = templates[0]
  const prop = pBy(selProp)

  const addItem = async () => {
    if(!newItem.description.trim()||!template) return
    setSaving(true)
    await fetch('/api/admin/checklist',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...newItem,template_id:template.id,property_id:selProp})})
    setNewItem({description:'',frequency:'per_change',requires_photo:false,es_critico:false})
    setSaving(false); load()
  }

  const saveEdit = async () => {
    if(!editId) return
    setSaving(true)
    await fetch('/api/admin/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editId,...editData})})
    setEditId(null); setSaving(false); load()
  }

  const deleteItem = async (id:string) => {
    if(!confirm('¿Eliminar este ítem?')) return
    await fetch('/api/admin/checklist',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    load()
  }

  const move = async (item:any,dir:'up'|'down') => {
    const idx=items.findIndex(i=>i.id===item.id)
    const other=dir==='up'?items[idx-1]:items[idx+1]
    if(!other) return
    await fetch('/api/admin/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_action:'reorder',id:item.id,new_sort:other.sort_order||idx*10,swap_id:other.id,old_sort:item.sort_order||(idx+1)*10})})
    load()
  }

  const uploadRef = async (itemId:string,file:File) => {
    const form=new FormData()
    form.append('file',file); form.append('session_id','reference')
    form.append('item_id',itemId); form.append('slot','ref')
    const r=await fetch('/api/l/upload-photo',{method:'POST',body:form})
    const d=await r.json()
    if(d.url){
      await fetch('/api/admin/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:itemId,...items.find(i=>i.id===itemId),foto_referencia_url:d.url})})
      load()
    }
  }

  if(loading) return <Spinner/>
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {PROPS.map(p=>(
          <button key={p.id} onClick={()=>setSelProp(p.id)}
            style={{padding:'7px 16px',borderRadius:10,border:`2px solid ${p.color}`,
              background:selProp===p.id?p.color:'#fff',color:selProp===p.id?'#fff':p.color,
              fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
            {p.short}
          </button>
        ))}
      </div>
      <div style={{marginBottom:20}}>
        {items.length===0&&<div style={{color:C.muted,textAlign:'center',padding:24,fontSize:13}}>Sin ítems configurados</div>}
        {items.map((item,idx)=>(
          <div key={item.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px',marginBottom:8}}>
            {editId===item.id?(
              <div>
                <input value={editData.description||''} onChange={e=>setEditData((p:any)=>({...p,description:e.target.value}))}
                  style={{width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',fontSize:14,marginBottom:8,boxSizing:'border-box' as const,fontFamily:'inherit',outline:'none'}}/>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:8}}>
                  <select value={editData.frequency||'per_change'} onChange={e=>setEditData((p:any)=>({...p,frequency:e.target.value}))}
                    style={{border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 8px',fontSize:13,fontFamily:'inherit'}}>
                    {FREQ_OPTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    {[['requires_photo','📷 Foto'],['es_critico','🔴 Crítico']].map(([k,l])=>(
                      <label key={k} style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
                        <input type="checkbox" checked={!!editData[k]} onChange={e=>setEditData((p:any)=>({...p,[k]:e.target.checked}))}/>
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Btn onClick={saveEdit} disabled={saving} small>{saving?'…':'Guardar'}</Btn>
                  <Btn onClick={()=>setEditId(null)} variant="secondary" small>Cancelar</Btn>
                </div>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                  <button onClick={()=>move(item,'up')} disabled={idx===0} style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:14,padding:'0 4px',opacity:idx===0?.3:1}}>▲</button>
                  <button onClick={()=>move(item,'down')} disabled={idx===items.length-1} style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:14,padding:'0 4px',opacity:idx===items.length-1?.3:1}}>▼</button>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{item.description}</div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
                    <Badge label={FREQ_OPTS.find(f=>f.value===item.frequency)?.label||item.frequency} color="#374151" bg="#f3f4f6"/>
                    {item.requires_photo&&<Badge label="📷 Foto" color="#1d4ed8" bg="#eff6ff"/>}
                    {item.es_critico&&<Badge label="🔴 Crítico" color={C.red} bg="#fee2e2"/>}
                    {item.foto_referencia_url&&<Badge label="🖼️ Ref" color={C.ok} bg="#dcfce7"/>}
                  </div>
                </div>
                <div style={{display:'flex',gap:5,alignItems:'center'}}>
                  <input ref={el=>{uploadRefs.current[item.id]=el}} type="file" accept="image/*" style={{display:'none'}}
                    onChange={e=>{const f=e.target.files?.[0];if(f)uploadRef(item.id,f)}}/>
                  <button onClick={()=>uploadRefs.current[item.id]?.click()}
                    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'4px 7px',fontSize:11,cursor:'pointer'}}
                    title="Subir foto referencia">{item.foto_referencia_url?'🖼️':'📷'}</button>
                  <button onClick={()=>{setEditId(item.id);setEditData({...item})}}
                    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'4px 7px',fontSize:11,cursor:'pointer'}}>✏️</button>
                  <button onClick={()=>deleteItem(item.id)} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{background:'#f9fafb',borderRadius:12,padding:16,border:`1px dashed ${C.border}`}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:C.text}}>+ Nuevo ítem</div>
        <input value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))}
          placeholder="Descripción del ítem..."
          style={{width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:14,marginBottom:8,boxSizing:'border-box' as const,fontFamily:'inherit',outline:'none'}}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:10}}>
          <select value={newItem.frequency} onChange={e=>setNewItem(p=>({...p,frequency:e.target.value}))}
            style={{border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',fontSize:13,fontFamily:'inherit'}}>
            {FREQ_OPTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <div style={{display:'flex',gap:14,alignItems:'center'}}>
            {[['requires_photo','📷 Foto'],['es_critico','🔴 Crítico']].map(([k,l])=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
                <input type="checkbox" checked={(newItem as any)[k]} onChange={e=>setNewItem(p=>({...p,[k]:e.target.checked}))}/>
                {l}
              </label>
            ))}
          </div>
        </div>
        <Btn onClick={addItem} disabled={saving||!newItem.description.trim()}>{saving?'Guardando…':'+ Añadir ítem'}</Btn>
      </div>
    </div>
  )
}

// ─── TAB DOCUMENTOS ──────────────────────────────────────────────
function TabDocumentos() {
  const [fase, setFase]             = useState<'lista'|'preview'|'analizando'|'resultado'>('lista')
  const [docs, setDocs]             = useState<any[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [imgSrc, setImgSrc]         = useState<string|null>(null)
  const [imgFile, setImgFile]       = useState<File|null>(null)
  const [resultado, setResultado]   = useState<any>(null)
  const [error, setError]           = useState<string|null>(null)
  const [expandId, setExpandId]     = useState<string|null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  const cargarDocs = useCallback(async () => {
    setLoadingDocs(true)
    const r = await fetch('/api/admin/escanear?limit=30')
    const d = await r.json()
    setDocs(d.docs||[])
    setLoadingDocs(false)
  },[])
  useEffect(()=>{cargarDocs()},[cargarDocs])

  const cargarImagen = useCallback((file:File)=>{
    setImgFile(file)
    const r=new FileReader()
    r.onload=(e)=>{setImgSrc(e.target?.result as string);setFase('preview')}
    r.readAsDataURL(file)
  },[])

  const analizar = async () => {
    if(!imgSrc||!imgFile) return
    setFase('analizando'); setError(null)
    try {
      const base64=imgSrc.split(',')[1]
      const res=await fetch('/api/admin/escanear',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({imagen_base64:base64,media_type:imgFile.type||'image/jpeg'})})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error||'Error servidor')
      const doc_id=data.doc_id
      // Poll hasta resultado
      for(let i=0;i<24;i++){
        await new Promise(r=>setTimeout(r,5000))
        const poll=await fetch('/api/admin/escanear?limit=10')
        const pd=await poll.json()
        const doc=(pd.docs||[]).find((d:any)=>d.id===doc_id)
        if(doc&&doc.tipo_doc!=='pendiente'){
          setResultado(doc); setFase('resultado'); return
        }
      }
      throw new Error('Tiempo de espera agotado — refresca para ver el resultado')
    } catch(e:any){ setError(e.message); setFase('preview') }
  }

  const reiniciar = () => {
    setFase('lista'); setImgSrc(null); setImgFile(null); setResultado(null); setError(null); cargarDocs()
  }

  const [borrando, setBorrando] = useState<string|null>(null)
  const borrarDoc = async (id:string) => {
    if(!confirm('¿Eliminar este documento? Se quitará de la contabilidad (borrado reversible).')) return
    setBorrando(id)
    try {
      const r = await fetch(`/api/admin/escanear/${id}`, { method:'DELETE' })
      if(!r.ok){ const d=await r.json().catch(()=>({})); throw new Error(d.error||'Error al borrar') }
      setDocs(prev=>prev.filter(d=>d.id!==id))
      setExpandId(prev=>prev===id?null:prev)
    } catch(e:any){ alert(e.message) }
    finally { setBorrando(null) }
  }

  if(fase==='lista') return (
    <div>
      {!loadingDocs&&docs.length>0&&(()=>{
        const totalGasto=docs.filter(d=>d.tipo_doc!=='pendiente'&&d.tipo_doc!=='error').reduce((s,d)=>s+Number(d.total||0),0)
        const conStock=docs.filter(d=>d.procesado_stock).length
        return (
          <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            <StatCard value={docs.length} label="Documentos"/>
            <StatCard value={`${totalGasto.toFixed(0)} €`} label="Gasto total" color={C.primary}/>
            <StatCard value={conStock} label="📦 Stock actualizados" color={C.ok}/>
          </div>
        )
      })()}

      {/* Botones escanear */}
      <button onClick={()=>{setFase('preview');setTimeout(()=>camRef.current?.click(),50)}}
        style={{width:'100%',background:`linear-gradient(135deg,${C.primary},${C.brand})`,color:C.white,border:'none',borderRadius:14,
          padding:'18px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:12,cursor:'pointer',
          fontFamily:'inherit',marginBottom:10,boxShadow:'0 4px 18px rgba(79,70,229,.3)'}}>
        <span style={{fontSize:26}}>📷</span>
        <div style={{textAlign:'left'}}>
          <div style={{fontWeight:800,fontSize:15}}>Escanear con cámara</div>
          <div style={{fontSize:11,opacity:.8}}>Factura · Albarán · Ticket · CV</div>
        </div>
      </button>
      <button onClick={()=>{setFase('preview');setTimeout(()=>galRef.current?.click(),50)}}
        style={{width:'100%',background:C.white,border:`2px solid ${C.primary}`,color:C.primary,borderRadius:11,
          padding:'11px 16px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:20}}>
        🖼️ Subir desde galería / archivo
      </button>

      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
        onChange={e=>e.target.files?.[0]&&cargarImagen(e.target.files[0])}/>
      <input ref={galRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e=>e.target.files?.[0]&&cargarImagen(e.target.files[0])}/>

      {loadingDocs?<Spinner/>:docs.length===0?(
        <div style={{textAlign:'center',padding:'32px 16px',color:C.muted}}>
          <div style={{fontSize:40,marginBottom:8}}>📄</div>
          <div style={{fontWeight:600}}>Sin documentos escaneados</div>
        </div>
      ):docs.map(doc=>{
        const isOpen=expandId===doc.id
        const lineas:any[]=doc.lineas_json||[]
        const apunte:any[]=doc.apunte_json||[]
        const isPending=doc.tipo_doc==='pendiente'
        return (
          <div key={doc.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:8,overflow:'hidden'}}>
            <div onClick={()=>setExpandId(isOpen?null:doc.id)}
              style={{padding:'12px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:24}}>{TIPO_EMOJI[doc.tipo_doc]||'📄'}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,color:isPending?C.muted:C.text}}>
                  {doc.proveedor||doc.descripcion||doc.tipo_doc}
                  {isPending&&<span style={{marginLeft:8,fontSize:11,color:C.warn,fontWeight:400}}>Procesando…</span>}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {doc.fecha_doc?new Date(doc.fecha_doc).toLocaleDateString('es-ES'):'Sin fecha'}
                  {doc.numero_doc?` · ${doc.numero_doc}`:''}
                  {doc.categoria&&doc.categoria!=='pendiente'?` · ${doc.categoria}`:''}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                {doc.total!=null&&<div style={{fontWeight:800,fontSize:15,color:C.text}}>{Number(doc.total).toFixed(2)} €</div>}
                <div style={{display:'flex',gap:4,justifyContent:'flex-end',marginTop:3}}>
                  {doc.procesado_stock&&<span style={{fontSize:10,background:C.okBg,color:C.ok,borderRadius:6,padding:'2px 5px',fontWeight:700}}>📦</span>}
                  {!isPending&&<span style={{fontSize:10,color:C.muted}}>{isOpen?'▲':'▼'}</span>}
                </div>
              </div>
              <button onClick={(e)=>{e.stopPropagation();borrarDoc(doc.id)}} disabled={borrando===doc.id}
                title="Eliminar documento" aria-label="Eliminar documento"
                style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:16,padding:'4px 6px',flexShrink:0,lineHeight:1,opacity:borrando===doc.id?.4:1}}>
                {borrando===doc.id?'…':'🗑'}
              </button>
            </div>
            {isOpen&&!isPending&&(
              <div style={{borderTop:`1px solid ${C.border}`,padding:'12px 14px'}}>
                {doc.tipo_doc==='curriculum'&&(()=>{
                  const c:any=doc.lineas_json||{}
                  return (
                    <div style={{display:'grid',gap:5,fontSize:12}}>
                      {c.telefono&&<div>📞 {c.telefono}</div>}
                      {c.email&&<div>✉️ {c.email}</div>}
                      {c.puesto&&<div><b>Puesto:</b> {c.puesto}</div>}
                      {c.experiencia_anios!=null&&<div><b>Experiencia:</b> {c.experiencia_anios} años</div>}
                      {c.resumen&&<div style={{color:C.muted,marginTop:3}}>{c.resumen}</div>}
                    </div>
                  )
                })()}
                {lineas.length>0&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5}}>Líneas</div>
                    {lineas.map((l:any,i:number)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:`1px solid ${C.bg}`}}>
                        <span>{l.cantidad}× {l.descripcion}{l.producto_id&&<span style={{marginLeft:4,color:C.ok,fontWeight:700}}>✓</span>}</span>
                        <span style={{color:C.muted}}>{l.total_linea!=null?`${Number(l.total_linea).toFixed(2)} €`:''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {apunte.length>0&&(
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5}}>Apunte PGC</div>
                    {apunte.map((a:any,i:number)=>(
                      <div key={i} style={{display:'flex',gap:8,fontSize:12,padding:'3px 0'}}>
                        <span style={{color:C.primary,fontWeight:700,minWidth:52}}>{a.cuenta}</span>
                        <span style={{flex:1,color:'#374151'}}>{a.nombre}</span>
                        <span style={{color:C.ok,minWidth:52,textAlign:'right'}}>{a.debe?`D:${a.debe}`:''}</span>
                        <span style={{color:C.red,minWidth:52,textAlign:'right'}}>{a.haber?`H:${a.haber}`:''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  if(fase==='preview') return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
        onChange={e=>e.target.files?.[0]&&cargarImagen(e.target.files[0])}/>
      <input ref={galRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e=>e.target.files?.[0]&&cargarImagen(e.target.files[0])}/>
      {imgSrc?(
        <>
          <div style={{borderRadius:13,overflow:'hidden',boxShadow:'0 4px 14px rgba(0,0,0,.11)',background:C.white,maxHeight:400,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <img src={imgSrc} alt="doc" style={{width:'100%',maxHeight:400,objectFit:'contain'}}/>
          </div>
          {error&&<div style={{background:C.redBg,border:'1px solid #fca5a5',color:'#991b1b',borderRadius:9,padding:'9px 13px',fontSize:13}}>{error}</div>}
          <Btn onClick={analizar}>✨ Analizar con IA</Btn>
          <button onClick={reiniciar} style={{background:'transparent',border:'none',color:C.muted,fontSize:13,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline',alignSelf:'center'}}>Cancelar</button>
        </>
      ):(
        <div style={{textAlign:'center',padding:'40px 16px',color:C.muted,fontSize:13}}>Selecciona una imagen…
          <br/><button onClick={reiniciar} style={{marginTop:12,background:'none',border:'none',color:C.primary,cursor:'pointer',textDecoration:'underline',fontFamily:'inherit'}}>Cancelar</button>
        </div>
      )}
    </div>
  )

  if(fase==='analizando') return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'40px 16px',gap:20}}>
      <div style={{width:52,height:52,borderRadius:'50%',border:`4px solid ${C.light}`,borderTop:`4px solid ${C.primary}`,animation:'giro .85s linear infinite'}}/>
      <div style={{fontWeight:700,fontSize:17,color:C.text}}>Analizando con IA…</div>
      <div style={{fontSize:13,color:C.muted,textAlign:'center'}}>El cron procesa cada minuto.<br/>Puedes esperar o volver a la lista para ver el resultado.</div>
      <button onClick={reiniciar} style={{background:C.light,border:'none',color:C.primary,padding:'10px 20px',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Ver lista de documentos</button>
      <style>{`@keyframes giro{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if(fase==='resultado'&&resultado) {
    const lineas:any[]=resultado.lineas_json||[]
    const apunte:any[]=resultado.apunte_json||[]
    return (
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{background:C.white,borderRadius:13,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:32}}>{TIPO_EMOJI[resultado.tipo_doc]||'📄'}</span>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:C.primary}}>{(resultado.tipo_doc||'doc').toUpperCase()}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>{resultado.descripcion}</div>
            </div>
          </div>
          {resultado.total!=null&&<div style={{fontWeight:800,fontSize:22,color:C.text}}>{Number(resultado.total).toFixed(2)} €</div>}
        </div>
        <div style={{background:C.white,borderRadius:13,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
          <div style={{fontWeight:700,fontSize:11,color:C.primary,textTransform:'uppercase',letterSpacing:'.05em',borderBottom:`1px solid ${C.light}`,paddingBottom:7,marginBottom:8}}>Datos extraídos</div>
          {[['Proveedor',resultado.proveedor],['Fecha',resultado.fecha_doc?new Date(resultado.fecha_doc).toLocaleDateString('es-ES'):null],['Nº doc',resultado.numero_doc],['Base imp.',resultado.base_imponible!=null?`${Number(resultado.base_imponible).toFixed(2)} €`:null],[`IVA ${resultado.porcentaje_iva||''}%`,resultado.cuota_iva!=null?`${Number(resultado.cuota_iva).toFixed(2)} €`:null]].map(([l,v]:any)=>v?(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.bg}`,fontSize:13}}>
              <span style={{color:C.muted,fontWeight:600,fontSize:12}}>{l}</span>
              <span style={{color:C.text,fontWeight:600}}>{v}</span>
            </div>
          ):null)}
        </div>
        {lineas.length>0&&(
          <div style={{background:C.white,borderRadius:13,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.primary,textTransform:'uppercase',letterSpacing:'.05em',borderBottom:`1px solid ${C.light}`,paddingBottom:7,marginBottom:8}}>Líneas</div>
            {lineas.map((l:any,i:number)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${C.bg}`,fontSize:13}}>
                <div><span style={{fontWeight:600}}>{l.cantidad}× {l.descripcion}</span>
                  <div style={{fontSize:11,color:C.muted}}>{l.categoria} · {l.unidad}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  {l.total_linea!=null&&<div style={{fontWeight:700}}>{Number(l.total_linea).toFixed(2)} €</div>}
                  {l.producto_id?<span style={{fontSize:10,background:C.okBg,color:C.ok,borderRadius:5,padding:'1px 5px',fontWeight:700}}>📦 Stock ✓</span>:<span style={{fontSize:10,color:C.muted}}>sin match</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {apunte.length>0&&(
          <div style={{background:C.white,borderRadius:13,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
            <div style={{fontWeight:700,fontSize:11,color:C.primary,textTransform:'uppercase',letterSpacing:'.05em',borderBottom:`1px solid ${C.light}`,paddingBottom:7,marginBottom:8}}>Apunte PGC</div>
            {apunte.map((a:any,i:number)=>(
              <div key={i} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:`1px solid ${C.bg}`,fontSize:13}}>
                <span style={{color:C.primary,fontWeight:700,minWidth:54}}>{a.cuenta}</span>
                <span style={{flex:1,color:'#374151'}}>{a.nombre}</span>
                <span style={{color:C.ok,minWidth:52,textAlign:'right',fontWeight:a.debe?700:400}}>{a.debe?`D:${a.debe}`:''}</span>
                <span style={{color:C.red,minWidth:52,textAlign:'right',fontWeight:a.haber?700:400}}>{a.haber?`H:${a.haber}`:''}</span>
              </div>
            ))}
          </div>
        )}
        {resultado.procesado_stock&&(
          <div style={{background:C.okBg,border:'1px solid #bbf7d0',borderRadius:12,padding:'11px 16px',fontSize:14,color:C.ok,fontWeight:700}}>
            📦 Stock actualizado automáticamente
          </div>
        )}
        <Btn onClick={reiniciar}>✓ Volver a documentos</Btn>
        <button onClick={()=>{setFase('preview');setImgSrc(null);setImgFile(null);setResultado(null)}}
          style={{background:'transparent',border:'none',color:C.muted,fontSize:13,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline',alignSelf:'center'}}>
          Escanear otro documento
        </button>
      </div>
    )
  }
  return null
}
