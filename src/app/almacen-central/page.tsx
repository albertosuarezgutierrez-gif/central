'use client'
// src/app/almacen-central/page.tsx
// Portal de almacén centralizado para grupos — gestión multi-local

import { useState, useEffect, useCallback } from 'react'

const C = {
  bg:'#14110E', bg2:'#1E1A15', bg3:'#2A221A',
  red:'#D9442B', ink:'#F6F1E7', ink2:'#D8CDB6',
  ink3:'#9C8E7E', ink4:'#6B5F52', rule:'#2E2720',
  green:'#3F7D44', amber:'#E8A33B', blue:'#3B82F6',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'

type Session = { contable_id:string; nombre:string; nombre_empresa?:string|null; email:string; restaurantes:{id:string;nombre:string;ciudad?:string;permisos:string[]}[] }
type Restaurante = { id:string; nombre:string; ciudad?:string; articulos_criticos:number; articulos_agotados:number; valor_stock_eur:number; pedidos_pendientes:number; esperando_asn:number; ultima_recepcion:string|null; top_criticos:{nombre:string;stock_actual:number;stock_minimo:number;unidad:string;proveedor?:string|null;proveedor_id?:string|null;necesario:number}[]; alertas:string[] }
type Totales = { criticos:number; agotados:number; valor_total:number; pedidos_pendientes:number; num_restaurantes:number }
type OportunidadGrupal = { nombre:string; locales:string[]; total_necesario:number; proveedor_nombre?:string|null; proveedor_id?:string|null }
type DetalleRest = { resumen:{total_articulos:number;criticos:number;agotados:number;ok:number;valor_stock_eur:number}; stock_critico:{id:string;nombre:string;stock_actual:number;stock_minimo:number;unidad:string;proveedor?:string|null;proveedor_id?:string|null;necesario:number}[]; pedidos_activos:{id:string;proveedor_nombre:string;cantidad:number;unidad_compra:string;estado:string;created_at:string;asn_subido_at:string|null}[] }

export default function AlmacenCentralPage() {
  const [session,    setSession]   = useState<Session|null>(null)
  const [loginEmail, setEmail]     = useState('')
  const [loginPin,   setPin]       = useState('')
  const [loginErr,   setLoginErr]  = useState('')
  const [loginLoad,  setLoginLoad] = useState(false)
  const [grupo,      setGrupo]     = useState<Restaurante[]>([])
  const [totales,    setTotales]   = useState<Totales|null>(null)
  const [oport,      setOport]     = useState<OportunidadGrupal[]>([])
  const [loading,    setLoading]   = useState(false)
  const [selected,   setSelected]  = useState<string|null>(null)
  const [detalle,    setDetalle]   = useState<DetalleRest|null>(null)
  const [detLoad,    setDetLoad]   = useState(false)
  const [toast,      setToast]     = useState('')
  const [pedGrupal,  setPedGrupal] = useState(false)
  const [selItems,   setSelItems]  = useState<Record<string,{sel:boolean;qty:number;rests:string[]}>>({})
  const [creando,    setCreando]   = useState(false)

  const showToast = (m:string) => { setToast(m); setTimeout(()=>setToast(''),3000) }

  useEffect(() => {
    const raw = localStorage.getItem('ia_almacen_session')
    if (raw) { try { setSession(JSON.parse(raw)) } catch { /**/ } }
  }, [])

  const sh = useCallback((s?:Session):Record<string,string> => ({
    'Content-Type':'application/json',
    'x-almacen-session': JSON.stringify(s ?? session),
  }), [session])

  const login = async () => {
    setLoginLoad(true); setLoginErr('')
    const r = await fetch('/api/almacen-central/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:loginEmail,pin:loginPin}) })
    const d = await r.json()
    if (!d.ok) { setLoginErr(d.error ?? 'Credenciales incorrectas'); setLoginLoad(false); return }
    localStorage.setItem('ia_almacen_session', JSON.stringify(d.session))
    setSession(d.session)
    setLoginLoad(false)
  }

  const cargar = useCallback(async(s:Session) => {
    setLoading(true)
    const r = await fetch('/api/almacen-central/grupo', { headers: sh(s) })
    const d = await r.json()
    if (d.ok) { setGrupo(d.grupo??[]); setTotales(d.totales); setOport(d.oportunidades_grupal??[]) }
    setLoading(false)
  }, [sh])

  useEffect(() => { if (session) cargar(session) }, [session])

  const abrirRest = async (id:string) => {
    setSelected(id); setDetalle(null); setDetLoad(true)
    const r = await fetch(`/api/almacen-central/restaurante/${id}`, { headers: sh() })
    const d = await r.json()
    if (d.ok) setDetalle(d)
    setDetLoad(false)
  }

  const crearPedidoGrupal = async () => {
    const articulos = Object.entries(selItems)
      .filter(([,v]) => v.sel && v.qty > 0 && v.rests.length > 0)
      .map(([nombre,v]) => {
        const art = oport.find(o => o.nombre === nombre)
        return { nombre, cantidad: v.qty, unidad: 'unidad', proveedor_id: art?.proveedor_id??null, proveedor_nombre: art?.proveedor_nombre??null, restaurante_ids: v.rests }
      })
    if (!articulos.length) { showToast('Selecciona al menos un artículo'); return }
    setCreando(true)
    const r = await fetch(`/api/almacen-central/restaurante/${session!.restaurantes[0].id}`, {
      method:'POST', headers: sh(),
      body: JSON.stringify({ accion:'pedido_grupal', articulos }),
    })
    const d = await r.json()
    if (d.ok) { showToast(`✅ ${d.mensaje}`); setPedGrupal(false); setSelItems({}); cargar(session!) }
    else showToast('Error: ' + d.error)
    setCreando(false)
  }

  const restActual = grupo.find(r => r.id === selected)

  const semaforo = (criticos:number, agotados:number) => {
    if (agotados > 0) return { col:'#F87171', bg:'#2E1010', label:`⛔ ${agotados} agotado${agotados>1?'s':''}` }
    if (criticos > 0) return { col:C.amber,   bg:'#2E1A0A', label:`⚠️ ${criticos} crítico${criticos>1?'s':''}` }
    return                  { col:'#4ADE80',  bg:'#0A2614', label:'✅ OK' }
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!session) return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{background:C.bg2,borderRadius:14,padding:32,width:'100%',maxWidth:360}}>
        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:22,color:C.red,marginBottom:4}}>ia.rest</div>
        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink,marginBottom:24}}>Central de almacén</div>
        {[{l:'Email',v:loginEmail,s:setEmail,t:'email'},{l:'PIN',v:loginPin,s:setPin,t:'password'}].map(({l,v,s,t},i)=>(
          <div key={l} style={{marginBottom:12}}>
            <div style={{fontFamily:SM,fontSize:10,color:C.ink4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{l}</div>
            <input type={t} value={v} onChange={e=>s(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} autoFocus={i===0}
              style={{width:'100%',padding:'10px 12px',background:C.bg3,border:`1px solid ${C.rule}`,borderRadius:8,color:C.ink,fontFamily:SN,fontSize:14,outline:'none',boxSizing:'border-box' as const}} />
          </div>
        ))}
        {loginErr && <div style={{fontFamily:SN,fontSize:12,color:'#F87171',marginBottom:10}}>{loginErr}</div>}
        <button onClick={login} disabled={loginLoad}
          style={{width:'100%',padding:'12px',background:loginLoad?C.bg3:C.green,color:C.ink,fontFamily:SN,fontSize:14,fontWeight:700,border:'none',borderRadius:8,cursor:'pointer',marginTop:4}}>
          {loginLoad?'Entrando…':'Entrar →'}
        </button>
        <div style={{fontFamily:SN,fontSize:11,color:C.ink4,textAlign:'center',marginTop:16,lineHeight:1.5}}>
          Acceso generado por el restaurante desde<br/><strong style={{color:C.ink3}}>/owner → Almacén → Invitar gestor</strong>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.ink}}>
      {/* Header */}
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.rule}`,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.red}}>ia.rest</div>
          <div style={{width:1,height:14,background:C.rule}}/>
          <div style={{fontFamily:SE,fontStyle:'italic',fontSize:15,color:C.ink}}>
            {session.nombre_empresa ?? 'Central de almacén'}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontFamily:SN,fontSize:12,color:C.ink3}}>{session.nombre}</div>
          <button onClick={()=>{ localStorage.removeItem('ia_almacen_session'); setSession(null) }}
            style={{fontFamily:SN,fontSize:11,padding:'4px 10px',background:'none',border:`1px solid ${C.rule}`,borderRadius:6,color:C.ink4,cursor:'pointer'}}>
            Salir
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'20px 16px',display:'grid',gridTemplateColumns: selected ? '340px 1fr' : '1fr',gap:16}}>

        {/* ── LISTA RESTAURANTES ── */}
        <div>
          {/* KPIs grupo */}
          {totales && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
              {[
                {l:'Críticos',v:String(totales.criticos),col: totales.agotados>0?'#F87171':totales.criticos>0?C.amber:'#4ADE80'},
                {l:'Pedidos pendientes',v:String(totales.pedidos_pendientes),col:C.amber},
                {l:'Valor stock',v:`${totales.valor_total.toLocaleString('es',{maximumFractionDigits:0})} €`,col:C.ink},
              ].map(({l,v,col})=>(
                <div key={l} style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,padding:'10px 12px'}}>
                  <div style={{fontFamily:SM,fontSize:9,color:C.ink4,textTransform:'uppercase',marginBottom:2}}>{l}</div>
                  <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:col}}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Oportunidades pedido grupal */}
          {oport.length > 0 && (
            <div style={{background:C.bg3,border:`1px solid ${C.amber}44`,borderRadius:10,padding:'12px 14px',marginBottom:14}}>
              <div style={{fontFamily:SM,fontSize:10,color:C.amber,textTransform:'uppercase',marginBottom:8}}>
                ✦ {oport.length} oportunidad{oport.length>1?'es':''} de pedido grupal
              </div>
              {oport.slice(0,4).map(o=>(
                <div key={o.nombre} style={{fontFamily:SN,fontSize:12,color:C.ink2,marginBottom:3}}>
                  <strong>{o.nombre}</strong> — {o.locales.length} locales
                  {o.proveedor_nombre && <span style={{color:C.ink4}}> · {o.proveedor_nombre}</span>}
                </div>
              ))}
              <button onClick={()=>{ setPedGrupal(true); const init:Record<string,{sel:boolean;qty:number;rests:string[]}>={}; oport.forEach(o=>{init[o.nombre]={sel:true,qty:Math.ceil(o.total_necesario),rests:o.locales}}); setSelItems(init) }}
                style={{marginTop:8,fontFamily:SN,fontSize:12,fontWeight:700,padding:'7px 14px',background:C.amber,color:C.bg,border:'none',borderRadius:7,cursor:'pointer'}}>
                📦 Crear pedido grupal →
              </button>
            </div>
          )}

          {/* Lista */}
          <div style={{fontFamily:SM,fontSize:10,color:C.ink4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>
            {grupo.length} restaurante{grupo.length!==1?'s':''}
          </div>
          {loading && <div style={{fontFamily:SE,fontStyle:'italic',color:C.ink3,padding:'20px 0'}}>Cargando…</div>}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {grupo.map(r => {
              const s = semaforo(r.articulos_criticos, r.articulos_agotados)
              return (
                <div key={r.id} onClick={()=>abrirRest(r.id)} style={{background:selected===r.id?C.bg3:C.bg2,border:`1.5px solid ${selected===r.id?C.green+'77':C.rule}`,borderRadius:10,padding:'12px 14px',cursor:'pointer'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:5}}>
                    <div style={{fontFamily:SN,fontSize:14,fontWeight:600,color:C.ink}}>{r.nombre}</div>
                    <span style={{fontFamily:SM,fontSize:10,padding:'2px 8px',borderRadius:10,background:s.bg,color:s.col}}>{s.label}</span>
                  </div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                    {r.ciudad && <span style={{fontFamily:SN,fontSize:10,color:C.ink4}}>{r.ciudad}</span>}
                    {r.pedidos_pendientes>0 && <span style={{fontFamily:SN,fontSize:10,color:C.amber}}>📋 {r.pedidos_pendientes} pedidos</span>}
                    {r.esperando_asn>0 && <span style={{fontFamily:SN,fontSize:10,color:C.blue}}>🔗 {r.esperando_asn} sin ASN</span>}
                    <span style={{fontFamily:SN,fontSize:10,color:C.ink4}}>
                      {r.valor_stock_eur > 0 ? `${r.valor_stock_eur.toLocaleString('es',{maximumFractionDigits:0})} € stock` : ''}
                    </span>
                  </div>
                  {r.top_criticos.length > 0 && (
                    <div style={{marginTop:6,fontFamily:SN,fontSize:11,color:C.amber}}>
                      {r.top_criticos.slice(0,2).map(a=>`${a.nombre}: ${a.stock_actual}/${a.stock_minimo} ${a.unidad}`).join(' · ')}
                      {r.top_criticos.length > 2 && <span style={{color:C.ink4}}> +{r.top_criticos.length-2} más</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── DETALLE RESTAURANTE ── */}
        {selected && restActual && (
          <div style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:12,padding:'16px 18px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink}}>{restActual.nombre}</div>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',color:C.ink4,cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            {detLoad && <div style={{fontFamily:SE,fontStyle:'italic',color:C.ink3}}>Cargando…</div>}
            {detalle && !detLoad && (
              <>
                {/* KPIs */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
                  {[
                    {l:'Artículos',v:String(detalle.resumen.total_articulos),c:C.ink},
                    {l:'Críticos',v:String(detalle.resumen.criticos),c:detalle.resumen.criticos>0?C.amber:'#4ADE80'},
                    {l:'Agotados',v:String(detalle.resumen.agotados),c:detalle.resumen.agotados>0?'#F87171':'#4ADE80'},
                    {l:'Valor stock',v:`${detalle.resumen.valor_stock_eur.toLocaleString('es',{maximumFractionDigits:0})} €`,c:C.ink},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{background:C.bg3,borderRadius:8,padding:'9px 11px'}}>
                      <div style={{fontFamily:SM,fontSize:9,color:C.ink4,textTransform:'uppercase',marginBottom:2}}>{l}</div>
                      <div style={{fontFamily:SE,fontStyle:'italic',fontSize:16,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Artículos críticos */}
                {detalle.stock_critico.length > 0 && (
                  <div style={{marginBottom:14}}>
                    <div style={{fontFamily:SM,fontSize:10,color:C.amber,textTransform:'uppercase',marginBottom:8}}>Artículos bajo mínimo</div>
                    <div style={{display:'flex',flexDirection:'column',gap:5}}>
                      {detalle.stock_critico.map(a=>(
                        <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',background:C.bg3,borderRadius:7}}>
                          <div>
                            <div style={{fontFamily:SN,fontSize:12,color:C.ink}}>{a.nombre}</div>
                            {a.proveedor && <div style={{fontFamily:SN,fontSize:10,color:C.ink4}}>{a.proveedor}</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontFamily:SN,fontSize:11,fontWeight:600,color:a.stock_actual===0?'#F87171':C.amber}}>
                              {a.stock_actual}/{a.stock_minimo} {a.unidad}
                            </div>
                            <div style={{fontFamily:SN,fontSize:10,color:C.ink4}}>necesita {a.necesario} {a.unidad}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pedidos activos */}
                {detalle.pedidos_activos.length > 0 && (
                  <div>
                    <div style={{fontFamily:SM,fontSize:10,color:C.ink3,textTransform:'uppercase',marginBottom:8}}>Pedidos activos</div>
                    <div style={{display:'flex',flexDirection:'column',gap:5}}>
                      {detalle.pedidos_activos.map(p=>(
                        <div key={p.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 10px',background:C.bg3,borderRadius:7}}>
                          <div style={{fontFamily:SN,fontSize:12,color:C.ink}}>{p.proveedor_nombre}</div>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <span style={{fontFamily:SN,fontSize:11,color:C.ink3}}>{p.cantidad} {p.unidad_compra}</span>
                            <span style={{fontFamily:SM,fontSize:10,padding:'2px 7px',borderRadius:10,
                              background:p.estado==='enviado'?'#001A2E':'#2A221A',
                              color:p.estado==='enviado'?'#60A5FA':C.amber}}>
                              {p.estado==='enviado'?'Enviado':'Pendiente'}
                              {!p.asn_subido_at&&p.estado==='enviado'?' · sin ASN':''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL PEDIDO GRUPAL ── */}
      {pedGrupal && (
        <div style={{position:'fixed',inset:0,background:'#000000aa',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:16}}>
          <div style={{background:C.bg2,borderRadius:14,padding:24,width:'100%',maxWidth:540,maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink}}>Pedido grupal</div>
              <button onClick={()=>setPedGrupal(false)} style={{background:'none',border:'none',color:C.ink4,fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{fontFamily:SN,fontSize:12,color:C.ink3,marginBottom:14}}>
              Selecciona los artículos y qué restaurantes los necesitan. Se creará un pedido por restaurante enlazados bajo el mismo código de grupo.
            </div>
            {oport.map(o => {
              const item = selItems[o.nombre] ?? {sel:false,qty:Math.ceil(o.total_necesario),rests:o.locales}
              return (
                <div key={o.nombre} style={{padding:'10px 12px',background:item.sel?C.bg3:C.bg,border:`1.5px solid ${item.sel?C.green+'77':C.rule}`,borderRadius:9,marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <input type="checkbox" checked={item.sel} onChange={e=>setSelItems(s=>({...s,[o.nombre]:{...item,sel:e.target.checked}}))} style={{marginTop:3,accentColor:C.green}}/>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:SN,fontSize:13,fontWeight:600,color:C.ink,marginBottom:3}}>{o.nombre}</div>
                      {o.proveedor_nombre && <div style={{fontFamily:SN,fontSize:11,color:C.ink4,marginBottom:6}}>Proveedor: {o.proveedor_nombre}</div>}
                      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                        <div style={{fontFamily:SM,fontSize:10,color:C.ink3}}>Cant. total:</div>
                        <input type="number" value={item.qty} onChange={e=>setSelItems(s=>({...s,[o.nombre]:{...item,qty:Number(e.target.value)}}))}
                          style={{width:70,padding:'4px 8px',background:C.bg3,border:`1px solid ${C.rule}`,borderRadius:6,color:C.ink,fontFamily:SN,fontSize:12,outline:'none'}}/>
                        <div style={{fontFamily:SM,fontSize:10,color:C.ink3}}>en {o.locales.length} local{o.locales.length>1?'es':''}:</div>
                        {session.restaurantes.filter(r=>o.locales.includes(r.id)).map(r=>(
                          <label key={r.id} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                            <input type="checkbox" checked={item.rests.includes(r.id)}
                              onChange={e=>setSelItems(s=>({...s,[o.nombre]:{...item,rests:e.target.checked?[...item.rests,r.id]:item.rests.filter(x=>x!==r.id)}}))}
                              style={{accentColor:C.green}}/>
                            <span style={{fontFamily:SN,fontSize:11,color:C.ink2}}>{r.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <button onClick={crearPedidoGrupal} disabled={creando}
              style={{width:'100%',marginTop:12,padding:'12px',background:creando?C.bg3:C.green,color:C.ink,fontFamily:SN,fontSize:14,fontWeight:700,border:'none',borderRadius:9,cursor:'pointer'}}>
              {creando?'Creando pedidos…':'📦 Crear pedidos grupales'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:C.ink,color:C.bg,fontFamily:SN,fontSize:13,padding:'10px 20px',borderRadius:20,zIndex:999}}>
          {toast}
        </div>
      )}
    </div>
  )
}
