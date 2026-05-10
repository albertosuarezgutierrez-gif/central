'use client'
// ia.rest · Super Admin → Restaurante [id]
// Gestión completa de un restaurante desde el panel super admin
// 9 tabs: Vista · Carta · Mesas · Personal · Secciones · Impresoras · Facturas · Alertas · Config

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'

const C = {
  bg: '#14110E', bg2: '#1A1714', bg3: '#1F1A15',
  card: '#221D18', card2: '#2A231C',
  ink: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9A8D7C', ink4: '#6B5F52',
  rule: '#2E2720', ruleL: '#3A3028',
  red: '#D9442B', redD: '#A8311E', redS: 'rgba(217,68,43,0.12)',
  amber: '#E8A33B', amberS: 'rgba(232,163,59,0.12)',
  green: '#3F7D44', greenS: 'rgba(63,125,68,0.12)',
  blue: '#2B6A6E',
}
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

type TabId = 'vista'|'carta'|'mesas'|'personal'|'secciones'|'impresoras'|'facturas'|'alertas'|'config'
const TABS: {id:TabId; label:string}[] = [
  {id:'vista',      label:'Vista general'},
  {id:'carta',      label:'Carta'},
  {id:'mesas',      label:'Mesas'},
  {id:'personal',   label:'Personal'},
  {id:'secciones',  label:'Secciones'},
  {id:'impresoras', label:'Impresoras'},
  {id:'facturas',   label:'Facturas'},
  {id:'alertas',    label:'Alertas'},
  {id:'config',     label:'Config'},
]

function Badge({v,color}:{v:string|number;color:string}){
  return <span style={{background:`${color}22`,color,fontFamily:SM,fontSize:11,padding:'2px 8px',borderRadius:4,letterSpacing:'.06em'}}>{v}</span>
}
function Pill({ok}:{ok:boolean}){
  return <span style={{width:8,height:8,borderRadius:'50%',background:ok?C.green:C.red,display:'inline-block',marginRight:6}}/>
}

interface Restaurante {
  id: string; nombre: string; nombre_comercial: string; slug: string
  codigo_acceso: string; plan: string; plan_status: string; activo: boolean
  ciudad: string; nif: string; razon_social: string; created_at: string
}
interface Stats {
  camareros: number; mesas: number; comandas_hoy: number; ingresos_mes: number
  facturas: number; ultima_comanda: string | null
}

export default function SuperRestaurantePage() {
  const { session, checking } = useAuth(['super_admin'] as any)
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [tab, setTab] = useState<TabId>('vista')
  const [rest, setRest] = useState<Restaurante | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  // Carta
  const [productos, setProductos] = useState<any[]>([])
  // Mesas
  const [mesas, setMesas] = useState<any[]>([])
  // Personal
  const [camareros, setCamareros] = useState<any[]>([])
  // Facturas
  const [facturas, setFacturas] = useState<any[]>([])
  // Config form
  const [configForm, setConfigForm] = useState({ nif:'', razon_social:'', nombre_comercial:'', plan:'servicio', activo:true })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMsg, setConfigMsg] = useState('')
  // Cuenta (grupo multi-restaurante)
  const [cuentaData, setCuentaData] = useState<{ cuenta_id_actual:string|null; cuentas:{id:string;nombre:string;pin_cuenta:string;estado:string;num_restaurantes:number}[] } | null>(null)
  const [cuentaSelected, setCuentaSelected] = useState('')
  const [savingCuenta, setSavingCuenta] = useState(false)
  const [cuentaMsg, setCuentaMsg] = useState('')

  const hdrs = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-ia-session': JSON.stringify(session),
  }), [session])

  // Load restaurant
  useEffect(() => {
    if (!session || !id) return
    fetch(`/api/super/restaurantes/${id}/config`, { headers: hdrs() })
      .then(r => r.json())
      .then(d => {
        if (d.restaurante) {
          setRest(d.restaurante)
          setStats(d.stats || null)
          setConfigForm({
            nif: d.restaurante.nif || '',
            razon_social: d.restaurante.razon_social || '',
            nombre_comercial: d.restaurante.nombre_comercial || d.restaurante.nombre || '',
            plan: d.restaurante.plan || 'servicio',
            activo: d.restaurante.activo ?? true,
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, id, hdrs])

  // Load tab data lazily
  useEffect(() => {
    if (!session || !id) return
    if (tab === 'carta' && productos.length === 0) {
      fetch(`/api/owner/carta?restaurante_id=${id}`, { headers: hdrs() })
        .then(r => r.json()).then(d => setProductos(d.productos || []))
    }
    if (tab === 'mesas' && mesas.length === 0) {
      fetch(`/api/owner/mesas?restaurante_id=${id}`, { headers: hdrs() })
        .then(r => r.json()).then(d => setMesas(d.mesas || []))
    }
    if (tab === 'personal' && camareros.length === 0) {
      fetch(`/api/owner/personal?restaurante_id=${id}`, { headers: hdrs() })
        .then(r => r.json()).then(d => setCamareros(d.camareros || []))
    }
    if (tab === 'facturas' && facturas.length === 0) {
      fetch(`/api/owner/facturas?restaurante_id=${id}`, { headers: hdrs() })
        .then(r => r.json()).then(d => setFacturas(d.facturas || []))
    }
    if (tab === 'config' && !cuentaData) {
      fetch(`/api/super/restaurantes/${id}/cuenta`, { headers: hdrs() })
        .then(r => r.json())
        .then(d => { setCuentaData(d); setCuentaSelected(d.cuenta_id_actual ?? '') })
        .catch(() => {})
    }
  }, [tab, session, id, hdrs, productos.length, mesas.length, camareros.length, facturas.length, cuentaData])

  const saveConfig = async () => {
    setSavingConfig(true); setConfigMsg('')
    const r = await fetch(`/api/super/restaurantes/${id}/config`, {
      method: 'PUT', headers: hdrs(), body: JSON.stringify(configForm)
    })
    const d = await r.json()
    setConfigMsg(d.ok ? '✓ Guardado' : `Error: ${d.error}`)
    if (d.ok && rest) setRest({ ...rest, ...configForm })
    setSavingConfig(false)
    setTimeout(() => setConfigMsg(''), 3000)
  }

  const saveCuenta = async () => {
    if (!cuentaSelected || cuentaSelected === cuentaData?.cuenta_id_actual) return
    setSavingCuenta(true); setCuentaMsg('')
    const r = await fetch(`/api/super/restaurantes/${id}/cuenta`, {
      method: 'PATCH', headers: hdrs(), body: JSON.stringify({ cuenta_id: cuentaSelected })
    })
    const d = await r.json()
    if (d.ok) {
      setCuentaMsg(`✓ Asignado a "${d.cuenta_nombre}"`)
      setCuentaData(prev => prev ? { ...prev, cuenta_id_actual: cuentaSelected } : prev)
    } else {
      setCuentaMsg(`Error: ${d.error}`)
    }
    setSavingCuenta(false)
    setTimeout(() => setCuentaMsg(''), 4000)
  }

  const impersonate = async () => {
    const r = await fetch(`/api/super/restaurantes/${id}/impersonate`, { method: 'POST', headers: hdrs() })
    const d = await r.json()
    if (d.ok) {
      localStorage.setItem('ia_rest_session', JSON.stringify(d.session))
      window.open(d.redirect_to || '/owner', '_blank')
    }
  }

  if (checking || !session) return <div style={{minHeight:'100dvh',background:C.bg}}/>
  if (loading) return (
    <div style={{minHeight:'100dvh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{fontFamily:SM,fontSize:12,color:C.ink3,letterSpacing:'.12em'}}>CARGANDO…</span>
    </div>
  )

  const input = (val:string, onChange:(v:string)=>void, placeholder='') => (
    <input value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:'100%',background:C.card,border:`1px solid ${C.ruleL}`,borderRadius:6,
        padding:'10px 14px',fontFamily:SN,fontSize:14,color:C.ink,outline:'none',boxSizing:'border-box'}}/>
  )
  const label = (txt:string) => (
    <div style={{fontFamily:SM,fontSize:10,color:C.ink3,letterSpacing:'.1em',marginBottom:6}}>{txt}</div>
  )

  return (
    <div style={{minHeight:'100dvh',background:C.bg,color:C.ink,fontFamily:SN}}>
      {/* Top bar */}
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.rule}`,padding:'0 24px',display:'flex',alignItems:'center',gap:16,height:56}}>
        <button onClick={()=>router.push('/super')}
          style={{background:'none',border:'none',color:C.ink3,cursor:'pointer',fontFamily:SM,fontSize:11,letterSpacing:'.08em',display:'flex',alignItems:'center',gap:6}}>
          ← SUPER
        </button>
        <div style={{width:1,height:20,background:C.rule}}/>
        {rest && (
          <div style={{display:'flex',alignItems:'center',gap:12,flex:1}}>
            <Pill ok={rest.activo}/>
            <span style={{fontFamily:SE,fontSize:18,fontWeight:500}}>{rest.nombre_comercial || rest.nombre}</span>
            <Badge v={rest.plan?.toUpperCase()||'—'} color={C.amber}/>
            <Badge v={rest.codigo_acceso} color={C.blue}/>
          </div>
        )}
        <button onClick={impersonate}
          style={{background:C.red,border:'none',borderRadius:6,color:'#fff',padding:'8px 16px',
            fontFamily:SM,fontSize:11,letterSpacing:'.08em',cursor:'pointer'}}>
          ENTRAR COMO OWNER
        </button>
      </div>

      <div style={{display:'flex',height:'calc(100dvh - 56px)'}}>
        {/* Sidebar tabs */}
        <div style={{width:160,background:C.bg2,borderRight:`1px solid ${C.rule}`,flexShrink:0,paddingTop:8}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{width:'100%',textAlign:'left',background:tab===t.id?C.redS:'none',
                border:'none',borderLeft:`3px solid ${tab===t.id?C.red:'transparent'}`,
                color:tab===t.id?C.ink:C.ink3,padding:'12px 16px',cursor:'pointer',
                fontFamily:SN,fontSize:13,transition:'all .15s'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflow:'auto',padding:32}}>

          {/* ── VISTA GENERAL ── */}
          {tab==='vista' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 8px',color:C.ink}}>
                Vista general
              </h2>
              <p style={{color:C.ink3,fontSize:14,margin:'0 0 32px'}}>
                Resumen del restaurante desde el panel super admin
              </p>
              {stats && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:32}}>
                  {[
                    {l:'Camareros',v:stats.camareros,c:C.blue},
                    {l:'Mesas',v:stats.mesas,c:C.amber},
                    {l:'Comandas hoy',v:stats.comandas_hoy,c:C.green},
                    {l:'Ingresos mes',v:`${(stats.ingresos_mes||0).toFixed(2)} €`,c:C.red},
                    {l:'Facturas VeriFactu',v:stats.facturas,c:C.amber},
                    {l:'Última comanda',v:stats.ultima_comanda?new Date(stats.ultima_comanda).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}):'—',c:C.ink3},
                  ].map(m=>(
                    <div key={m.l} style={{background:C.card,borderRadius:8,padding:'20px 24px',border:`1px solid ${C.rule}`}}>
                      <div style={{fontFamily:SM,fontSize:10,color:C.ink4,letterSpacing:'.1em',marginBottom:8}}>{m.l.toUpperCase()}</div>
                      <div style={{fontFamily:SE,fontSize:36,fontWeight:500,color:m.c,lineHeight:1}}>{m.v}</div>
                    </div>
                  ))}
                </div>
              )}
              {rest && (
                <div style={{background:C.card,borderRadius:8,border:`1px solid ${C.rule}`,padding:24}}>
                  <div style={{fontFamily:SM,fontSize:10,color:C.ink4,letterSpacing:'.1em',marginBottom:16}}>DATOS DEL RESTAURANTE</div>
                  {[
                    ['ID Supabase', rest.id],
                    ['Slug / Código', `${rest.slug} · ${rest.codigo_acceso}`],
                    ['Ciudad', rest.ciudad || '—'],
                    ['NIF', rest.nif || '⚠ No configurado'],
                    ['Razón Social', rest.razon_social || '⚠ No configurado'],
                    ['Alta', new Date(rest.created_at).toLocaleDateString('es')],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:'flex',gap:16,padding:'8px 0',borderBottom:`1px solid ${C.rule}`}}>
                      <span style={{fontFamily:SM,fontSize:12,color:C.ink4,width:140,flexShrink:0}}>{k}</span>
                      <span style={{fontFamily:SM,fontSize:12,color:(v as string).includes('⚠')?C.amber:C.ink}}>{v as string}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CARTA ── */}
          {tab==='carta' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 24px',color:C.ink}}>Carta</h2>
              {productos.length===0
                ? <div style={{color:C.ink3,fontFamily:SM,fontSize:12}}>Sin productos cargados o acceso limitado.</div>
                : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
                    {productos.map((p:any)=>(
                      <div key={p.id} style={{background:C.card,borderRadius:8,border:`1px solid ${C.rule}`,padding:'16px 20px'}}>
                        <div style={{fontFamily:SN,fontSize:14,fontWeight:600,marginBottom:4}}>{p.nombre}</div>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <Badge v={`${p.precio?.toFixed(2)} €`} color={C.green}/>
                          {p.seccion_id && <Badge v={p.seccion_id} color={C.blue}/>}
                          {!p.activo && <Badge v='INACTIVO' color={C.ink3}/>}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

          {/* ── MESAS ── */}
          {tab==='mesas' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 24px',color:C.ink}}>Mesas</h2>
              {mesas.length===0
                ? <div style={{color:C.ink3,fontFamily:SM,fontSize:12}}>Sin mesas cargadas o acceso limitado.</div>
                : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
                    {mesas.map((m:any)=>(
                      <div key={m.id} style={{background:C.card,borderRadius:8,border:`1px solid ${C.rule}`,padding:'16px 20px'}}>
                        <div style={{fontFamily:SE,fontSize:28,fontWeight:500,marginBottom:4}}>{m.numero}</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          <Badge v={m.zona||'—'} color={C.ink3}/>
                          <Badge v={m.estado||'libre'} color={m.estado==='activa'?C.green:m.estado==='urgente'?C.red:C.ink3}/>
                          {m.capacidad && <Badge v={`${m.capacidad}p`} color={C.amber}/>}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

          {/* ── PERSONAL ── */}
          {tab==='personal' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 24px',color:C.ink}}>Personal</h2>
              {camareros.length===0
                ? <div style={{color:C.ink3,fontFamily:SM,fontSize:12}}>Sin usuarios cargados o acceso limitado.</div>
                : <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${C.rule}`}}>
                        {['Nombre','Rol','PIN','Activo','Sección'].map(h=>(
                          <th key={h} style={{fontFamily:SM,fontSize:10,color:C.ink4,letterSpacing:'.1em',padding:'8px 12px',textAlign:'left'}}>{h.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {camareros.map((c:any)=>(
                        <tr key={c.id} style={{borderBottom:`1px solid ${C.rule}`}}>
                          <td style={{padding:'12px',fontFamily:SN,fontSize:14}}>{c.nombre}</td>
                          <td style={{padding:'12px'}}><Badge v={c.rol} color={c.rol==='owner'?C.red:c.rol==='jefe_sala'?C.amber:C.blue}/></td>
                          <td style={{padding:'12px',fontFamily:SM,fontSize:12,color:C.ink3}}>{c.pin||'****'}</td>
                          <td style={{padding:'12px'}}><Pill ok={c.activo}/></td>
                          <td style={{padding:'12px',fontFamily:SM,fontSize:11,color:C.ink3}}>{c.seccion_id||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
          )}

          {/* ── SECCIONES ── */}
          {tab==='secciones' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 8px',color:C.ink}}>Secciones de cocina</h2>
              <p style={{color:C.ink3,fontSize:14,margin:'0 0 24px'}}>Gestión de partidas disponible en el panel Owner de este restaurante.</p>
              <div style={{background:C.card,borderRadius:8,border:`1px solid ${C.rule}`,padding:24}}>
                <div style={{fontFamily:SM,fontSize:11,color:C.ink3,marginBottom:16}}>IDs estándar del sistema</div>
                {[
                  {id:'calientes',nombre:'Cocina caliente',color:'#D9442B'},
                  {id:'frios',nombre:'Cocina fría',color:'#2B6A6E'},
                  {id:'barra',nombre:'Barra',color:'#E8A33B'},
                  {id:'postres',nombre:'Postres',color:'#9A8D7C'},
                  {id:'sala',nombre:'Sala',color:'#3F7D44'},
                ].map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`1px solid ${C.rule}`}}>
                    <span style={{width:12,height:12,borderRadius:3,background:s.color,display:'inline-block'}}/>
                    <span style={{fontFamily:SM,fontSize:12,color:C.ink4,width:100}}>{s.id}</span>
                    <span style={{fontFamily:SN,fontSize:14}}>{s.nombre}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── IMPRESORAS ── */}
          {tab==='impresoras' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 8px',color:C.ink}}>Impresoras</h2>
              <p style={{color:C.ink3,fontSize:14,margin:'0 0 24px'}}>Configuración disponible en el panel Owner → Impresoras.</p>
              <div style={{background:C.card,borderRadius:8,border:`1px solid ${C.rule}`,padding:24,maxWidth:500}}>
                <div style={{fontFamily:SM,fontSize:10,color:C.ink4,letterSpacing:'.1em',marginBottom:16}}>OPCIONES SOPORTADAS</div>
                {[
                  ['CloudPRNT','Star Micronics · Conexión nube via Vercel webhook'],
                  ['IP local','Epson TM-T20 · IP fija en red LAN del restaurante'],
                  ['Bridge Agent','Via app local hardware bridge (bridge_devices)'],
                ].map(([k,v])=>(
                  <div key={k} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:`1px solid ${C.rule}`}}>
                    <span style={{fontFamily:SM,fontSize:12,color:C.amber,width:120,flexShrink:0}}>{k}</span>
                    <span style={{fontFamily:SN,fontSize:13,color:C.ink2}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FACTURAS ── */}
          {tab==='facturas' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 8px',color:C.ink}}>Facturas VeriFactu</h2>
              <p style={{color:C.ink3,fontSize:14,margin:'0 0 24px'}}>Hash SHA-256 encadenado · QR AEAT · Obligatorio desde 2026</p>
              {facturas.length===0
                ? <div style={{color:C.ink3,fontFamily:SM,fontSize:12}}>Sin facturas o acceso limitado. Ver desde /owner → Facturas del restaurante.</div>
                : <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${C.rule}`}}>
                        {['Nº','Total','Fecha','Hash','QR'].map(h=>(
                          <th key={h} style={{fontFamily:SM,fontSize:10,color:C.ink4,letterSpacing:'.1em',padding:'8px 12px',textAlign:'left'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturas.slice(0,50).map((f:any)=>(
                        <tr key={f.id} style={{borderBottom:`1px solid ${C.rule}`}}>
                          <td style={{padding:'10px 12px',fontFamily:SM,fontSize:12}}>{f.numero_factura}</td>
                          <td style={{padding:'10px 12px',fontFamily:SM,fontSize:12,color:C.green}}>{f.total?.toFixed(2)} €</td>
                          <td style={{padding:'10px 12px',fontFamily:SM,fontSize:11,color:C.ink3}}>{new Date(f.created_at).toLocaleDateString('es')}</td>
                          <td style={{padding:'10px 12px',fontFamily:SM,fontSize:10,color:C.ink4,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.hash_factura?.slice(0,16)}…</td>
                          <td style={{padding:'10px 12px'}}>{f.qr_url?<a href={f.qr_url} target='_blank' style={{color:C.red,textDecoration:'none',fontFamily:SM,fontSize:11}}>VER</a>:'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
          )}

          {/* ── ALERTAS ── */}
          {tab==='alertas' && (
            <div>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 8px',color:C.ink}}>Alertas de ritmo</h2>
              <p style={{color:C.ink3,fontSize:14,margin:'0 0 24px'}}>Reglas evaluadas por alerta-ritmo-cron cada 2 minutos</p>
              <div style={{background:C.card,borderRadius:8,border:`1px solid ${C.rule}`,padding:24,maxWidth:600}}>
                <div style={{fontFamily:SM,fontSize:10,color:C.ink4,letterSpacing:'.1em',marginBottom:16}}>TIPOS DE CONDICIÓN DISPONIBLES (10)</div>
                {[
                  'tickets_por_hora · Nº comandas en la última hora',
                  'tiempo_medio_mesa · Tiempo medio por mesa activa',
                  'mesas_urgentes · Nº mesas en estado urgente',
                  'cola_cocina · Tickets pendientes en cocina',
                  'latencia_voz · Tiempo medio voz→ticket',
                  'mesa_sin_atender · Tiempo desde apertura sin comanda',
                  'producto_86_activo · Producto marcado como agotado',
                  'errores_brain · Comandas con error de interpretación',
                  'camarero_inactivo · Sin actividad en N minutos',
                  'factura_pendiente · Mesa con cuenta solicitada sin cobrar',
                ].map(t=>(
                  <div key={t} style={{padding:'8px 0',borderBottom:`1px solid ${C.rule}`,fontFamily:SM,fontSize:12,color:C.ink2}}>{t}</div>
                ))}
              </div>
              <p style={{color:C.ink3,fontSize:13,marginTop:16}}>Configurar reglas desde el panel Owner → Alertas de este restaurante.</p>
            </div>
          )}

          {/* ── CONFIG ── */}
          {tab==='config' && (
            <div style={{maxWidth:560}}>
              <h2 style={{fontFamily:SE,fontSize:32,fontWeight:500,margin:'0 0 8px',color:C.ink}}>Configuración</h2>
              <p style={{color:C.ink3,fontSize:14,margin:'0 0 32px'}}>Datos legales, plan y estado del restaurante</p>

              <div style={{display:'flex',flexDirection:'column',gap:20}}>
                <div>
                  {label('NOMBRE COMERCIAL')}
                  {input(configForm.nombre_comercial, v=>setConfigForm(f=>({...f,nombre_comercial:v})), 'Bodega La Plaza')}
                </div>
                <div>
                  {label('NIF / CIF')}
                  {input(configForm.nif, v=>setConfigForm(f=>({...f,nif:v})), 'B12345678')}
                </div>
                <div>
                  {label('RAZÓN SOCIAL (para VeriFactu)')}
                  {input(configForm.razon_social, v=>setConfigForm(f=>({...f,razon_social:v})), 'Restaurante Bodega La Plaza S.L.')}
                </div>
                <div>
                  {label('PLAN')}
                  <select value={configForm.plan} onChange={e=>setConfigForm(f=>({...f,plan:e.target.value}))}
                    style={{width:'100%',background:C.card,border:`1px solid ${C.ruleL}`,borderRadius:6,padding:'10px 14px',fontFamily:SN,fontSize:14,color:C.ink,outline:'none'}}>
                    <option value='barra'>BARRA · €59/mes · 1 camarero</option>
                    <option value='servicio'>SERVICIO · €99/mes · 4 camareros</option>
                    <option value='casa'>CASA · €169/mes · Ilimitado</option>
                  </select>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <button
                    onClick={()=>setConfigForm(f=>({...f,activo:!f.activo}))}
                    style={{background:configForm.activo?C.greenS:C.redS,border:`1px solid ${configForm.activo?C.green:C.red}`,
                      borderRadius:6,padding:'8px 16px',fontFamily:SM,fontSize:11,color:configForm.activo?C.green:C.red,cursor:'pointer',letterSpacing:'.08em'}}>
                    {configForm.activo ? '● ACTIVO' : '○ INACTIVO'}
                  </button>
                  <span style={{fontFamily:SN,fontSize:13,color:C.ink3}}>Click para {configForm.activo?'pausar':'activar'} el restaurante</span>
                </div>

                <button onClick={saveConfig} disabled={savingConfig}
                  style={{background:savingConfig?C.card:C.red,border:'none',borderRadius:8,color:'#fff',padding:'14px',
                    fontFamily:SM,fontSize:12,letterSpacing:'.1em',cursor:savingConfig?'wait':'pointer',marginTop:8}}>
                  {savingConfig ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}
                </button>
                {configMsg && <div style={{fontFamily:SM,fontSize:12,color:configMsg.includes('✓')?C.green:C.amber}}>{configMsg}</div>}

                {/* ── Grupo / Cuenta multi-restaurante ── */}
                <div style={{borderTop:`1px solid ${C.ruleL}`,paddingTop:24,marginTop:8}}>
                  <div style={{fontFamily:SM,fontSize:10,fontWeight:700,letterSpacing:'.12em',color:C.ink3,textTransform:'uppercase',marginBottom:16}}>
                    Grupo / Cuenta multi-restaurante
                  </div>
                  {!cuentaData ? (
                    <div style={{fontFamily:SM,fontSize:12,color:C.ink3}}>Cargando cuentas…</div>
                  ) : (
                    <>
                      <div style={{fontFamily:SN,fontSize:13,color:C.ink3,marginBottom:12}}>
                        Asigna este restaurante a una cuenta existente para que el dueño pueda ver todos sus locales desde un solo acceso.
                      </div>
                      <div style={{marginBottom:12}}>
                        {label('CUENTA ASIGNADA')}
                        <select value={cuentaSelected} onChange={e=>setCuentaSelected(e.target.value)}
                          style={{width:'100%',background:C.card,border:`1px solid ${C.ruleL}`,borderRadius:6,padding:'10px 14px',fontFamily:SN,fontSize:14,color:C.ink,outline:'none'}}>
                          <option value=''>— Sin asignar —</option>
                          {cuentaData.cuentas.map(c=>(
                            <option key={c.id} value={c.id}>
                              {c.nombre} · PIN {c.pin_cuenta} · {c.num_restaurantes} local{c.num_restaurantes!==1?'es':''} · {c.estado}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button onClick={saveCuenta}
                        disabled={savingCuenta || !cuentaSelected || cuentaSelected === cuentaData.cuenta_id_actual}
                        style={{background:C.ink,border:'none',borderRadius:6,color:C.bg,padding:'10px 20px',
                          fontFamily:SM,fontSize:11,letterSpacing:'.1em',cursor:'pointer',opacity:(!cuentaSelected||cuentaSelected===cuentaData.cuenta_id_actual)?0.4:1}}>
                        {savingCuenta ? 'ASIGNANDO…' : 'ASIGNAR A ESTA CUENTA'}
                      </button>
                      {cuentaMsg && <div style={{fontFamily:SM,fontSize:12,color:cuentaMsg.includes('✓')?C.green:C.amber,marginTop:8}}>{cuentaMsg}</div>}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
