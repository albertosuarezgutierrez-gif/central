'use client'
// ia.rest · MesaDetalleSheet
import React, { useState, useEffect, useCallback } from 'react'
import CobrarSheet from './CobrarSheet'

const C = {
  bg:'#F6F1E7', bg1:'#FBF8F1', bg2:'#EFE7D6', bg3:'#E5DAC2',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  verm:'#D9442B', vermD:'#A8311E', vermS:'#F4D8CF',
  amb:'#E8A33B', ambS:'#F7E3B6',
  gr:'#3F7D44', grS:'#D4E4D2',
  teal:'#2B6A6E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

interface ComandaItem {
  id: string; nombre: string; cantidad: number
  notas: string | null; estado: string
  precio_unitario: number | null; formato_nombre: string | null
  created_at: string
}
interface ComandaActiva {
  id: string; estado: string; tipo: string; created_at: string
  numero_ticket: number; num_comensales: number | null
  total_estimado: number; minutos_abierta: number
  camarero: { id: string; nombre: string }
  items: ComandaItem[]
}

interface Props {
  mesaId: string | null
  mesaCodigo: string
  session: { id: string; nombre: string; rol: string }
  onClose: () => void
  onPedirCuenta: (comandaId: string, mesa: string) => void
  onAnadirPorVoz: (mesaId: string, mesaCodigo: string, comandaId: string) => void
}

export default function MesaDetalleSheet({ mesaId, mesaCodigo, session, onClose, onPedirCuenta, onAnadirPorVoz }: Props) {
  const [comanda, setComanda]   = useState<ComandaActiva | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [vista, setVista]       = useState<'items'|'audit'|'añadir'>('items')
  const [audit, setAudit]       = useState<{id:string;accion:string;camarero_nombre:string;item_nombre:string|null;item_cantidad_antes:number|null;item_cantidad_despues:number|null;notas_antes:string|null;notas_despues:string|null;es_propietario:boolean;created_at:string}[]>([])
  const [editItem, setEditItem] = useState<ComandaItem | null>(null)
  const [editQty, setEditQty]   = useState(1)
  const [editNotas, setEditNotas] = useState('')
  const [saving, setSaving]     = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [cobrarOpen, setCobrarOpen] = useState(false)
  const [vistaAnadir, setVistaAnadir] = useState(false)
  const [productos, setProductos]     = useState<{id:string;nombre:string;precio:number;seccion_id:string|null}[]>([])
  const [cartAnadir, setCartAnadir]   = useState<{producto_id:string;nombre:string;cantidad:number;precio_unitario:number}[]>([])
  const [savingAnadir, setSavingAnadir] = useState(false)

  const session_str = JSON.stringify(session)

  const cargarComanda = useCallback(async () => {
    if (!mesaId) return
    setLoading(true); setError('')
    // Cargar productos de la carta
    fetch('/api/owner/carta', { headers: { 'x-ia-session': session_str } })
      .then(r => r.json()).then(d => setProductos((d.productos ?? []).filter((p:{activo:boolean}) => p.activo)))
      .catch(() => {})

    try {
      const r = await fetch(`/api/mesa/${mesaId}/comanda`, {
        headers: { 'x-ia-session': session_str }
      })
      const d = await r.json()
      setComanda(d.comanda ?? null)
    } catch { setError('Error cargando comanda') }
    setLoading(false)
  }, [mesaId, session_str])

  const enviarCartAnadir = async () => {
    if (!comanda || !cartAnadir.length) return
    setSavingAnadir(true)
    await fetch(`/api/comanda/${comanda.id}/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
      body: JSON.stringify({ items: cartAnadir })
    })
    setCartAnadir([]); setVistaAnadir(false)
    await cargarComanda(); setSavingAnadir(false); flash('Añadido ✓')
  }

  const cargarAudit = useCallback(async () => {
    if (!comanda?.id) return
    const r = await fetch(`/api/comanda/${comanda.id}/audit`, {
      headers: { 'x-ia-session': session_str }
    })
    const d = await r.json()
    setAudit(d.audit ?? [])
  }, [comanda?.id, session_str])

  useEffect(() => { if (mesaId) cargarComanda() }, [mesaId, cargarComanda])
  useEffect(() => { if (vista==='audit' && comanda?.id) cargarAudit() }, [vista, comanda?.id, cargarAudit])

  const flash = (msg: string) => {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(''), 2200)
  }

  const modificarItem = async (item: ComandaItem, nuevaCantidad: number, nuevasNotas: string) => {
    if (!comanda) return
    setSaving(true)
    await fetch(`/api/comanda/${comanda.id}/item/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
      body: JSON.stringify({ cantidad: nuevaCantidad, notas: nuevasNotas || null })
    })
    await cargarComanda()
    setEditItem(null); flash('Guardado ✓'); setSaving(false)
  }

  const eliminarItem = async (item: ComandaItem) => {
    if (!comanda || !confirm(`¿Eliminar "${item.nombre}"?`)) return
    setSaving(true)
    await fetch(`/api/comanda/${comanda.id}/item/${item.id}`, {
      method: 'DELETE',
      headers: { 'x-ia-session': session_str }
    })
    await cargarComanda()
    flash(`"${item.nombre}" eliminado`); setSaving(false)
  }

  const estadoColor = (estado: string) => ({
    nueva: C.teal, en_cocina: C.amb, lista: C.gr, cuenta: C.verm
  }[estado] ?? C.ink3)

  const estadoBg = (estado: string) => ({
    nueva: `${C.teal}18`, en_cocina: C.ambS, lista: C.grS, cuenta: C.vermS
  }[estado] ?? C.bg2)

  if (!mesaId) return null

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose}
        style={{position:'fixed',inset:0,background:'rgba(26,23,20,.35)',zIndex:40,backdropFilter:'blur(2px)'}}/>

      {/* Sheet */}
      <div style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:50,
        background:C.bg1,borderTop:`1px solid ${C.rule}`,
        borderRadius:'20px 20px 0 0',
        maxHeight:'90dvh',display:'flex',flexDirection:'column',
        boxShadow:'0 -8px 32px rgba(26,23,20,.14)',
        fontFamily:SN,color:C.ink,
        animation:'slideUp .3s cubic-bezier(.32,1,.28,1)',
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{width:36,height:3,background:C.rule,borderRadius:2,margin:'10px auto 0',flexShrink:0}}/>

        {/* HEADER */}
        <div style={{padding:'12px 20px 10px',borderBottom:`1px solid ${C.rule}`,flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontFamily:SE,fontStyle:'italic',fontSize:24,color:C.ink}}>
                  {parseInt(mesaCodigo.replace(/[^0-9]/g,''),10)||mesaCodigo}
                </span>
                <span style={{fontSize:11,color:C.ink3}}>{mesaCodigo}</span>
                {comanda && (
                  <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:20,
                    background:estadoBg(comanda.estado),color:estadoColor(comanda.estado),
                    textTransform:'uppercase',letterSpacing:'.7px'}}>
                    {({'nueva':'Nueva','en_cocina':'En cocina','lista':'Lista ✓','cuenta':'Cuenta','cerrada':'Cerrada'})[comanda.estado]||comanda.estado}
                  </span>
                )}
              </div>
              {comanda && (
                <div style={{fontSize:11,color:C.ink3,marginTop:3,display:'flex',gap:10}}>
                  <span>Abierta por <strong style={{color:C.ink2}}>{comanda.camarero.nombre}</strong></span>
                  <span>· {comanda.minutos_abierta}m</span>
                  {comanda.num_comensales && <span>· {comanda.num_comensales} comensales</span>}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,color:C.ink3,cursor:'pointer',padding:4,lineHeight:1}}>×</button>
          </div>

          {/* Tabs internos */}
          {comanda && (
            <div style={{display:'flex',gap:4,marginTop:10}}>
              {(['items','audit'] as const).map(v=>(
                <button key={v} onClick={()=>setVista(v)}
                  style={{padding:'4px 12px',borderRadius:20,border:`1px solid ${vista===v?C.verm+'55':C.rule}`,
                    background:vista===v?C.vermS:'transparent',
                    fontSize:11,fontWeight:vista===v?600:400,
                    color:vista===v?C.verm:C.ink3,cursor:'pointer'}}>
                  {v==='items'?`Items (${comanda.items.length})`:'Historial'}
                </button>
              ))}
              <button onClick={()=>{setVistaAnadir(v=>!v);setCartAnadir([])}}
                style={{padding:'4px 12px',borderRadius:20,border:`1px solid ${vistaAnadir?C.verm+'55':C.rule}`,
                  background:vistaAnadir?C.vermS:'transparent',
                  fontSize:11,fontWeight:vistaAnadir?600:400,
                  color:vistaAnadir?C.verm:C.ink3,cursor:'pointer'}}>
                {vistaAnadir?'✕ Cerrar':'＋ Añadir'}
              </button>
              <div style={{flex:1}}/>
              {comanda && <span style={{fontFamily:SM,fontSize:13,fontWeight:700,color:C.ink,alignSelf:'center'}}>
                {comanda.total_estimado>0?`${comanda.total_estimado.toFixed(2).replace('.',',')} €`:''}
              </span>}
            </div>
          )}
        </div>

        {/* FLASH MSG */}
        {savedMsg && (
          <div style={{padding:'8px 20px',background:C.grS,borderBottom:`1px solid ${C.gr}44`,
            fontFamily:SM,fontSize:11,color:C.gr,flexShrink:0}}>
            {savedMsg}
          </div>
        )}

        {/* CONTENIDO */}
        <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const}}>

          {loading && (
            <div style={{padding:30,textAlign:'center',color:C.ink3,fontFamily:SM,fontSize:11}}>
              cargando…
            </div>
          )}

          {error && (
            <div style={{padding:20,textAlign:'center',color:C.verm,fontFamily:SM,fontSize:12}}>
              {error}
            </div>
          )}

          {!loading && !error && !comanda && (
            <div style={{padding:30,textAlign:'center'}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink3}}>Mesa libre</div>
              <div style={{fontSize:12,color:C.ink4,marginTop:6}}>Sin comanda activa</div>
            </div>
          )}

          {/* ── VISTA: ITEMS ── */}
          {!loading && comanda && vista==='items' && (
            <div style={{padding:'0 20px 10px'}}>

              {/* Edit inline de item */}
              {editItem && (
                <div style={{background:C.ambS,border:`1px solid ${C.amb}55`,borderRadius:10,padding:14,margin:'12px 0'}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.ink,marginBottom:10}}>
                    Modificar: <span style={{fontFamily:SE,fontStyle:'italic'}}>{editItem.nombre}</span>
                  </div>
                  <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:10}}>
                    <span style={{fontSize:11,color:C.ink3,width:70}}>Cantidad</span>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <button onClick={()=>setEditQty(q=>Math.max(1,q-1))}
                        style={{width:28,height:28,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg1,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <span style={{fontFamily:SM,fontSize:15,minWidth:20,textAlign:'center'}}>{editQty}</span>
                      <button onClick={()=>setEditQty(q=>q+1)}
                        style={{width:28,height:28,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg1,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12}}>
                    <span style={{fontSize:11,color:C.ink3,width:70}}>Nota</span>
                    <input value={editNotas} onChange={e=>setEditNotas(e.target.value)} placeholder="sin sal, bien hecho…"
                      style={{flex:1,background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:7,padding:'7px 10px',fontFamily:SC,fontSize:13,color:C.ink,outline:'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>setEditItem(null)}
                      style={{flex:1,padding:'9px',border:`1px solid ${C.rule}`,borderRadius:8,background:'transparent',color:C.ink3,fontSize:12,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
                    <button onClick={()=>modificarItem(editItem,editQty,editNotas)} disabled={saving}
                      style={{flex:2,padding:'9px',border:'none',borderRadius:8,background:C.verm,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?.6:1}}>
                      {saving?'Guardando…':'Guardar cambio'}
                    </button>
                  </div>
                </div>
              )}

              {comanda.items.length===0 && (
                <div style={{padding:20,textAlign:'center',color:C.ink3,fontSize:12}}>Sin items</div>
              )}

              {comanda.items.map(item => (
                <div key={item.id} style={{
                  borderBottom:`1px solid ${C.rule}`,
                  padding:'10px 0',
                  opacity:editItem&&editItem.id!==item.id?.5:1,
                  transition:'opacity .15s',
                }}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    {/* Cantidad editable inline */}
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0,minWidth:32}}>
                      <button onPointerDown={e=>{e.preventDefault();if(!editItem){setEditQty(item.cantidad+1);setEditNotas(item.notas??'');setEditItem(item)}else if(editItem.id===item.id){setEditQty(q=>q+1)}}}
                        style={{width:20,height:20,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',color:C.ink3,lineHeight:1}}>+</button>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.verm,lineHeight:1,fontWeight:600}}>{item.cantidad}</span>
                      <button onPointerDown={e=>{e.preventDefault();if(!editItem){setEditQty(Math.max(1,item.cantidad-1));setEditNotas(item.notas??'');setEditItem(item)}else if(editItem.id===item.id){setEditQty(q=>Math.max(1,q-1))}}}
                        style={{width:20,height:20,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',color:C.ink3,lineHeight:1}}>−</button>
                    </div>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,color:C.ink}}>{item.nombre}</div>
                      {item.formato_nombre&&<div style={{fontSize:10,color:C.ink3,marginTop:1}}>{item.formato_nombre}</div>}
                      {item.notas&&<div style={{fontFamily:SC,fontSize:13,color:C.amb,marginTop:2}}>{item.notas}</div>}
                      {item.precio_unitario&&<div style={{fontFamily:SM,fontSize:10,color:C.ink4,marginTop:2}}>{(item.precio_unitario*item.cantidad).toFixed(2)} €</div>}
                    </div>

                    <div style={{display:'flex',gap:5,flexShrink:0}}>
                      {/* Editar */}
                      <button onPointerDown={e=>{e.preventDefault();setEditItem(item);setEditQty(item.cantidad);setEditNotas(item.notas??'')}}
                        style={{width:30,height:30,border:`1px solid ${C.rule}`,borderRadius:7,background:C.bg2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.ink3,fontSize:13}}>
                        ✎
                      </button>
                      {/* Eliminar */}
                      <button onPointerDown={e=>{e.preventDefault();eliminarItem(item)}}
                        style={{width:30,height:30,border:`1px solid ${C.verm}44`,borderRadius:7,background:C.vermS,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.verm,fontSize:14}}>
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── VISTA: AUDIT ── */}
          {!loading && comanda && vista==='audit' && (
            <div style={{padding:'10px 20px'}}>
              {audit.length===0&&<div style={{textAlign:'center',padding:20,color:C.ink3,fontSize:12}}>Sin cambios registrados</div>}
              {audit.map(a=>(
                <div key={a.id} style={{
                  borderBottom:`1px solid ${C.rule}`,padding:'9px 0',
                  display:'flex',alignItems:'flex-start',gap:10,
                }}>
                  <div style={{
                    width:8,height:8,borderRadius:'50%',flexShrink:0,marginTop:4,
                    background:a.es_propietario?C.gr:C.verm,
                  }}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:600,color:a.es_propietario?C.ink:C.verm}}>
                        {a.camarero_nombre}
                        {!a.es_propietario&&<span style={{fontSize:9,fontWeight:700,marginLeft:6,padding:'1px 5px',background:C.vermS,borderRadius:3,color:C.verm}}>NO PROPIETARIO</span>}
                      </span>
                      <span style={{fontFamily:SM,fontSize:9,color:C.ink4}}>
                        {new Date(a.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}
                      </span>
                    </div>
                    <div style={{fontSize:11,color:C.ink3,marginTop:2}}>
                      <span style={{fontFamily:SM,fontSize:9,color:C.teal,textTransform:'uppercase',letterSpacing:'.5px'}}>{a.accion.replace('_',' ')}</span>
                      {a.item_nombre&&<span> · {a.item_nombre}</span>}
                      {a.item_cantidad_antes!==null&&a.item_cantidad_despues!==null&&a.item_cantidad_antes!==a.item_cantidad_despues&&(
                        <span style={{color:C.amb}}> · {a.item_cantidad_antes}→{a.item_cantidad_despues}</span>
                      )}
                      {a.notas_despues&&a.notas_despues!==a.notas_antes&&(
                        <span style={{fontFamily:SC,color:C.amb}}> · nota: {a.notas_despues}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* VISTA: AÑADIR MANUAL */}
        {vistaAnadir && comanda && (
          <div style={{padding:'10px 16px',borderTop:`1px solid ${C.rule}`,background:C.bg2}}>
            {/* Carrito */}
            {cartAnadir.length > 0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'1px',color:C.ink4,marginBottom:6}}>En el carrito</div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:4}}>
                  {cartAnadir.map((it,i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:C.bg1,borderRadius:7,padding:'6px 10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <button onClick={()=>setCartAnadir(p=>p.map((x,j)=>j===i?{...x,cantidad:Math.max(1,x.cantidad-1)}:x))}
                          style={{width:22,height:22,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:C.ink3}}>−</button>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,color:C.verm,fontWeight:700,minWidth:16,textAlign:'center' as const}}>{it.cantidad}</span>
                        <button onClick={()=>setCartAnadir(p=>p.map((x,j)=>j===i?{...x,cantidad:x.cantidad+1}:x))}
                          style={{width:22,height:22,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:C.ink3}}>+</button>
                      </div>
                      <span style={{flex:1,fontSize:13,color:C.ink}}>{it.nombre}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.ink4}}>{(it.precio_unitario*it.cantidad).toFixed(2)} €</span>
                      <button onClick={()=>setCartAnadir(p=>p.filter((_,j)=>j!==i))}
                        style={{background:'none',border:'none',color:C.verm,cursor:'pointer',fontSize:16,padding:2}}>×</button>
                    </div>
                  ))}
                </div>
                <button onClick={enviarCartAnadir} disabled={savingAnadir}
                  style={{marginTop:8,width:'100%',padding:'10px',background:C.verm,border:'none',borderRadius:8,color:'#fff',fontFamily:"'Inter Tight',sans-serif",fontSize:13,fontWeight:700,cursor:'pointer',opacity:savingAnadir?.6:1}}>
                  {savingAnadir?'Añadiendo…':`Añadir ${cartAnadir.reduce((s,x)=>s+x.cantidad,0)} items a la comanda`}
                </button>
              </div>
            )}
            {/* Catálogo */}
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'1px',color:C.ink4,marginBottom:6}}>Carta</div>
            <div style={{display:'flex',flexWrap:'wrap' as const,gap:5,maxHeight:180,overflowY:'auto' as const,scrollbarWidth:'none' as const}}>
              {productos.filter(p=>p.precio&&p.precio>0).map(p => {
                const enCarrito = cartAnadir.find(x=>x.producto_id===p.id)
                return (
                  <button key={p.id}
                    onClick={()=>{
                      setCartAnadir(function(prev){
                        var ex = prev.find(function(x){return x.producto_id===p.id})
                        if(ex) return prev.map(function(x){return x.producto_id===p.id?{...x,cantidad:x.cantidad+1}:x})
                        return [...prev,{producto_id:p.id,nombre:p.nombre,cantidad:1,precio_unitario:p.precio}]
                      })
                    }}
                    style={{padding:'6px 10px',borderRadius:8,
                      background:enCarrito?C.vermS:C.bg1,
                      border:`1px solid ${enCarrito?C.verm+'55':C.rule}`,
                      fontSize:12,fontWeight:enCarrito?600:400,
                      color:enCarrito?C.verm:C.ink2,cursor:'pointer',
                      display:'flex',alignItems:'center',gap:5}}>
                    {enCarrito&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.verm,fontWeight:700}}>{enCarrito.cantidad}×</span>}
                    <span>{p.nombre}</span>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:C.ink4}}>{p.precio?.toFixed(2)}€</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ACCIONES FIJAS ABAJO */}
        {comanda && (
          <div style={{padding:'10px 16px 20px',borderTop:`1px solid ${C.rule}`,flexShrink:0,display:'flex',gap:8,background:C.bg1}}>
            {/* Añadir por voz */}
            <button onClick={()=>{ onAnadirPorVoz(mesaId!, mesaCodigo, comanda.id); onClose() }}
              style={{flex:1,padding:'11px 8px',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
              </svg>
              <span style={{fontSize:10,fontWeight:600,color:C.teal}}>Añadir voz</span>
            </button>

            {/* Añadir manual — abre selector de carta inline */}
            <button onClick={()=>{setVistaAnadir(v=>!v);setCartAnadir([])}}
              style={{flex:1,padding:'11px 8px',background:vistaAnadir?C.vermS:C.bg2,border:`1px solid ${vistaAnadir?C.verm+'55':C.rule}`,borderRadius:10,
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={vistaAnadir?C.verm:C.ink3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span style={{fontSize:10,fontWeight:600,color:vistaAnadir?C.verm:C.ink3}}>{vistaAnadir?'Cerrar':'Añadir manual'}</span>
            </button>

            {/* Pedir cuenta */}
            <button onClick={()=>setCobrarOpen(true)}
              style={{flex:2,padding:'11px 12px',background:C.verm,border:'none',borderRadius:10,
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>
                Cobrar{comanda.total_estimado>0?` · ${comanda.total_estimado.toFixed(2).replace('.',',')} €`:''}
              </span>
            </button>
          </div>
        )}

        {!loading && !comanda && (
          <div style={{padding:'12px 16px 20px',borderTop:`1px solid ${C.rule}`,flexShrink:0,background:C.bg1}}>
            <button onClick={onClose}
              style={{width:'100%',padding:13,background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,
                fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* COBRAR SHEET */}
      {cobrarOpen && comanda && (
        <CobrarSheet
          comandaId={comanda.id}
          mesaLabel={mesaCodigo}
          total={comanda.total_estimado}
          session={session}
          onCerrado={(result)=>{
            setCobrarOpen(false)
            onClose()
            onPedirCuenta(comanda.id, mesaCodigo)
          }}
          onCancel={()=>setCobrarOpen(false)}
        />
      )}
    </>
  )
}
