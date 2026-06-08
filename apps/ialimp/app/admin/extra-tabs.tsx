'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const PROPS = [
  { id: 'prop_house_sevillana', name: 'House Sevillana', color: '#16a34a', short: 'HS' },
  { id: 'prop_duplex_center',   name: 'Dúplex Center',   color: '#2563eb', short: 'DC' },
  { id: 'prop_luxury_busto',    name: 'Luxury Busto',    color: '#9333ea', short: 'LB' },
  { id: 'prop_busto_reform',    name: 'Busto Reform',    color: '#ea580c', short: 'BR' },
]
const FREQ_OPTS = [
  { value:'per_change', label:'Cada cambio' },
  { value:'weekly',     label:'Semanal'     },
  { value:'monthly',    label:'Mensual'     },
  { value:'one_time',   label:'Puntual'     },
]
function pBy(id: string) { return PROPS.find(p=>p.id===id) }
function todayISO() { return new Date().toISOString().split('T')[0] }
function firstOfMonth(offset=0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset)
  return d.toISOString().split('T')[0]
}
function lastOfMonth(offset=0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset+1); d.setDate(0)
  return d.toISOString().split('T')[0]
}
function Spinner() { return <div style={{textAlign:'center',padding:32,color:'#9ca3af'}}>Cargando...</div> }
function Badge({ label, color, bg }: { label:string; color:string; bg:string }) {
  return <span style={{background:bg,color,borderRadius:12,padding:'2px 9px',fontSize:11,fontWeight:700}}>{label}</span>
}

// ─── TAB CHECKLISTS ───────────────────────────────────────────────
function TabChecklists() {
  const [selProp, setSelProp] = useState(PROPS[0].id)
  const [items, setItems] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string|null>(null)
  const [editData, setEditData] = useState<any>({})
  const [newItem, setNewItem] = useState({ description:'', frequency:'per_change', requires_photo:false, es_critico:false })
  const [saving, setSaving] = useState(false)
  const uploadRefs = useRef<Record<string,HTMLInputElement|null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/checklist?property_id=${selProp}`)
    const d = await r.json()
    setItems(d.items||[]); setTemplates(d.templates||[])
    setLoading(false)
  }, [selProp])
  useEffect(()=>{ load() }, [load])

  const template = templates[0]

  async function addItem() {
    if (!newItem.description.trim()||!template) return
    setSaving(true)
    await fetch('/api/admin/checklist',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...newItem,template_id:template.id,property_id:selProp})})
    setNewItem({description:'',frequency:'per_change',requires_photo:false,es_critico:false})
    setSaving(false); load()
  }

  async function saveEdit() {
    if (!editId) return
    setSaving(true)
    await fetch('/api/admin/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:editId,...editData})})
    setEditId(null); setSaving(false); load()
  }

  async function deleteItem(id: string) {
    if (!confirm('¿Eliminar este ítem?')) return
    await fetch('/api/admin/checklist',{method:'DELETE',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id})})
    load()
  }

  async function move(item: any, dir: 'up'|'down') {
    const idx = items.findIndex(i=>i.id===item.id)
    const other = dir==='up' ? items[idx-1] : items[idx+1]
    if (!other) return
    await fetch('/api/admin/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_action:'reorder',id:item.id,new_sort:other.sort_order||idx*10,
        swap_id:other.id,old_sort:item.sort_order||(idx+1)*10})})
    load()
  }

  async function uploadRef(itemId: string, file: File) {
    const form = new FormData()
    form.append('file',file); form.append('session_id','reference')
    form.append('item_id',itemId); form.append('slot','ref')
    const r = await fetch('/api/l/upload-photo',{method:'POST',body:form})
    const d = await r.json()
    if (d.url) {
      await fetch('/api/admin/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:itemId,...items.find(i=>i.id===itemId),foto_referencia_url:d.url})})
      load()
    }
  }

  const prop = pBy(selProp)
  if (loading) return <Spinner/>

  return (
    <div>
      {/* Selector piso */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {PROPS.map(p=>(
          <button key={p.id} onClick={()=>setSelProp(p.id)}
            style={{padding:'7px 16px',borderRadius:10,border:`2px solid ${p.color}`,
              background:selProp===p.id?p.color:'#fff',color:selProp===p.id?'#fff':p.color,
              fontWeight:700,fontSize:13,cursor:'pointer'}}>
            {p.short}
          </button>
        ))}
      </div>

      {/* Lista de ítems */}
      <div style={{marginBottom:20}}>
        {items.length===0&&<div style={{color:'#9ca3af',textAlign:'center',padding:24}}>Sin ítems configurados</div>}
        {items.map((item,idx)=>(
          <div key={item.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'12px 14px',marginBottom:8}}>
            {editId===item.id ? (
              <div>
                <input value={editData.description||''} onChange={e=>setEditData((p:any)=>({...p,description:e.target.value}))}
                  style={{width:'100%',border:'1px solid #e5e7eb',borderRadius:8,padding:'7px 10px',fontSize:14,marginBottom:8,boxSizing:'border-box' as const}}/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <select value={editData.frequency||'per_change'} onChange={e=>setEditData((p:any)=>({...p,frequency:e.target.value}))}
                    style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 8px',fontSize:13}}>
                    {FREQ_OPTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
                      <input type="checkbox" checked={!!editData.requires_photo}
                        onChange={e=>setEditData((p:any)=>({...p,requires_photo:e.target.checked}))}/>
                      📷 Foto
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
                      <input type="checkbox" checked={!!editData.es_critico}
                        onChange={e=>setEditData((p:any)=>({...p,es_critico:e.target.checked}))}/>
                      🔴 Crítico
                    </label>
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={saveEdit} disabled={saving}
                    style={{background:prop?.color||'var(--brand-primary)',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    Guardar
                  </button>
                  <button onClick={()=>setEditId(null)}
                    style={{background:'none',border:'1px solid #e5e7eb',borderRadius:8,padding:'7px 14px',fontSize:13,cursor:'pointer'}}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                {/* Sort buttons */}
                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                  <button onClick={()=>move(item,'up')} disabled={idx===0}
                    style={{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:14,padding:'0 4px',opacity:idx===0?.3:1}}>▲</button>
                  <button onClick={()=>move(item,'down')} disabled={idx===items.length-1}
                    style={{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:14,padding:'0 4px',opacity:idx===items.length-1?.3:1}}>▼</button>
                </div>
                {/* Content */}
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{item.description}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <Badge label={FREQ_OPTS.find(f=>f.value===item.frequency)?.label||item.frequency} color="#374151" bg="#f3f4f6"/>
                    {item.requires_photo&&<Badge label="📷 Foto" color="#1d4ed8" bg="#eff6ff"/>}
                    {item.es_critico&&<Badge label="🔴 Crítico" color="#dc2626" bg="#fee2e2"/>}
                    {item.foto_referencia_url&&<Badge label="🖼️ Ref" color="#16a34a" bg="#dcfce7"/>}
                  </div>
                </div>
                {/* Actions */}
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {/* Upload foto referencia */}
                  <input ref={el=>{ uploadRefs.current[item.id]=el }} type="file" accept="image/*" style={{display:'none'}}
                    onChange={e=>{const f=e.target.files?.[0];if(f)uploadRef(item.id,f)}}/>
                  <button onClick={()=>uploadRefs.current[item.id]?.click()}
                    style={{background:'none',border:'1px solid #e5e7eb',borderRadius:7,padding:'4px 8px',fontSize:11,cursor:'pointer'}}
                    title="Subir foto de referencia">
                    {item.foto_referencia_url?'🖼️':'📷'}
                  </button>
                  <button onClick={()=>{setEditId(item.id);setEditData({...item})}}
                    style={{background:'none',border:'1px solid #e5e7eb',borderRadius:7,padding:'4px 8px',fontSize:11,cursor:'pointer'}}>✏️</button>
                  <button onClick={()=>deleteItem(item.id)}
                    style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Añadir nuevo ítem */}
      <div style={{background:'#f9fafb',borderRadius:12,padding:16,border:'1px dashed #d1d5db'}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:'#374151'}}>+ Nuevo ítem</div>
        <input value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))}
          placeholder="Descripción del ítem..."
          style={{width:'100%',border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:14,marginBottom:8,boxSizing:'border-box' as const}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
          <select value={newItem.frequency} onChange={e=>setNewItem(p=>({...p,frequency:e.target.value}))}
            style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'7px 10px',fontSize:13}}>
            {FREQ_OPTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <div style={{display:'flex',gap:14,alignItems:'center'}}>
            <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
              <input type="checkbox" checked={newItem.requires_photo} onChange={e=>setNewItem(p=>({...p,requires_photo:e.target.checked}))}/>
              📷 Foto
            </label>
            <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
              <input type="checkbox" checked={newItem.es_critico} onChange={e=>setNewItem(p=>({...p,es_critico:e.target.checked}))}/>
              🔴 Crítico
            </label>
          </div>
        </div>
        <button onClick={addItem} disabled={saving||!newItem.description.trim()}
          style={{background:prop?.color||'var(--brand-primary)',color:'#fff',border:'none',borderRadius:9,padding:'9px 20px',fontWeight:700,fontSize:13,cursor:'pointer',opacity:saving||!newItem.description.trim()?.5:1}}>
          {saving?'Guardando...':'+ Añadir ítem'}
        </button>
      </div>
    </div>
  )
}

// ─── TAB INFORMES ─────────────────────────────────────────────────
function TabInformes() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [selLimp, setSelLimp] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    fetch('/api/admin/usuarios').then(r=>r.json()).then(d=>{
      setLimpiadoras(d.limpiadoras||[])
      if(d.limpiadoras?.length) setSelLimp(d.limpiadoras[0].id)
    })
  }, [])

  async function loadPreview() {
    if (!selLimp) return
    setLoading(true)
    const desde = firstOfMonth(monthOffset); const hasta = lastOfMonth(monthOffset)
    const r = await fetch(`/api/admin/informe?lid=${selLimp}&from=${desde}&to=${hasta}`)
    const html = await r.text()
    setPreview(html); setLoading(false)
  }

  function openInforme() {
    if (!selLimp) return
    const desde = firstOfMonth(monthOffset); const hasta = lastOfMonth(monthOffset)
    window.open(`/api/admin/informe?lid=${selLimp}&from=${desde}&to=${hasta}`,'_blank')
  }

  const mesLabel = new Date(firstOfMonth(monthOffset)+'T12:00:00').toLocaleDateString('es-ES',{month:'long',year:'numeric'})
  const limp = limpiadoras.find(l=>l.id===selLimp)

  return (
    <div>
      <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:16,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div>
            <div style={{fontSize:11,color:'#9ca3af',marginBottom:5,fontWeight:600}}>Limpiadora</div>
            <select value={selLimp} onChange={e=>setSelLimp(e.target.value)}
              style={{width:'100%',border:'1px solid #e5e7eb',borderRadius:8,padding:'9px 10px',fontSize:14}}>
              {limpiadoras.map(l=><option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:'#9ca3af',marginBottom:5,fontWeight:600}}>Período</div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <button onClick={()=>setMonthOffset(o=>o-1)}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'7px 12px',background:'#fff',cursor:'pointer',fontSize:14}}>‹</button>
              <span style={{flex:1,textAlign:'center',fontSize:13,fontWeight:600,textTransform:'capitalize'}}>{mesLabel}</span>
              <button onClick={()=>setMonthOffset(o=>o+1)} disabled={monthOffset>=0}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'7px 12px',background:'#fff',cursor:'pointer',fontSize:14,opacity:monthOffset>=0?.4:1}}>›</button>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={loadPreview} disabled={loading||!selLimp}
            style={{flex:1,background:'#f3f4f6',color:'#374151',border:'none',borderRadius:9,padding:'10px 0',fontWeight:600,fontSize:14,cursor:'pointer'}}>
            👁 Vista previa
          </button>
          <button onClick={openInforme} disabled={!selLimp}
            style={{flex:1,background:'var(--brand-primary)',color:'#fff',border:'none',borderRadius:9,padding:'10px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>
            🖨️ Abrir / PDF
          </button>
        </div>
      </div>
      {loading&&<Spinner/>}
      {preview&&!loading&&(
        <div style={{border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden'}}>
          <div style={{background:'#f9fafb',padding:'10px 14px',fontSize:12,color:'#6b7280',fontWeight:600}}>
            Vista previa — {limp?.nombre} · {mesLabel}
          </div>
          <iframe srcDoc={preview} style={{width:'100%',height:400,border:'none'}} title="Informe"/>
        </div>
      )}
    </div>
  )
}

// ─── TAB FACTURACIÓN ─────────────────────────────────────────────
function TabFacturacion() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [tarifas, setTarifas] = useState<any[]>([])
  const [facturas, setFacturas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'facturas'|'tarifas'>('facturas')
  const [gen, setGen] = useState({ limpiadora_id:'', desde:'', hasta:'' })
  const [newTarifa, setNewTarifa] = useState({ limpiadora_id:'', tipo:'sesion', importe:'' })
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async()=>{
    setLoading(true)
    const [r1,r2,r3] = await Promise.all([
      fetch('/api/admin/usuarios'),
      fetch('/api/admin/tarifas'),
      fetch('/api/admin/facturacion'),
    ])
    const [d1,d2,d3] = await Promise.all([r1.json(),r2.json(),r3.json()])
    setLimpiadoras(d1.limpiadoras||[]); setTarifas(d2.tarifas||[]); setFacturas(d3.facturas||[])
    if(d1.limpiadoras?.length&&!gen.limpiadora_id) setGen(p=>({...p,limpiadora_id:d1.limpiadoras[0].id}))
    setLoading(false)
  }, [])
  useEffect(()=>{ load() }, [load])

  async function generateFactura() {
    if(!gen.limpiadora_id||!gen.desde||!gen.hasta) return
    setGenerating(true)
    const r = await fetch('/api/admin/facturacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(gen)})
    const d = await r.json()
    if(d.factura) { alert(`✅ Factura ${d.factura.numero} generada — ${d.factura.importe_total}€`); load() }
    else alert('Error: '+d.error)
    setGenerating(false)
  }

  async function updateEstado(id: string, estado: string) {
    await fetch('/api/admin/facturacion',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,estado})})
    load()
  }

  async function saveTarifa() {
    if(!newTarifa.limpiadora_id||!newTarifa.importe) return
    await fetch('/api/admin/tarifas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newTarifa)})
    setNewTarifa(p=>({...p,importe:''})); load()
  }

  if(loading) return <Spinner/>
  const ESTADOS: Record<string,{bg:string;col:string;label:string}> = {
    borrador:{bg:'#f3f4f6',col:'#6b7280',label:'Borrador'},
    enviada:{bg:'#dbeafe',col:'#1d4ed8',label:'Enviada'},
    pagada:{bg:'#dcfce7',col:'#16a34a',label:'✓ Pagada'},
  }

  return (
    <div>
      {/* Toggle */}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {['facturas','tarifas'].map(v=>(
          <button key={v} onClick={()=>setView(v as any)}
            style={{padding:'7px 18px',borderRadius:9,border:'1px solid #e5e7eb',fontWeight:600,fontSize:13,cursor:'pointer',
              background:view===v?'var(--brand-primary)':'#fff',color:view===v?'#fff':'#374151'}}>
            {v==='facturas'?`📄 Facturas (${facturas.length})`:`⚙️ Tarifas (${tarifas.length})`}
          </button>
        ))}
      </div>

      {view==='tarifas'&&(
        <div>
          {/* Form nueva tarifa */}
          <div style={{background:'#f9fafb',borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Configurar tarifa</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
              <select value={newTarifa.limpiadora_id} onChange={e=>setNewTarifa(p=>({...p,limpiadora_id:e.target.value}))}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:13}}>
                <option value="">Limpiadora</option>
                {limpiadoras.map(l=><option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              <select value={newTarifa.tipo} onChange={e=>setNewTarifa(p=>({...p,tipo:e.target.value}))}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:13}}>
                <option value="sesion">€ / sesión</option>
                <option value="hora">€ / hora</option>
              </select>
              <input type="number" placeholder="Importe €" value={newTarifa.importe}
                onChange={e=>setNewTarifa(p=>({...p,importe:e.target.value}))}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:13}}/>
            </div>
            <button onClick={saveTarifa} disabled={!newTarifa.limpiadora_id||!newTarifa.importe}
              style={{background:'var(--brand-primary)',color:'#fff',border:'none',borderRadius:9,padding:'9px 20px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
              Guardar tarifa
            </button>
          </div>
          {tarifas.map(t=>(
            <div key={t.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'12px 14px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{t.limpiadora_nombre}</div>
                <div style={{fontSize:12,color:'#6b7280'}}>{t.tipo==='hora'?'Por hora':'Por sesión'}</div>
              </div>
              <div style={{fontWeight:800,fontSize:18,color:'var(--brand-primary)'}}>{t.importe}€</div>
            </div>
          ))}
        </div>
      )}

      {view==='facturas'&&(
        <div>
          {/* Generar factura */}
          <div style={{background:'var(--brand-light)',border:'1px solid #c7d2fe',borderRadius:12,padding:16,marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:'var(--brand-primary)'}}>📄 Generar nueva factura</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
              <select value={gen.limpiadora_id} onChange={e=>setGen(p=>({...p,limpiadora_id:e.target.value}))}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:13}}>
                <option value="">Limpiadora</option>
                {limpiadoras.map(l=><option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              <input type="date" value={gen.desde} onChange={e=>setGen(p=>({...p,desde:e.target.value}))}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:13}}/>
              <input type="date" value={gen.hasta} onChange={e=>setGen(p=>({...p,hasta:e.target.value}))}
                style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 10px',fontSize:13}}/>
            </div>
            <button onClick={generateFactura} disabled={generating||!gen.limpiadora_id||!gen.desde||!gen.hasta}
              style={{background:'var(--brand-primary)',color:'#fff',border:'none',borderRadius:9,padding:'10px 22px',fontWeight:700,fontSize:14,cursor:'pointer',opacity:generating?.6:1}}>
              {generating?'Generando...':'⚡ Generar factura'}
            </button>
          </div>
          {facturas.length===0&&<div style={{textAlign:'center',color:'#9ca3af',padding:32}}>Sin facturas generadas</div>}
          {facturas.map(f=>{
            const l=limpiadoras.find(x=>x.id===f.limpiadora_id)
            const est=ESTADOS[f.estado]||ESTADOS.borrador
            return (
              <div key={f.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:16,marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{f.numero}</div>
                    <div style={{fontSize:12,color:'#6b7280'}}>{l?.nombre||'?'} · {f.periodo_inicio} → {f.periodo_fin}</div>
                    <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{f.num_sesiones} sesiones · {f.total_horas}h</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:800,fontSize:20,color:'var(--brand-primary)'}}>{f.importe_total}€</div>
                    <span style={{background:est.bg,color:est.col,fontSize:11,fontWeight:700,borderRadius:10,padding:'2px 8px'}}>{est.label}</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button onClick={()=>window.open(`/api/admin/informe?lid=${f.limpiadora_id}&from=${f.periodo_inicio}&to=${f.periodo_fin}`,'_blank')}
                    style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',background:'#fff'}}>
                    🖨️ Informe PDF
                  </button>
                  {f.estado==='borrador'&&<button onClick={()=>updateEstado(f.id,'enviada')}
                    style={{border:'1px solid #bfdbfe',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',background:'#eff6ff',color:'#1d4ed8',fontWeight:600}}>
                    📤 Marcar enviada
                  </button>}
                  {f.estado==='enviada'&&<button onClick={()=>updateEstado(f.id,'pagada')}
                    style={{border:'1px solid #c7d2fe',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',background:'#dcfce7',color:'#16a34a',fontWeight:600}}>
                    ✓ Marcar pagada
                  </button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── EXPORT COMPONENTS (para usar en admin page principal) ────────
export { TabChecklists, TabInformes, TabFacturacion }
