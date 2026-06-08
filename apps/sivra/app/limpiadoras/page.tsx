'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const PROPS: Record<string, { name: string; short: string; color: string }> = {
  prop_house_sevillana: { name: 'House Sevillana', short: 'House',  color: '#1B4332' },
  prop_duplex_center:   { name: 'Dúplex Center',   short: 'Dúplex', color: '#1A5276' },
  prop_luxury_busto:    { name: 'Luxury Busto',     short: 'Luxury', color: '#6C3483' },
  prop_busto_reform:    { name: 'Busto Reform',     short: 'Busto',  color: '#784212' },
}
const FREQ: Record<string, string> = {
  per_change: 'Cada cambio', weekly: 'Semanal', monthly: 'Mensual', one_time: 'Puntual',
}

type Session = {
  id: string; property_id: string; session_date: string
  guest_out: string|null; guest_in: string|null
  checkout_time: string; checkin_time: string
  early_checkout_time: string|null; early_checkin_requested: string|null
  early_checkin_status: 'pending'|'accepted'|'declined'|null
  completed_at: string|null; nota_propietario: string|null
  hora_llegada: string|null; hora_salida: string|null
  checklist_items: CheckItem[]; completions: Completion[]|null
}
type CheckItem = {
  id: string; description: string; frequency: string
  requires_photo: boolean; es_critico: boolean
  foto_referencia_url: string|null; sort_order: number
}
type Completion = {
  item_id: string; checked: boolean
  photo_url: string|null; photo_url_2: string|null; photo_url_3: string|null
  notes: string|null
}

function fmtTime(t: string|null) { return t ? t.slice(0,5) : null }
function fmtTs(ts: string|null) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r }
function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function sameDay(a: string, b: string) { return a.slice(0,10) === b.slice(0,10) }

// El bucket `cleaning-photos` es privado: las fotos guardadas (URL o ruta) se sirven
// vía proxy que genera una signed URL. Los preview locales (data:) pasan tal cual.
function photoSrc(u: string|null|undefined): string {
  if (!u) return ''
  if (!u.includes('/cleaning-photos/')) return u
  return `/api/limpiadoras/photo?u=${encodeURIComponent(u)}`
}

// ─── PhotoSlot ───────────────────────────────────────────────────
function PhotoSlot({ sessionId, itemId, slot, url, color, onUploaded, disabled }:
  { sessionId:string; itemId:string; slot:number; url:string|null; color:string
    onUploaded:(url:string,slot:number)=>void; disabled?:boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [localUrl, setLocalUrl] = useState<string|null>(url)
  useEffect(() => { setLocalUrl(url) }, [url])

  async function handleFile(file: File) {
    setUploading(true)
    const reader = new FileReader()
    reader.onload = e => setLocalUrl(e.target?.result as string)
    reader.readAsDataURL(file)
    const form = new FormData()
    form.append('file', file); form.append('session_id', sessionId)
    form.append('item_id', itemId); form.append('slot', String(slot))
    try {
      const r = await fetch('/api/limpiadoras/upload-photo', { method:'POST', body:form })
      const d = await r.json()
      if (d.url) onUploaded(d.url, slot)
      else { alert('Error: '+(d.error||'?')); setLocalUrl(url) }
    } catch { alert('Error de red'); setLocalUrl(url) }
    finally { setUploading(false) }
  }

  return (
    <div style={{ position:'relative', flexShrink:0 }}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
        onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f) }} />
      {localUrl ? (
        <div onClick={() => !disabled && !uploading && inputRef.current?.click()}
          style={{width:72,height:72,borderRadius:10,overflow:'hidden',border:`2px solid ${color}`,position:'relative',cursor:disabled?'default':'pointer'}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc(localUrl)} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          {uploading && <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{color:'#fff',fontSize:18}}>⏳</span></div>}
          {!disabled && !uploading && <div style={{position:'absolute',bottom:2,right:2,background:color,borderRadius:6,padding:'1px 4px',fontSize:10,color:'#fff',fontWeight:700}}>✏️</div>}
        </div>
      ) : (
        <button onClick={() => !disabled && !uploading && inputRef.current?.click()} disabled={disabled||uploading}
          style={{width:72,height:72,borderRadius:10,border:`2px dashed ${disabled?'#d1d5db':color}`,background:disabled?'#f9fafb':color+'10',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:disabled?'default':'pointer',gap:2}}>
          <span style={{fontSize:uploading?20:24}}>{uploading?'⏳':'📷'}</span>
          <span style={{fontSize:9,color:disabled?'#9ca3af':color,fontWeight:600,lineHeight:1}}>{uploading?'Subiendo':slot===1?'Foto':`+${slot}ª`}</span>
        </button>
      )}
    </div>
  )
}

// ─── ChecklistView ───────────────────────────────────────────────
function ChecklistView({ session, onBack, onDone }:
  { session:Session; onBack:()=>void; onDone:()=>void }) {
  const prop = PROPS[session.property_id]
  const items = session.checklist_items || []
  const [completions, setCompletions] = useState<Record<string,Completion>>({})
  const [saving, setSaving] = useState<string|null>(null)
  const [finished, setFinished] = useState(!!session.completed_at)
  const [expandedItem, setExpandedItem] = useState<string|null>(null)
  const [view, setView] = useState<'checklist'|'incidencia'|'inventario'>('checklist')
  const [incTitulo, setIncTitulo] = useState('')
  const [incDesc, setIncDesc] = useState('')
  const [incCat, setIncCat] = useState('otro')
  const [incUrg, setIncUrg] = useState('normal')
  const [incPhoto, setIncPhoto] = useState<string|null>(null)
  const [savingInc, setSavingInc] = useState(false)
  const [inventario, setInventario] = useState<any[]>([])

  useEffect(() => {
    const map: Record<string,Completion> = {}
    ;(session.completions||[]).forEach(c=>{ map[c.item_id]=c })
    setCompletions(map)
  }, [session])

  const total = items.length
  const done  = items.filter(i=>completions[i.id]?.checked).length
  const pct   = total>0 ? Math.round(done/total*100) : 0
  const missingPhotos = items.filter(i=>i.requires_photo&&completions[i.id]?.checked&&!completions[i.id]?.photo_url)
  const canFinish = pct===100 && missingPhotos.length===0

  const grouped = items.reduce((acc,item)=>{
    if(!acc[item.frequency]) acc[item.frequency]=[]
    acc[item.frequency].push(item); return acc
  },{} as Record<string,CheckItem[]>)

  async function toggle(item: CheckItem) {
    if (finished) return
    const newChecked = !completions[item.id]?.checked
    const current = completions[item.id]||{item_id:item.id,checked:false,photo_url:null,photo_url_2:null,photo_url_3:null,notes:null}
    const updated = {...current,checked:newChecked}
    setCompletions(p=>({...p,[item.id]:updated}))
    setSaving(item.id)
    await fetch('/api/limpiadoras/complete',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:session.id,item_id:item.id,item_description:item.description,checked:newChecked,photo_url:updated.photo_url})})
    setSaving(null)
    if (newChecked&&item.requires_photo&&!updated.photo_url) setExpandedItem(item.id)
  }

  async function savePhoto(itemId:string,url:string,slot:number) {
    const current = completions[itemId]||{item_id:itemId,checked:true,photo_url:null,photo_url_2:null,photo_url_3:null,notes:null}
    const field = slot===1?'photo_url':slot===2?'photo_url_2':'photo_url_3'
    const updated = {...current,[field]:url}
    setCompletions(p=>({...p,[itemId]:updated}))
    await fetch('/api/limpiadoras/complete',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:session.id,item_id:itemId,
        item_description:items.find(i=>i.id===itemId)?.description||'',checked:current.checked,
        photo_url:slot===1?url:current.photo_url,photo_url_2:slot===2?url:current.photo_url_2,photo_url_3:slot===3?url:current.photo_url_3})})
  }

  async function finishSession() {
    await fetch('/api/limpiadoras/complete',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:session.id,item_id:'finish',item_description:'finish',checked:true})})
    setFinished(true); onDone()
  }

  async function submitIncidencia() {
    if (!incTitulo.trim()) return
    setSavingInc(true)
    await fetch('/api/limpiadoras/incidencias',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({property_id:session.property_id,session_id:session.id,
        titulo:incTitulo,descripcion:incDesc,categoria:incCat,urgencia:incUrg,photo_url:incPhoto})})
    setIncTitulo(''); setIncDesc(''); setIncPhoto(null); setSavingInc(false); setView('checklist')
  }

  async function loadInventario() {
    const r = await fetch(`/api/limpiadoras/inventario?property_id=${session.property_id}`)
    const d = await r.json(); setInventario(d.items||[])
    setView('inventario')
  }

  if (finished) return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center',background:'#f9fafb'}}>
      <div style={{fontSize:64,marginBottom:16}}>✅</div>
      <div style={{fontSize:22,fontWeight:800,color:prop.color,marginBottom:6}}>¡Limpieza completada!</div>
      <div style={{fontSize:13,color:'#6b7280',marginBottom:28}}>{prop.name} · {session.session_date.slice(0,10)}</div>
      {items.filter(i=>completions[i.id]?.photo_url).length>0 && (
        <div style={{width:'100%',background:'#e7f5ee',borderRadius:14,padding:16,marginBottom:16,border:`1px solid ${prop.color}30`}}>
          <div style={{fontSize:13,color:prop.color,fontWeight:700,marginBottom:8}}>📸 Fotos tomadas</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {items.filter(i=>completions[i.id]?.photo_url).map(i=>(
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i.id} src={photoSrc(completions[i.id].photo_url)} alt="" style={{width:64,height:64,borderRadius:8,objectFit:'cover'}}/>
            ))}
          </div>
        </div>
      )}
      <button onClick={onBack} style={{width:'100%',padding:'14px 0',borderRadius:14,background:prop.color,color:'#fff',fontWeight:700,fontSize:15,border:'none',cursor:'pointer'}}>Volver al calendario</button>
    </div>
  )

  // ── Incidencia view ──
  if (view==='incidencia') return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#fff',display:'flex',flexDirection:'column'}}>
      <div style={{padding:16,background:prop.color,color:'#fff'}}>
        <button onClick={()=>setView('checklist')} style={{background:'none',border:'none',color:'rgba(255,255,255,.75)',fontSize:13,cursor:'pointer',marginBottom:10,padding:0}}>← Volver</button>
        <div style={{fontWeight:800,fontSize:18}}>Nueva incidencia</div>
        <div style={{fontSize:12,opacity:.7}}>{prop.name}</div>
      </div>
      <div style={{flex:1,padding:16,display:'flex',flexDirection:'column',gap:10}}>
        <div>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:6,fontWeight:600}}>📷 Foto de la incidencia</div>
          <PhotoSlot sessionId={session.id} itemId={`inc_${Date.now()}`} slot={1}
            url={incPhoto} color={prop.color} onUploaded={(url)=>setIncPhoto(url)} />
        </div>
        <input value={incTitulo} onChange={e=>setIncTitulo(e.target.value)} placeholder="¿Qué has encontrado? *"
          style={{border:'1px solid #e5e7eb',borderRadius:12,padding:'12px 14px',fontSize:14,outline:'none'}}/>
        <textarea value={incDesc} onChange={e=>setIncDesc(e.target.value)} placeholder="Descripción (opcional)" rows={3}
          style={{border:'1px solid #e5e7eb',borderRadius:12,padding:'12px 14px',fontSize:14,resize:'none',outline:'none'}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <select value={incCat} onChange={e=>setIncCat(e.target.value)}
            style={{border:'1px solid #e5e7eb',borderRadius:10,padding:'10px',fontSize:13}}>
            {['electrodomestico','fontaneria','electricidad','mobiliario','limpieza','suministros','otro'].map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={incUrg} onChange={e=>setIncUrg(e.target.value)}
            style={{border:`1px solid ${incUrg==='urgente'?'#ef4444':'#e5e7eb'}`,borderRadius:10,padding:'10px',fontSize:13,fontWeight:incUrg==='urgente'?700:400}}>
            <option value="baja">🟢 Baja</option>
            <option value="normal">🟡 Normal</option>
            <option value="urgente">🔴 Urgente</option>
          </select>
        </div>
      </div>
      <div style={{padding:16,borderTop:'1px solid #f3f4f6'}}>
        <button onClick={submitIncidencia} disabled={savingInc||!incTitulo.trim()}
          style={{width:'100%',padding:'14px 0',borderRadius:14,border:'none',fontWeight:700,fontSize:15,cursor:'pointer',
            background:incUrg==='urgente'?'#dc2626':prop.color,color:'#fff',opacity:savingInc||!incTitulo.trim()?0.5:1}}>
          {savingInc?'Enviando...':incUrg==='urgente'?'🔴 Reportar URGENTE':'⚠️ Reportar incidencia'}
        </button>
      </div>
    </div>
  )

  // ── Inventario view ──
  if (view==='inventario') return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#fff',display:'flex',flexDirection:'column'}}>
      <div style={{padding:16,background:prop.color,color:'#fff'}}>
        <button onClick={()=>setView('checklist')} style={{background:'none',border:'none',color:'rgba(255,255,255,.75)',fontSize:13,cursor:'pointer',marginBottom:10,padding:0}}>← Volver</button>
        <div style={{fontWeight:800,fontSize:18}}>Inventario · {prop.name}</div>
      </div>
      <div style={{flex:1,padding:16,overflowY:'auto'}}>
        {inventario.map(item=>{
          const bajo = item.stock_actual<item.stock_minimo
          return (
            <div key={item.id} style={{background:bajo?'#fff7ed':'#fff',border:`1px solid ${bajo?'#fed7aa':'#e5e7eb'}`,borderRadius:12,padding:'12px 16px',marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{item.articulo}</div>
                  <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>Mín: {item.stock_minimo} {item.unidad}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:16,fontWeight:800,color:bajo?'#c2410c':'#111'}}>{item.stock_actual}</span>
                  {bajo && <span style={{fontSize:11,fontWeight:700,color:'#c2410c',background:'#fee2e2',borderRadius:6,padding:'2px 8px'}}>⚠️ Bajo</span>}
                </div>
              </div>
            </div>
          )
        })}
        {inventario.length===0 && <div style={{textAlign:'center',color:'#9ca3af',padding:32}}>Sin inventario configurado</div>}
      </div>
    </div>
  )

  // ── Checklist view ──
  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#fff',display:'flex',flexDirection:'column'}}>
      <div style={{padding:16,background:prop.color,color:'#fff'}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:'rgba(255,255,255,.75)',fontSize:13,cursor:'pointer',marginBottom:10,padding:0}}>← Calendario</button>
        <div style={{fontWeight:800,fontSize:18}}>{prop.name}</div>
        <div style={{fontSize:12,opacity:.75,marginTop:2}}>
          {new Date(session.session_date+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}
        </div>
        {session.nota_propietario && (
          <div style={{marginTop:10,background:'rgba(255,255,255,.18)',borderRadius:10,padding:'8px 12px',fontSize:12}}>📌 Alberto: {session.nota_propietario}</div>
        )}
        <div style={{marginTop:12}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,opacity:.85,marginBottom:5}}>
            <span>{done}/{total}</span><span style={{fontWeight:700}}>{pct}%</span>
          </div>
          <div style={{background:'rgba(255,255,255,.25)',borderRadius:8,height:8}}>
            <div style={{width:`${pct}%`,height:8,borderRadius:8,background:'#a3e635',transition:'width .4s'}}/>
          </div>
        </div>
      </div>

      <div style={{display:'flex',gap:8,padding:'10px 16px 0'}}>
        <button onClick={()=>setView('incidencia')}
          style={{flex:1,padding:'8px 0',border:'1px solid #fde68a',borderRadius:10,background:'#fef9c3',color:'#92400e',fontSize:12,fontWeight:600,cursor:'pointer'}}>
          ⚠️ Incidencia
        </button>
        <button onClick={loadInventario}
          style={{flex:1,padding:'8px 0',border:'1px solid #bfdbfe',borderRadius:10,background:'#eff6ff',color:'#1d4ed8',fontSize:12,fontWeight:600,cursor:'pointer'}}>
          📦 Inventario
        </button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'12px 16px 120px'}}>
        {(['per_change','weekly','monthly','one_time'] as const).map(freq=>{
          const freqItems=grouped[freq]; if(!freqItems?.length) return null
          return (
            <div key={freq} style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:1,color:'#9ca3af'}}>{FREQ[freq]}</span>
                <div style={{flex:1,height:1,background:'#f3f4f6'}}/>
              </div>
              {freqItems.map(item=>{
                const comp=completions[item.id]
                const checked=!!comp?.checked
                const hasPhoto=!!comp?.photo_url
                const needsPhoto=item.requires_photo&&checked&&!hasPhoto
                const isExpanded=expandedItem===item.id
                const isSaving=saving===item.id
                return (
                  <div key={item.id} style={{marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',borderRadius:14,
                      border:`1.5px solid ${needsPhoto?'#fcd34d':checked?prop.color+'40':'#f3f4f6'}`,
                      background:needsPhoto?'#fffbeb':checked?prop.color+'08':'#fafafa',cursor:isSaving?'default':'pointer'}}>
                      <button onClick={()=>toggle(item)} disabled={isSaving}
                        style={{width:28,height:28,borderRadius:8,border:`2px solid ${checked?prop.color:'#d1d5db'}`,
                          background:checked?prop.color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1,cursor:'pointer'}}>
                        {isSaving?<span style={{fontSize:12}}>⏳</span>:checked?<span style={{color:'#fff',fontSize:14,fontWeight:800}}>✓</span>:null}
                      </button>
                      <div style={{flex:1}} onClick={()=>checked&&setExpandedItem(isExpanded?null:item.id)}>
                        <div style={{fontSize:14,lineHeight:1.4,color:checked?'#9ca3af':'#111',textDecoration:checked&&!needsPhoto?'line-through':'none'}}>
                          {item.description}
                        </div>
                        <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                          {item.es_critico&&<span style={{fontSize:10,background:'#fee2e2',color:'#dc2626',borderRadius:6,padding:'1px 6px',fontWeight:700}}>🔴 Crítico</span>}
                          {item.requires_photo&&(
                            <span style={{fontSize:10,background:needsPhoto?'#fef3c7':hasPhoto?'#dcfce7':'#f3f4f6',
                              color:needsPhoto?'#92400e':hasPhoto?'#16a34a':'#6b7280',borderRadius:6,padding:'1px 6px',fontWeight:700}}>
                              {hasPhoto?'📸 Foto OK':needsPhoto?'📸 Falta':'📷 Requiere foto'}
                            </span>
                          )}
                        </div>
                      </div>
                      {checked&&(
                        <PhotoSlot sessionId={session.id} itemId={item.id} slot={1}
                          url={comp?.photo_url||null} color={prop.color}
                          onUploaded={(url,s)=>savePhoto(item.id,url,s)} disabled={finished}/>
                      )}
                    </div>
                    {isExpanded&&checked&&(
                      <div style={{background:'#f9fafb',borderRadius:'0 0 14px 14px',padding:12,border:`1.5px solid ${prop.color}30`,borderTop:'none',marginTop:-4}}>
                        {item.foto_referencia_url&&(
                          <div style={{marginBottom:10}}>
                            <div style={{fontSize:11,color:'#9ca3af',marginBottom:5,fontWeight:600}}>📋 Así debe quedar:</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoSrc(item.foto_referencia_url)} alt="" style={{width:'100%',maxHeight:160,objectFit:'cover',borderRadius:10}}/>
                          </div>
                        )}
                        <div style={{fontSize:11,color:'#9ca3af',marginBottom:8,fontWeight:600}}>📸 Fotos adicionales:</div>
                        <div style={{display:'flex',gap:8}}>
                          {[1,2,3].map(slot=>(
                            <PhotoSlot key={slot} sessionId={session.id} itemId={item.id} slot={slot}
                              url={slot===1?comp?.photo_url||null:slot===2?comp?.photo_url_2||null:comp?.photo_url_3||null}
                              color={prop.color} onUploaded={(url,s)=>savePhoto(item.id,url,s)} disabled={finished}/>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div style={{position:'fixed',bottom:0,left:0,right:0,padding:16,background:'#fff',borderTop:'1px solid #f3f4f6',maxWidth:480,margin:'0 auto'}}>
        {missingPhotos.length>0&&pct===100&&(
          <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:10,padding:'8px 12px',fontSize:12,color:'#92400e',marginBottom:10,textAlign:'center'}}>
            📸 Faltan fotos en {missingPhotos.length} ítem{missingPhotos.length>1?'s':''} obligatorio{missingPhotos.length>1?'s':''}
          </div>
        )}
        <button onClick={canFinish?finishSession:undefined} disabled={!canFinish}
          style={{width:'100%',padding:'15px 0',borderRadius:14,border:'none',background:canFinish?prop.color:'#e5e7eb',
            color:canFinish?'#fff':'#9ca3af',fontWeight:800,fontSize:16,cursor:canFinish?'pointer':'default',transition:'all .2s'}}>
          {pct<100?`Completa todos (${total-done} pendientes)`:missingPhotos.length>0?`Añade las fotos (${missingPhotos.length})`:'✓ Finalizar limpieza'}
        </button>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ────────────────────────────────────────────
export default function LimpiadoarasPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const [activeSession, setActiveSession] = useState<Session|null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [fichando, setFichando] = useState<string|null>(null)
  const today = isoDate(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    const base = addDays(new Date(), weekOffset*7)
    base.setDate(base.getDate()-base.getDay()+1)
    const from = isoDate(base); const to = isoDate(addDays(base,20))
    const r = await fetch(`/api/limpiadoras/sessions?from=${from}&to=${to}`)
    const d = await r.json()
    setSessions(d.sessions||[])
    setLoading(false)
  }, [weekOffset])

  useEffect(()=>{ load() }, [load])

  async function fichar(sessionId: string, tipo: 'entrada'|'salida') {
    setFichando(sessionId+tipo)
    const r = await fetch('/api/limpiadoras/fichar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:sessionId,tipo})})
    if (r.ok) {
      const d = await r.json()
      setSessions(prev=>prev.map(s=>s.id===sessionId?{...s,...d.session}:s))
    }
    setFichando(null)
  }

  async function handleEarlyCheckin(sessionId: string, status: 'accepted'|'declined', time: string|null) {
    await fetch('/api/limpiadoras/early-checkin',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:sessionId,status,early_time:time})})
    load()
  }

  const calStart = new Date()
  calStart.setDate(calStart.getDate()+weekOffset*7)
  const calDays = Array.from({length:14},(_,i)=>addDays(calStart,i))
  const daysSessions = sessions.filter(s=>sameDay(s.session_date,selectedDate))
  const allProps = Object.keys(PROPS)
  const pendingTotal = sessions.filter(s=>!s.completed_at&&s.session_date.slice(0,10)>=today).length
  const alertsTotal  = sessions.filter(s=>s.early_checkout_time).length
  const reqTotal     = sessions.filter(s=>s.early_checkin_status==='pending').length

  if (activeSession) return (
    <ChecklistView session={activeSession} onBack={()=>{setActiveSession(null);load()}} onDone={()=>{load()}}/>
  )

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#f9fafb',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{padding:'16px 16px 0',background:'linear-gradient(135deg,#1B4332,#2D6A4F)',color:'#fff'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
          <div>
            <div style={{fontSize:10,opacity:.65,textTransform:'uppercase',letterSpacing:2}}>HouseSevillana</div>
            <div style={{fontSize:20,fontWeight:800,marginTop:2}}>Mis limpiezas</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:10,opacity:.65}}>{new Date().toLocaleDateString('es-ES',{weekday:'short'})}</div>
            <div style={{fontSize:20,fontWeight:800}}>{new Date().toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,paddingBottom:16}}>
          {[{n:pendingTotal,l:'pendientes'},{n:alertsTotal,l:'⚡ alertas'},{n:reqTotal,l:'🔔 solicitudes'}].map((s,i)=>(
            <div key={i} style={{background:'rgba(255,255,255,.12)',borderRadius:12,padding:'10px 8px',textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:800}}>{s.n}</div>
              <div style={{fontSize:10,opacity:.8,marginTop:1}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {/* Calendario */}
        <div style={{background:'#fff',borderBottom:'1px solid #f3f4f6',padding:'12px 12px 8px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,paddingInline:4}}>
            <button onClick={()=>setWeekOffset(o=>o-1)} style={{background:'none',border:'1px solid #e5e7eb',borderRadius:8,padding:'4px 12px',fontSize:13,cursor:'pointer',color:'#374151'}}>‹</button>
            <span style={{fontSize:12,fontWeight:700,color:'#374151',textTransform:'capitalize'}}>
              {calDays[0].toLocaleDateString('es-ES',{month:'long',year:'numeric'})}
            </span>
            <button onClick={()=>setWeekOffset(o=>o+1)} style={{background:'none',border:'1px solid #e5e7eb',borderRadius:8,padding:'4px 12px',fontSize:13,cursor:'pointer',color:'#374151'}}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'56px repeat(14,1fr)'}}>
            <div/>
            {calDays.map(d=>{
              const iso=isoDate(d); const isToday=iso===today; const isSel=iso===selectedDate
              const hasCleaning=sessions.some(s=>sameDay(s.session_date,iso))
              return (
                <button key={iso} onClick={()=>setSelectedDate(iso)}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'4px 2px',borderRadius:10,border:'none',cursor:'pointer',
                    background:isSel?'#1B4332':isToday?'#dcfce7':'transparent',color:isSel?'#fff':isToday?'#1B4332':'#374151'}}>
                  <span style={{fontSize:9,opacity:.7,textTransform:'capitalize'}}>{d.toLocaleDateString('es-ES',{weekday:'narrow'})}</span>
                  <span style={{fontSize:13,fontWeight:700}}>{d.getDate()}</span>
                  {hasCleaning&&<div style={{width:5,height:5,borderRadius:'50%',background:isSel?'#a3e635':'#1B4332',marginTop:1}}/>}
                </button>
              )
            })}
          </div>
          <div style={{marginTop:6}}>
            {allProps.map(propId=>{
              const prop=PROPS[propId]
              return (
                <div key={propId} style={{display:'grid',gridTemplateColumns:'56px repeat(14,1fr)',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:700,color:prop.color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:4}}>{prop.short}</span>
                  {calDays.map(d=>{
                    const iso=isoDate(d)
                    const s=sessions.find(s=>s.property_id===propId&&sameDay(s.session_date,iso))
                    if(!s) return <div key={iso} style={{height:22,borderRadius:6,background:iso===selectedDate?'#f3f4f6':'transparent'}}/>
                    const isDone=!!s.completed_at; const hasAlert=!!s.early_checkout_time||s.early_checkin_status==='pending'
                    const reqPhoto=(s.checklist_items||[]).filter(i=>i.requires_photo)
                    const donePhoto=reqPhoto.filter(i=>(s.completions||[]).some(c=>c.item_id===i.id&&c.photo_url))
                    const missingPh=isDone&&reqPhoto.length>0&&donePhoto.length<reqPhoto.length
                    return (
                      <button key={iso} onClick={()=>{setSelectedDate(iso);setActiveSession(s)}}
                        style={{height:22,borderRadius:6,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,margin:'0 1px',
                          background:isDone?(missingPh?'#f59e0b':'#6b7280'):s.hora_llegada?'#a3e635':hasAlert?'#D97706':prop.color}}>
                        {isDone?(missingPh?'📸':'✓'):s.hora_llegada?'🧹':hasAlert?'⚡':'○'}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Detalle del día */}
        <div style={{padding:16}}>
          <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
            {new Date(selectedDate+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}
            {selectedDate===today&&<span style={{color:'#1B4332',marginLeft:8}}>· Hoy</span>}
          </div>
          {loading&&<div style={{textAlign:'center',padding:32,color:'#9ca3af'}}>Cargando...</div>}
          {!loading&&daysSessions.length===0&&(
            <div style={{background:'#fff',borderRadius:16,border:'1px solid #f3f4f6',padding:28,textAlign:'center',color:'#9ca3af',fontSize:14}}>Sin limpiezas este día 🎉</div>
          )}
          {daysSessions.map(s=>{
            const prop=PROPS[s.property_id]||{name:s.property_id,color:'#1B4332',short:'?'}
            const isDone=!!s.completed_at; const earlyOut=!!s.early_checkout_time
            const checkoutDisplay=fmtTime(s.early_checkout_time)||fmtTime(s.checkout_time)||'11:00'
            const checkinDisplay=s.early_checkin_status==='accepted'
              ?fmtTime(s.early_checkin_requested)||fmtTime(s.checkin_time)||'15:00'
              :fmtTime(s.checkin_time)||'15:00'
            const reqPhoto=(s.checklist_items||[]).filter(i=>i.requires_photo)
            const donePhoto=reqPhoto.filter(i=>(s.completions||[]).some(c=>c.item_id===i.id&&c.photo_url))
            const needsPhotos=isDone&&reqPhoto.length>0&&donePhoto.length<reqPhoto.length
            const isFichando=fichando===s.id+'entrada'

            return (
              <div key={s.id} style={{background:'#fff',borderRadius:18,border:'1px solid #f3f4f6',padding:16,marginBottom:12,opacity:isDone&&!needsPhotos?.75:1}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:prop.color}}>{prop.name}</div>
                    {s.guest_out&&<div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>Sale: {s.guest_out} · Entra: {s.guest_in||'—'}</div>}
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:20,background:isDone?'#dcfce7':s.hora_llegada?'#dbeafe':'#f3f4f6',color:isDone?'#16a34a':s.hora_llegada?'#1d4ed8':'#6b7280'}}>
                    {isDone?'✓ Hecho':s.hora_llegada?`En curso desde ${fmtTs(s.hora_llegada)}`:'Pendiente'}
                  </span>
                </div>

                {/* Timeline */}
                <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',background:'#f9fafb',borderRadius:12,padding:'10px 14px',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase',letterSpacing:.5}}>Salida</div>
                    <div style={{fontSize:22,fontWeight:800,color:earlyOut?'#d97706':'#111'}}>{checkoutDisplay}</div>
                    {earlyOut&&<div style={{fontSize:10,color:'#9ca3af',textDecoration:'line-through'}}>{fmtTime(s.checkout_time)}</div>}
                  </div>
                  <div style={{textAlign:'center',padding:'0 8px'}}>
                    <div style={{fontSize:10,color:'#9ca3af'}}>→</div>
                    <div style={{height:2,width:32,background:prop.color,borderRadius:2,marginTop:4}}/>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase',letterSpacing:.5}}>Entrada</div>
                    <div style={{fontSize:22,fontWeight:800,color:s.early_checkin_status==='accepted'?'#d97706':'#111'}}>{checkinDisplay}</div>
                  </div>
                </div>

                {/* FICHAJE */}
                {!isDone&&(
                  <div style={{marginBottom:10}}>
                    {!s.hora_llegada?(
                      <button onClick={()=>fichar(s.id,'entrada')} disabled={!!isFichando}
                        style={{width:'100%',padding:'10px 0',borderRadius:12,border:`2px solid ${prop.color}`,
                          background:'#fff',color:prop.color,fontWeight:700,fontSize:14,cursor:'pointer',opacity:isFichando?.6:1}}>
                        {isFichando?'Fichando...':'📍 Fichar llegada'}
                      </button>
                    ):(
                      <div style={{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:12,padding:'8px 14px',fontSize:13,color:'#1d4ed8',fontWeight:600,textAlign:'center'}}>
                        📍 Llegada fichada: {fmtTs(s.hora_llegada)}
                      </div>
                    )}
                  </div>
                )}
                {isDone&&s.hora_llegada&&s.hora_salida&&(
                  <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:12,padding:'8px 14px',marginBottom:10,fontSize:12,color:'#15803d',display:'flex',justifyContent:'space-between'}}>
                    <span>📍 {fmtTs(s.hora_llegada)}</span>
                    <span>→</span>
                    <span>🏁 {fmtTs(s.hora_salida)}</span>
                    <span style={{fontWeight:700}}>
                      {(()=>{const min=Math.round((new Date(s.hora_salida).getTime()-new Date(s.hora_llegada).getTime())/60000);return `${Math.floor(min/60)}h ${min%60}m`})()}
                    </span>
                  </div>
                )}

                {needsPhotos&&(
                  <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'8px 12px',marginBottom:10,fontSize:12,color:'#92400e'}}>
                    📸 Faltan {reqPhoto.length-donePhoto.length} fotos requeridas
                  </div>
                )}
                {s.nota_propietario&&(
                  <div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:10,padding:'8px 12px',marginBottom:10,fontSize:12,color:'#92400e'}}>
                    📌 <strong>Alberto:</strong> {s.nota_propietario}
                  </div>
                )}
                {earlyOut&&(
                  <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:'8px 12px',marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#c2410c',marginBottom:2}}>⚡ Salida anticipada</div>
                    <div style={{fontSize:12,color:'#374151'}}>Sale a las {fmtTime(s.early_checkout_time)}</div>
                  </div>
                )}
                {s.early_checkin_requested&&s.early_checkin_status==='pending'&&(
                  <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'10px 12px',marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#1d4ed8',marginBottom:6}}>🔔 Entrada anticipada solicitada — {fmtTime(s.early_checkin_requested)}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <button onClick={()=>handleEarlyCheckin(s.id,'accepted',fmtTime(s.early_checkin_requested))}
                        style={{padding:'8px 0',borderRadius:10,border:'none',background:prop.color,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>✓ Confirmar</button>
                      <button onClick={()=>handleEarlyCheckin(s.id,'declined',null)}
                        style={{padding:'8px 0',borderRadius:10,border:'1px solid #fca5a5',background:'#fff',color:'#dc2626',fontWeight:700,fontSize:13,cursor:'pointer'}}>✗ No es posible</button>
                    </div>
                  </div>
                )}
                {s.early_checkin_status==='accepted'&&(
                  <div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'8px 12px',marginBottom:10,fontSize:12,color:'#16a34a',fontWeight:600}}>
                    ✅ Entrada confirmada a las {fmtTime(s.early_checkin_requested)}
                  </div>
                )}

                {!isDone?(
                  <button onClick={()=>setActiveSession(s)} disabled={!s.hora_llegada}
                    style={{width:'100%',padding:'13px 0',borderRadius:14,border:'none',background:s.hora_llegada?prop.color:'#e5e7eb',color:s.hora_llegada?'#fff':'#9ca3af',fontWeight:800,fontSize:15,cursor:s.hora_llegada?'pointer':'default',marginTop:4}}>
                    {s.hora_llegada?'🧹 Continuar limpieza':'Ficha la llegada primero'}
                  </button>
                ):(
                  <button onClick={()=>setActiveSession(s)}
                    style={{width:'100%',padding:'11px 0',borderRadius:14,border:`2px solid ${prop.color}`,background:'#fff',color:prop.color,fontWeight:700,fontSize:14,cursor:'pointer',marginTop:4}}>
                    {needsPhotos?'📸 Añadir fotos':'🖨️ Ver resumen'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
