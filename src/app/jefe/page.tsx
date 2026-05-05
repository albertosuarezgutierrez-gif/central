'use client'
// ia.rest · Panel Jefe de Sala
// Vista de solo lectura + control de caja + mensajería
// Rol: jefe_sala (PIN 0000)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import SugerenciaButton from '@/components/SugerenciaButton'

const C = {
  paper:'#F6F1E7', paper2:'#EFE7D6', paper3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  red:'#D9442B', redS:'#F4D8CF',
  amber:'#E8A33B', amberS:'#F7E3B6',
  green:'#3F7D44', greenS:'#D4E4D2',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

type Tab = 'caja' | 'sala' | 'audit'

export default function JefeSalaPage() {
  const { session, checking } = useAuth('jefe_sala')
  const [tab, setTab] = useState<Tab>('sala')
  if (checking || !session) return <div style={{ minHeight:'100dvh', background:C.paper }}/>

  const logout = () => { localStorage.removeItem('ia_rest_session'); window.location.href='/login' }
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })

  return (
    <div style={{ minHeight:'100dvh', background:C.paper, fontFamily:SN, color:C.ink }}>
      <style>{`* { box-sizing:border-box; } @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@1,400;1,600&family=JetBrains+Mono:wght@400;500;600&display=swap');`}</style>
      <SugerenciaButton session={session} tema="light"/>

      {/* HEADER */}
      <div style={{ background:C.bone, borderBottom:`1px solid ${C.rule}`, padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:C.red }}>ia.rest</div>
          <div style={{ fontSize:11, color:C.ink4, marginTop:1 }}>Jefe de sala · {session.nombre}</div>
        </div>
        <button onClick={logout} style={{ padding:'6px 14px', background:'transparent', border:`1px solid ${C.rule}`, borderRadius:8, fontSize:12, color:C.ink3, cursor:'pointer' }}>
          Salir
        </button>
      </div>

      {/* TABS */}
      <div style={{ background:C.bone, borderBottom:`1px solid ${C.rule}`, display:'flex', gap:0 }}>
        {([
          { id:'sala',  label:'🍽 Sala' },
          { id:'caja',  label:'💰 Caja' },
          { id:'audit', label:'📋 Modificaciones' },
        ] as {id:Tab;label:string}[]).map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:'11px 18px', border:'none', borderBottom:tab===t.id?`2px solid ${C.red}`:'2px solid transparent', background:'transparent', fontSize:13, fontWeight:tab===t.id?700:400, color:tab===t.id?C.red:C.ink3, cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'20px 16px 60px' }}>
        {tab==='sala'  && <SalaJefeTab sh={sh}/>}
        {tab==='caja'  && <CajaJefeTab sh={sh}/>}
        {tab==='audit' && <AuditJefeTab sh={sh} restauranteId={session.restaurante_id}/>}
      </div>
    </div>
  )
}

/* ─── SALA: resumen de mesas activas ─────────────────────── */
function SalaJefeTab({ sh }: { sh: ()=>Record<string,string> }) {
  const [comandas, setComandas] = useState<{id:string;mesa:{codigo:string};camarero:{nombre:string};estado:string;tipo:string;created_at:string;items:{cantidad:number;nombre:string}[]}[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Reutilizamos la API de comandas activas
    const r = await fetch('/api/comandas/activas?todos=1', { headers: sh() })
    const d = await r.json()
    setComandas(d.comandas ?? [])
    setLoading(false)
  }, [sh])

  useEffect(() => { load(); const iv = setInterval(load, 30000); return ()=>clearInterval(iv) }, [load])

  const fmtMin = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    return s < 3600 ? `${Math.floor(s/60)}m` : `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:C.ink4,fontFamily:SM,fontSize:12}}>Cargando sala…</div>

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:C.ink3,textTransform:'uppercase',letterSpacing:'1px'}}>
          {comandas.length} comandas activas
        </div>
        <button onClick={load} style={{padding:'6px 12px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:7,fontSize:12,color:C.ink3,cursor:'pointer'}}>↺</button>
      </div>

      {comandas.length === 0 && (
        <div style={{padding:40,textAlign:'center',color:C.ink4,fontSize:14}}>Sin comandas activas ahora mismo</div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10}}>
        {comandas.map(c => {
          const mins = fmtMin(c.created_at)
          const urg = parseInt(mins) > 20 && mins.includes('m') && !mins.includes('h')
          return (
            <div key={c.id} style={{background:C.bone,border:`1px solid ${urg?C.red+'55':C.rule}`,borderRadius:10,padding:'12px 14px',borderLeft:`3px solid ${c.estado==='en_cocina'?C.amber:C.green}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink}}>{c.mesa?.codigo??'?'}</div>
                <div style={{fontFamily:SM,fontSize:11,color:urg?C.red:C.ink4}}>{mins}</div>
              </div>
              <div style={{fontSize:11,color:C.ink3,marginBottom:6}}>
                {c.camarero?.nombre ?? '—'}
              </div>
              {(c.items??[]).slice(0,3).map((it,i)=>(
                <div key={i} style={{display:'flex',gap:6,fontSize:12,color:C.ink2,marginBottom:2}}>
                  <span style={{fontFamily:SM,color:C.red,fontWeight:600,minWidth:18}}>{it.cantidad}×</span>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it.nombre}</span>
                </div>
              ))}
              {(c.items??[]).length>3 && <div style={{fontSize:10,color:C.ink4}}>+{c.items.length-3} más</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── CAJA: misma vista que owner pero solo lectura + movimientos ─ */
function CajaJefeTab({ sh }: { sh: ()=>Record<string,string> }) {
  const [data, setData] = useState<{
    turno:{id:string;nombre:string}|null
    movimientos:{id:string;tipo:string;concepto:string;importe:number;saldo_acumulado:number;camarero_nombre:string;mesa_label:string|null;created_at:string}[]
    resumen:{saldo_actual:number;cobros_efectivo:number;cambios:number;retiros:number;gastos:number;apertura:number}|null
  }|null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ tipo:'retiro', concepto:'', importe:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [cierreEfectivo, setCierreEfectivo] = useState('')
  const [cierreDesvio, setCierreDesvio] = useState<number|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja', { headers: sh() })
    setData(await r.json())
    setLoading(false)
  }, [sh])

  useEffect(()=>{ load() },[load])

  const fmtEur = (n:number) => `${n>=0?'':'-'}${Math.abs(n).toFixed(2).replace('.',',')} €`
  const fmtTime = (iso:string) => new Date(iso).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})

  const addMov = async () => {
    if (!form.concepto||!form.importe) return
    setSaving(true)
    await fetch('/api/caja',{method:'POST',headers:{...sh(),'Content-Type':'application/json'},body:JSON.stringify({tipo:form.tipo,concepto:form.concepto,importe:parseFloat(form.importe),notas:form.notas||undefined})})
    setForm({tipo:'retiro',concepto:'',importe:'',notas:''})
    setModalOpen(false); setSaving(false); load()
  }

  const TIPO_ICONO: Record<string,string> = {
    apertura:'🔓',cobro_efectivo:'💵',cambio:'🔄',retiro:'⬆',gasto:'🛒',ingreso_manual:'⬇',cierre:'🔒'
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:C.ink4,fontFamily:SM,fontSize:12}}>Cargando caja…</div>
  if (!data?.turno) return <div style={{padding:40,textAlign:'center',color:C.ink4}}>Sin turno activo</div>

  const { resumen, movimientos } = data
  const saldo = resumen?.saldo_actual ?? 0

  return (
    <div>
      {/* SALDO */}
      <div style={{background:saldo>=0?C.greenS:C.redS,border:`1px solid ${saldo>=0?C.green+'44':C.red+'44'}`,borderRadius:12,padding:'16px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:saldo>=0?C.green:C.red,marginBottom:4}}>Saldo en caja</div>
          <div style={{fontFamily:SM,fontSize:28,fontWeight:700,color:saldo>=0?C.green:C.red}}>{fmtEur(saldo)}</div>
        </div>
        <div style={{fontSize:36}}>{saldo>=0?'💰':'⚠️'}</div>
      </div>

      {/* MINI STATS */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
        {[
          {l:'Cobros',v:resumen?.cobros_efectivo??0,c:C.green},
          {l:'Cambios',v:-(resumen?.cambios??0),c:C.amber},
          {l:'Retiros',v:-(resumen?.retiros??0),c:C.red},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:C.ink4,marginBottom:3}}>{l}</div>
            <div style={{fontFamily:SM,fontSize:15,fontWeight:600,color:c}}>{fmtEur(v)}</div>
          </div>
        ))}
      </div>

      {/* ACCIONES */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap' as const}}>
        <button onClick={()=>setModalOpen(true)}
          style={{padding:'8px 14px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:13,fontWeight:600,color:C.ink,cursor:'pointer'}}>
          ＋ Movimiento
        </button>
        <button onClick={()=>{setCierreOpen(true);setCierreEfectivo('');setCierreDesvio(null)}}
          style={{padding:'8px 14px',background:C.redS,border:`1px solid ${C.red}44`,borderRadius:8,fontSize:13,fontWeight:600,color:C.red,cursor:'pointer'}}>
          🔒 Cierre
        </button>
        <button onClick={load}
          style={{padding:'8px 14px',background:C.paper2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:13,color:C.ink3,cursor:'pointer'}}>↺</button>
      </div>

      {/* MODAL MOVIMIENTO */}
      {modalOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:480,background:C.bone,borderRadius:16,padding:24}}>
            <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,marginBottom:14}}>Movimiento manual</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13}}>
                <option value="retiro">⬆ Retiro</option>
                <option value="gasto">🛒 Gasto</option>
                <option value="ingreso_manual">⬇ Ingreso manual</option>
                <option value="apertura">🔓 Fondo inicial</option>
              </select>
              <input placeholder="Concepto" value={form.concepto} onChange={e=>setForm(f=>({...f,concepto:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SN,fontSize:13}}/>
              <input type="number" inputMode="decimal" placeholder="Importe €" value={form.importe} onChange={e=>setForm(f=>({...f,importe:e.target.value}))}
                style={{padding:'9px 12px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SM,fontSize:18}}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setModalOpen(false)} style={{flex:1,padding:10,border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
                <button onClick={addMov} disabled={saving||!form.concepto||!form.importe}
                  style={{flex:2,padding:10,border:'none',borderRadius:8,background:C.red,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',opacity:saving?.6:1}}>
                  {saving?'…':'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CIERRE */}
      {cierreOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:480,background:C.bone,borderRadius:16,padding:24}}>
            <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,marginBottom:6}}>Cierre de caja</div>
            <div style={{fontSize:12,color:C.ink3,marginBottom:14}}>Saldo sistema: <strong style={{fontFamily:SM}}>{fmtEur(saldo)}</strong></div>
            <input type="number" inputMode="decimal" placeholder="Efectivo contado €" value={cierreEfectivo} onChange={e=>{setCierreEfectivo(e.target.value);setCierreDesvio(null)}}
              style={{width:'100%',padding:'12px 14px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper,fontFamily:SM,fontSize:20,marginBottom:10}}/>
            {cierreEfectivo && !cierreDesvio && (
              <button onClick={()=>setCierreDesvio(Math.round((parseFloat(cierreEfectivo)-saldo)*100)/100)}
                style={{width:'100%',padding:'10px',border:`1px solid ${C.rule}`,borderRadius:8,background:C.paper2,fontSize:13,fontWeight:600,marginBottom:10,cursor:'pointer'}}>
                Calcular desvío
              </button>
            )}
            {cierreDesvio!==null && (
              <div style={{padding:'12px 14px',borderRadius:10,background:Math.abs(cierreDesvio)<1?C.greenS:C.redS,marginBottom:10}}>
                <div style={{fontFamily:SM,fontSize:22,fontWeight:700,color:Math.abs(cierreDesvio)<1?C.green:C.red}}>
                  {Math.abs(cierreDesvio)<0.01?'✓ Cuadra':fmtEur(cierreDesvio)}
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setCierreOpen(false)} style={{flex:1,padding:10,border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',fontSize:13,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
              <button onClick={async()=>{
                await fetch('/api/caja',{method:'POST',headers:{...sh(),'Content-Type':'application/json'},body:JSON.stringify({tipo:'cierre',concepto:`Cierre · contado ${cierreEfectivo}€ · desvío ${cierreDesvio??0}€`,importe:0})})
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
        {movimientos.length===0 && <div style={{padding:20,textAlign:'center',color:C.ink4,fontSize:13}}>Sin movimientos</div>}
        {movimientos.map((m,i)=>(
          <div key={m.id} style={{padding:'10px 14px',borderBottom:i<movimientos.length-1?`1px solid ${C.rule}`:'none',display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:18,flexShrink:0}}>{TIPO_ICONO[m.tipo]??'·'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.concepto}</div>
              <div style={{fontSize:10,color:C.ink4}}>{m.camarero_nombre} · {fmtTime(m.created_at)}</div>
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

/* ─── AUDIT: modificaciones de comandas del turno ─────────── */
function AuditJefeTab({ sh, restauranteId }: { sh:()=>Record<string,string>; restauranteId:string }) {
  const [audit, setAudit] = useState<{id:string;accion:string;camarero_nombre:string;item_nombre:string|null;item_cantidad_antes:number|null;item_cantidad_despues:number|null;es_propietario:boolean;created_at:string}[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Traemos el audit log de toda la sesión de hoy del restaurante
    const r = await fetch(`/api/audit/resumen?restaurante_id=${restauranteId}`, { headers: sh() })
    const d = await r.json()
    setAudit(d.audit ?? [])
    setLoading(false)
  }, [sh, restauranteId])

  useEffect(()=>{ load() },[load])

  const fmtTime = (iso:string) => new Date(iso).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})

  if (loading) return <div style={{padding:40,textAlign:'center',color:C.ink4,fontFamily:SM,fontSize:12}}>Cargando historial…</div>

  const externas = audit.filter(a=>!a.es_propietario)

  return (
    <div>
      {externas.length > 0 && (
        <div style={{background:C.redS,border:`1px solid ${C.red}44`,borderRadius:10,padding:'12px 14px',marginBottom:16,display:'flex',gap:10,alignItems:'center'}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.red}}>{externas.length} modificación{externas.length>1?'es':''} por camarero ajeno</div>
            <div style={{fontSize:11,color:C.red,opacity:.8}}>Aparecen marcadas en rojo abajo</div>
          </div>
        </div>
      )}

      {audit.length === 0 && <div style={{padding:40,textAlign:'center',color:C.ink4,fontSize:14}}>Sin modificaciones registradas hoy</div>}

      <div style={{background:C.bone,border:`1px solid ${C.rule}`,borderRadius:12,overflow:'hidden'}}>
        {audit.map((a,i)=>(
          <div key={a.id} style={{padding:'10px 14px',borderBottom:i<audit.length-1?`1px solid ${C.rule}`:'none',display:'flex',alignItems:'flex-start',gap:10,background:!a.es_propietario?C.redS:'transparent'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:a.es_propietario?C.green:C.red,flexShrink:0,marginTop:4}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,fontWeight:600,color:a.es_propietario?C.ink:C.red}}>
                  {a.camarero_nombre}
                  {!a.es_propietario && <span style={{fontSize:9,fontWeight:700,marginLeft:6,padding:'1px 5px',background:C.red,borderRadius:3,color:'#fff'}}>AJENO</span>}
                </span>
                <span style={{fontFamily:SM,fontSize:9,color:C.ink4}}>{fmtTime(a.created_at)}</span>
              </div>
              <div style={{fontSize:11,color:C.ink3,marginTop:2}}>
                <span style={{fontFamily:SM,fontSize:9,textTransform:'uppercase',letterSpacing:'.5px'}}>{a.accion.replace('_',' ')}</span>
                {a.item_nombre && <span> · {a.item_nombre}</span>}
                {a.item_cantidad_antes!==null && a.item_cantidad_despues!==null && a.item_cantidad_antes!==a.item_cantidad_despues && (
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
