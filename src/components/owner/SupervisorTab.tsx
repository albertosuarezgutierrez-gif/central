'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import React, { useState, useEffect, useCallback } from 'react'


// ─── Types ───────────────────────────────────────────────────────────────────
export interface AlertaRegla {
  id: string
  restaurante_id: string
  nombre: string
  activa: boolean
  condicion: string
  umbral_minutos: number
  objeto: string
  mensaje: string | null
  horario_desde: string | null
  horario_hasta: string | null
  dias_semana: number[] | null
  zona_ids: string[] | null
  destinatario_tipo: string
  camarero_id: string | null
  canal_vox: boolean
  canal_push: boolean
  canal_hub: boolean
  escalar_a: string | null
  escalar_minutos: number | null
  prioridad: number
  created_at: string
}

// ─── Catálogos ───────────────────────────────────────────────────────────────
const CONDICIONES = [
  { value: 'sin_comanda',        label: 'Mesa sin pedir',            objeto: 'mesa',          desc: 'Mesa activa sin ninguna comanda desde hace X min',              color: C.amber },
  { value: 'plato_sin_llegar',   label: 'Plato sin llegar',          objeto: 'comanda',        desc: 'Comanda confirmada, plato no servido al cliente',               color: C.red   },
  { value: 'ticket_sin_tocar',   label: 'Ticket cocina sin tocar',   objeto: 'ticket_cocina',  desc: 'Ticket en KDS sin marcar ningún ítem',                          color: C.red   },
  { value: 'cuenta_sin_cobrar',  label: 'Cuenta sin cobrar',         objeto: 'cuenta',         desc: 'Cuenta pedida, sin pago cerrado',                               color: C.amber },
  { value: 'rotacion_larga',     label: 'Mesa tiempo total',         objeto: 'mesa',           desc: 'Mesa ocupada más de X min en total (rotación)',                 color: C.ink3  },
  { value: 'cuentas_simultaneas',label: 'Pico de cuentas',           objeto: 'cuenta',         desc: 'X o más mesas piden cuenta en <5 min (umbral = mínimo)',       color: C.ink3  },
]

const DESTINATARIOS = [
  { value: 'camarero_asignado', label: 'Camarero asignado a la mesa' },
  { value: 'todos_turno',       label: 'Todos los camareros en turno' },
  { value: 'jefe_sala',         label: 'Jefe de sala' },
  { value: 'cocina',            label: 'Cocina' },
  { value: 'owner',             label: 'Owner (aunque no esté en el local)' },
]

const DIAS_LABEL = ['L','M','X','J','V','S','D']
const DIAS_FULL  = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']

const MSG_DEFAULT: Record<string,string> = {
  sin_comanda:        'Mesa {mesa} lleva {tiempo} min sin pedir',
  plato_sin_llegar:   'Mesa {mesa} lleva {tiempo} min esperando plato',
  ticket_sin_tocar:   'Ticket {mesa} lleva {tiempo} min en cocina sin tocar',
  cuenta_sin_cobrar:  'Mesa {mesa} lleva {tiempo} min esperando cobro',
  rotacion_larga:     'Mesa {mesa} lleva {tiempo} min ocupada',
  cuentas_simultaneas:'{n} mesas pidieron cuenta en los últimos 5 min',
}

const REGLA_NUEVA: Omit<AlertaRegla,'id'|'restaurante_id'|'created_at'> = {
  nombre:'', activa:true,
  condicion:'sin_comanda', umbral_minutos:10, objeto:'mesa',
  mensaje: null,
  horario_desde:null, horario_hasta:null, dias_semana:null, zona_ids:null,
  destinatario_tipo:'camarero_asignado', camarero_id:null,
  canal_vox:false, canal_push:true, canal_hub:false,
  escalar_a:null, escalar_minutos:null, prioridad:0,
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const condInfo = (v:string) => CONDICIONES.find(c=>c.value===v) ?? CONDICIONES[0]
const destLabel = (v:string) => DESTINATARIOS.find(d=>d.value===v)?.label ?? v

// ─── Pequeños componentes ─────────────────────────────────────────────────────
function Chip({children,color=C.paper2,border=C.rule}:{children:React.ReactNode;color?:string;border?:string}) {
  return <span style={{fontFamily:SM,fontSize:10,fontWeight:600,letterSpacing:'.07em',background:color,color:C.ink2,padding:'2px 7px',borderRadius:999,border:`1px solid ${border}`,whiteSpace:'nowrap',display:'inline-block'}}>{children}</span>
}

function Toggle({on,onChange}:{on:boolean;onChange:(v:boolean)=>void}) {
  return (
    <button onClick={()=>onChange(!on)} title={on?'Activa — clic para desactivar':'Inactiva — clic para activar'}
      style={{width:38,height:22,borderRadius:11,border:'none',cursor:'pointer',background:on?C.green:C.rule,position:'relative',transition:'background .2s',flexShrink:0}}>
      <span style={{position:'absolute',top:3,left:on?19:3,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)',display:'block'}}/>
    </button>
  )
}

function Label({children}:{children:React.ReactNode}) {
  return <label style={{fontFamily:SN,fontSize:11,fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',color:C.ink3,display:'block',marginBottom:4}}>{children}</label>
}

function FInput({value,onChange,type='text',min,max,placeholder,style}:{value:string|number;onChange:(v:string)=>void;type?:string;min?:number;max?:number;placeholder?:string;style?:React.CSSProperties}) {
  return <input type={type} value={value} min={min} max={max} placeholder={placeholder} onChange={e=>onChange(e.target.value)}
    style={{fontFamily:type==='number'?SM:SN,fontSize:13,background:C.bone,border:`1px solid ${C.rule}`,borderRadius:4,padding:'7px 10px',color:C.ink,outline:'none',width:'100%',...style}}/>
}

function FSelect({value,onChange,children}:{value:string;onChange:(v:string)=>void;children:React.ReactNode}) {
  return <select value={value} onChange={e=>onChange(e.target.value)}
    style={{fontFamily:SN,fontSize:13,background:C.bone,border:`1px solid ${C.rule}`,borderRadius:4,padding:'7px 10px',color:C.ink,outline:'none',width:'100%'}}>{children}</select>
}

function FCheck({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}) {
  return (
    <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontFamily:SN,fontSize:13,color:C.ink2}}>
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}
        style={{width:14,height:14,accentColor:C.red,cursor:'pointer'}}/>
      {label}
    </label>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────
function ReglaEditor({regla,onSave,onCancel,saving,error}:{
  regla:Partial<AlertaRegla>;onSave:(r:Partial<AlertaRegla>)=>void;
  onCancel:()=>void;saving:boolean;error:string|null
}) {
  const [f,setF] = useState<Partial<AlertaRegla>>(regla)
  const set = (k:keyof AlertaRegla, v:unknown) => setF(p=>({...p,[k]:v}))

  const handleCondicion = (v:string) => {
    const info = CONDICIONES.find(c=>c.value===v)
    set('condicion',v)
    if(info) set('objeto',info.objeto)
    if(!f.mensaje) set('mensaje', MSG_DEFAULT[v] ?? '')
  }

  const cInfo = condInfo(f.condicion ?? 'sin_comanda')

  return (
    <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:20,display:'flex',flexDirection:'column',gap:14}}>
      {/* Nombre */}
      <div><Label>Nombre de la regla</Label><FInput value={f.nombre??''} onChange={v=>set('nombre',v)} placeholder="ej: Plato lento viernes noche"/></div>

      {/* Condición */}
      <div>
        <Label>¿Qué vigilar?</Label>
        <FSelect value={f.condicion??'sin_comanda'} onChange={handleCondicion}>
          {CONDICIONES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </FSelect>
        <span style={{fontFamily:SC,fontSize:12,color:C.ink4,marginTop:3,display:'block'}}>{cInfo.desc}</span>
      </div>

      {/* Umbral */}
      <div>
        <Label>{f.condicion==='cuentas_simultaneas'?'Mínimo de cuentas simultáneas':'Umbral (minutos)'}</Label>
        <FInput type="number" min={1} max={999} value={f.umbral_minutos??10} onChange={v=>set('umbral_minutos',parseInt(v)||1)} style={{maxWidth:100}}/>
      </div>

      {/* Horario */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div><Label>Solo desde (hora)</Label><FInput type="time" value={f.horario_desde??''} onChange={v=>set('horario_desde',v||null)}/></div>
        <div><Label>Solo hasta (hora)</Label><FInput type="time" value={f.horario_hasta??''} onChange={v=>set('horario_hasta',v||null)}/></div>
      </div>

      {/* Días */}
      <div>
        <Label>Días (vacío = todos)</Label>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {DIAS_LABEL.map((d,i)=>{
            const n=i+1; const active=(f.dias_semana??[]).includes(n)
            return <button key={n} title={DIAS_FULL[i]} onClick={()=>{
              const curr=f.dias_semana??[]; const next=active?curr.filter(x=>x!==n):[...curr,n].sort()
              set('dias_semana',next.length===0?null:next)
            }} style={{width:32,height:32,borderRadius:'50%',border:`1px solid ${active?C.red:C.rule}`,background:active?C.redS:C.bone,color:active?C.red:C.ink3,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all .15s'}}>{d}</button>
          })}
        </div>
      </div>

      {/* Destinatario */}
      <div>
        <Label>¿A quién avisar?</Label>
        <FSelect value={f.destinatario_tipo??'camarero_asignado'} onChange={v=>set('destinatario_tipo',v)}>
          {DESTINATARIOS.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
        </FSelect>
      </div>

      {/* Canales */}
      <div>
        <Label>¿Cómo avisar?</Label>
        <div style={{display:'flex',gap:16,flexWrap:'wrap',padding:'8px 0'}}>
          <FCheck label="Push al móvil"    checked={f.canal_push??true}  onChange={v=>set('canal_push',v)}/>
          <FCheck label="Voz en el device" checked={f.canal_vox??false}  onChange={v=>set('canal_vox',v)}/>
          <FCheck label="Control Hub"      checked={f.canal_hub??false}  onChange={v=>set('canal_hub',v)}/>
        </div>
      </div>

      {/* Mensaje */}
      <div>
        <Label>Mensaje (variables: {'{mesa} {tiempo} {plato} {n}'})</Label>
        <FInput value={f.mensaje??''} onChange={v=>set('mensaje',v)} placeholder={MSG_DEFAULT[f.condicion??'sin_comanda']??''}/>
      </div>

      {/* Escalado */}
      <div style={{background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:6,padding:'12px 14px',display:'flex',flexDirection:'column',gap:8}}>
        <span style={{fontFamily:SN,fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.ink3}}>Escalado (opcional)</span>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <Label>Si no se atiende, escalar a:</Label>
            <FSelect value={f.escalar_a??''} onChange={v=>set('escalar_a',v||null)}>
              <option value="">Sin escalado</option>
              {DESTINATARIOS.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
            </FSelect>
          </div>
          {f.escalar_a && (
            <div><Label>En (min)</Label><FInput type="number" min={1} max={60} value={f.escalar_minutos??5} onChange={v=>set('escalar_minutos',parseInt(v)||5)} style={{maxWidth:80}}/></div>
          )}
        </div>
      </div>

      {error && <div style={{background:C.redS,border:`1px solid ${C.red}`,borderRadius:4,padding:'8px 12px',fontFamily:SN,fontSize:13,color:C.redD}}>{error}</div>}

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:4}}>
        <button onClick={onCancel} disabled={saving} style={{fontFamily:SN,fontSize:13,fontWeight:600,padding:'8px 16px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:4,color:C.ink2,cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>onSave(f)} disabled={saving||!f.nombre?.trim()} style={{fontFamily:SN,fontSize:13,fontWeight:600,padding:'8px 16px',background:saving?C.rule:C.dark,border:'none',borderRadius:4,color:saving?C.ink2:C.darkFg,cursor:saving?'wait':'pointer',opacity:!f.nombre?.trim()?.5:1}}>
          {saving?'Guardando…':'Guardar regla'}
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────
function ReglaCard({regla,onToggle,onEdit,onDelete,canDelete}:{
  regla:AlertaRegla;onToggle:(r:AlertaRegla)=>void;onEdit:(r:AlertaRegla)=>void;
  onDelete:(r:AlertaRegla)=>void;canDelete:boolean
}) {
  const cInfo = condInfo(regla.condicion)
  const accent = regla.activa ? cInfo.color : C.ink4
  const canales = [regla.canal_push&&'push', regla.canal_vox&&'voz', regla.canal_hub&&'hub'].filter(Boolean).join(' + ')

  return (
    <div style={{border:`1px solid ${C.rule}`,borderLeft:`3px solid ${accent}`,borderRadius:8,overflow:'hidden',background:regla.activa?C.bone:C.paper2,opacity:regla.activa?1:.65,transition:'all .2s'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:`1px solid ${C.rule}`,background:C.paper2}}>
        <Toggle on={regla.activa} onChange={()=>onToggle(regla)}/>
        <span style={{fontFamily:SN,fontSize:14,fontWeight:600,color:C.ink,flex:1}}>{regla.nombre}</span>
        <Chip color={regla.activa?C.amberS:C.paper3}>{regla.condicion.replace(/_/g,' ')}</Chip>
        <button onClick={()=>onEdit(regla)} style={{background:'transparent',border:'none',cursor:'pointer',color:C.ink3,padding:4,borderRadius:4,display:'flex',alignItems:'center'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        {canDelete && (
          <button onClick={()=>onDelete(regla)} style={{background:'transparent',border:'none',cursor:'pointer',color:C.ink4,padding:4,borderRadius:4,display:'flex',alignItems:'center'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        )}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'10px 16px',alignItems:'center'}}>
        <span style={{fontFamily:SM,fontSize:11,color:C.ink3}}>{regla.umbral_minutos} min</span>
        <span style={{color:C.rule}}>·</span>
        <span style={{fontFamily:SN,fontSize:12,color:C.ink3}}>→ {destLabel(regla.destinatario_tipo)}</span>
        {canales && <><span style={{color:C.rule}}>·</span><Chip>{canales}</Chip></>}
        {(regla.horario_desde||regla.horario_hasta) && <><span style={{color:C.rule}}>·</span><span style={{fontFamily:SM,fontSize:11,color:C.ink4}}>{regla.horario_desde??'00:00'} – {regla.horario_hasta??'23:59'}</span></>}
        {regla.dias_semana && regla.dias_semana.length<7 && <><span style={{color:C.rule}}>·</span><span style={{fontFamily:SM,fontSize:11,color:C.ink4}}>{regla.dias_semana.map(d=>DIAS_LABEL[d-1]).join(' · ')}</span></>}
        {regla.escalar_a && <><span style={{color:C.rule}}>·</span><span style={{fontFamily:SN,fontSize:11,color:C.ink4}}>escala → {destLabel(regla.escalar_a)} en {regla.escalar_minutos} min</span></>}
      </div>
      {regla.mensaje && (
        <div style={{padding:'6px 16px 10px',borderTop:`1px solid ${C.rule}`}}>
          <span style={{fontFamily:SC,fontSize:13,color:C.ink3}}>"{regla.mensaje}"</span>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SupervisorTab({rol,restauranteId,sh}:{rol:string;restauranteId:string;sh?:()=>Record<string,string>}) {
  const [reglas, setReglas] = useState<AlertaRegla[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editando, setEditando] = useState<AlertaRegla|null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)

  const canDelete = ['owner','super_admin'].includes(rol)

  const headers = useCallback(():Record<string,string> => sh ? sh() : {'Content-Type':'application/json'}, [sh])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/owner/supervisor', { headers: headers() })
      const json = await res.json()
      if (res.ok) setReglas(json.reglas ?? [])
    } finally { setLoading(false) }
  }, [headers])

  useEffect(() => { load() }, [load])

  async function handleToggle(regla:AlertaRegla) {
    await fetch('/api/owner/supervisor', {
      method:'PUT', headers:{...headers(),'Content-Type':'application/json'},
      body: JSON.stringify({id:regla.id, activa:!regla.activa}),
    })
    await load()
  }

  async function handleSave(form:Partial<AlertaRegla>) {
    setSaving(true); setError(null)
    const isEdit = !!editando
    const res = await fetch('/api/owner/supervisor', {
      method:isEdit?'PUT':'POST', headers:{...headers(),'Content-Type':'application/json'},
      body: JSON.stringify(isEdit ? {...form, id:editando!.id} : form),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Error guardando'); setSaving(false); return }
    setCreating(false); setEditando(null); setSaving(false)
    await load()
  }

  async function handleDelete(regla:AlertaRegla) {
    if (!confirm(`¿Eliminar "${regla.nombre}"? No se puede deshacer.`)) return
    await fetch(`/api/owner/supervisor?id=${regla.id}`, {method:'DELETE',headers:headers()})
    await load()
  }

  const activas = reglas.filter(r=>r.activa).length

  return (
    <div style={{fontFamily:SN}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{fontFamily:SE,fontSize:22,fontStyle:'italic',color:C.ink,margin:'0 0 4px'}}>Supervisor de tiempos</h2>
          <p style={{fontFamily:SN,fontSize:13,color:C.ink3,margin:0}}>
            {loading?'…':`${activas} regla${activas!==1?'s':''} activa${activas!==1?'s':''} de ${reglas.length}`}
            {' · '}Owner y jefe de sala comparten las mismas reglas en tiempo real
          </p>
        </div>
        <button onClick={()=>{setCreating(true);setEditando(null)}} disabled={creating||!!editando}
          style={{display:'flex',alignItems:'center',gap:6,background:C.dark,border:'none',borderRadius:6,color:C.darkFg,fontFamily:SN,fontSize:13,fontWeight:600,padding:'9px 16px',cursor:'pointer',opacity:creating||editando?.4:1}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Nueva regla
        </button>
      </div>

      <div style={{background:C.greenS,border:`1px solid #B8D9BB`,borderRadius:6,padding:'10px 14px',marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3"/></svg>
        <span style={{fontFamily:SN,fontSize:12,color:C.green,fontWeight:600}}>Fuente única · Los cambios son visibles para owner y jefe de sala al instante</span>
      </div>

      {creating && !editando && (
        <div style={{marginBottom:16}}>
          <ReglaEditor regla={REGLA_NUEVA} onSave={handleSave} onCancel={()=>{setCreating(false);setError(null)}} saving={saving} error={error}/>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:C.ink4,fontFamily:SC,fontSize:16}}>Cargando reglas…</div>
      ) : reglas.length===0 && !creating ? (
        <div style={{border:`1px dashed ${C.rule}`,borderRadius:8,padding:32,textAlign:'center'}}>
          <p style={{fontFamily:SC,fontSize:18,color:C.ink3,margin:'0 0 8px'}}>Sin reglas configuradas</p>
          <p style={{fontFamily:SN,fontSize:13,color:C.ink4,margin:0}}>Pulsa "Nueva regla" para crear la primera</p>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {reglas.map(r => editando?.id===r.id ? (
            <div key={r.id}>
              <ReglaEditor regla={editando} onSave={handleSave} onCancel={()=>{setEditando(null);setError(null)}} saving={saving} error={error}/>
            </div>
          ) : (
            <ReglaCard key={r.id} regla={r} onToggle={handleToggle}
              onEdit={r=>{setEditando(r);setCreating(false)}}
              onDelete={handleDelete} canDelete={canDelete}/>
          ))}
        </div>
      )}

      {reglas.length>0 && (
        <div style={{marginTop:24,padding:'14px 16px',background:C.paper2,borderRadius:8,border:`1px solid ${C.rule}`}}>
          <p style={{fontFamily:SN,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:C.ink3,margin:'0 0 8px'}}>Variables en el mensaje</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {['{mesa}','{tiempo}','{plato}','{n}','{camarero}'].map(v=><Chip key={v}>{v}</Chip>)}
          </div>
        </div>
      )}
    </div>
  )
}
