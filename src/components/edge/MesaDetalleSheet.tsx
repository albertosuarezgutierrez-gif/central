'use client'
// ia.rest · MesaDetalleSheet
import React, { useState, useEffect, useCallback } from 'react'
import CobrarSheet from './CobrarSheet'
import TicketAliasModal from '@/components/owner/TicketAliasModal'
import FacturaClienteModal from '@/components/owner/FacturaClienteModal'

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
  nombre_cuenta: string | null
  camarero: { id: string; nombre: string }
  items: ComandaItem[]
}

interface Props {
  mesaId: string | null
  mesaCodigo: string
  capacidad?: number
  session: { id: string; nombre: string; rol: string }
  onClose: () => void
  onPedirCuenta: (comandaId: string, mesa: string) => void
  onAnadirPorVoz: (mesaId: string, mesaCodigo: string, comandaId: string) => void
  onAbrirMesa?: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
}

export default function MesaDetalleSheet({ mesaId, mesaCodigo, capacidad, session, onClose, onPedirCuenta, onAnadirPorVoz, onAbrirMesa }: Props) {
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
  const [searchAnadir, setSearchAnadir] = useState('')
  const [catAnadir, setCatAnadir]       = useState('todo')
  const [productos, setProductos]     = useState<{id:string;nombre:string;precio:number;seccion_id:string|null}[]>([])
  const [cartAnadir, setCartAnadir]   = useState<{producto_id:string;nombre:string;cantidad:number;precio_unitario:number}[]>([])
  const [savingAnadir, setSavingAnadir] = useState(false)
  const [editNombre, setEditNombre]     = useState(false)
  const [nombreInput, setNombreInput]   = useState('')
  const [aliasOpen, setAliasOpen]       = useState(false)
  const [facturaOpen, setFacturaOpen]   = useState(false)
  const [hasAlias, setHasAlias]         = useState(false)
  const [hasFactCliente, setHasFactCliente] = useState(false)

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

  // Verificar si hay alias/factura para comanda cerrada
  useEffect(() => {
    if (!comanda?.id || comanda.estado !== 'cerrada') return
    Promise.all([
      fetch(`/api/comanda/${comanda.id}/ticket-alias`).then(r=>r.json()).then(d=>d.alias!=null),
      fetch(`/api/factura/cliente?comanda_id=${comanda.id}`).then(r=>r.json()).then(d=>d.factura!=null),
    ]).then(([alias, fact]) => {
      setHasAlias(alias)
      setHasFactCliente(fact)
    }).catch(()=>null)
  }, [comanda?.id, comanda?.estado])

  const flash = (msg: string) => {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(''), 2200)
  }

  const guardarNombre = async (nombre: string) => {
    if (!comanda) return
    const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''
    await fetch(`/api/comanda/${comanda.id}/nombre`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ nombre_cuenta: nombre.trim() || null }),
    })
    setEditNombre(false)
    await cargarComanda()
    flash(nombre.trim() ? `Alias: ${nombre.trim()}` : 'Alias eliminado')
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
                    {({'nueva':'Nueva','en_cocina':'En cocina','lista':'Lista ✓','cuenta':'Cuenta','cerrada':'Cerrada'} as Record<string,string>)[comanda.estado]||comanda.estado}
                  </span>
                )}
              </div>
              {/* Nombre/alias editable */}
              {comanda && (
                editNombre ? (
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                    <input
                      autoFocus
                      value={nombreInput}
                      onChange={e=>setNombreInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter') guardarNombre(nombreInput); if(e.key==='Escape'){setEditNombre(false)} }}
                      placeholder="Nombre (ej: Pepe, Mesa cumpleaños…)"
                      style={{flex:1,background:C.bg2,border:`1px solid ${C.amb}`,borderRadius:8,padding:'5px 10px',
                        fontFamily:SN,fontSize:13,color:C.ink,outline:'none'}}
                    />
                    <button onClick={()=>guardarNombre(nombreInput)}
                      style={{background:C.amb,border:'none',borderRadius:8,padding:'5px 10px',
                        fontFamily:SN,fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer'}}>✓</button>
                    <button onClick={()=>{setEditNombre(false);setNombreInput('')}}
                      style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,padding:'5px 10px',
                        fontFamily:SN,fontSize:12,cursor:'pointer',color:C.ink3}}>✕</button>
                  </div>
                ) : (
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2,cursor:'pointer'}}
                    onClick={()=>{setNombreInput(comanda.nombre_cuenta??'');setEditNombre(true)}}>
                    {comanda.nombre_cuenta
                      ? <span style={{fontFamily:SE,fontStyle:'italic',fontSize:15,color:C.amb}}>★ {comanda.nombre_cuenta}</span>
                      : <span style={{fontFamily:SN,fontSize:11,color:C.ink4}}>+ alias de mesa</span>
                    }
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color:C.ink4}}>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                )
              )}
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
              <button onClick={()=>{setVistaAnadir(v=>!v);setCartAnadir([]);setSearchAnadir('');setCatAnadir('todo')}}
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

        {/* CONTENIDO — 2 modos exclusivos: COMANDA o AÑADIR */}

        {/* ── MODO COMANDA: items actuales ── */}
        {!vistaAnadir && (
          <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const}}>

            {loading && (
              <div style={{padding:30,textAlign:'center',color:C.ink3,fontFamily:SM,fontSize:11}}>cargando…</div>
            )}
            {error && (
              <div style={{padding:20,textAlign:'center',color:C.verm,fontFamily:SM,fontSize:12}}>{error}</div>
            )}

            {/* Mesa libre */}
            {!loading && !error && !comanda && (
              <div style={{padding:30,textAlign:'center'}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink3}}>Mesa libre</div>
                <div style={{fontSize:12,color:C.ink4,marginTop:6,marginBottom:20}}>Sin comanda activa</div>
                {onAbrirMesa && (
                  <button onClick={()=>{ onClose(); onAbrirMesa(mesaId!, mesaCodigo, capacidad) }}
                    style={{padding:'12px 28px',borderRadius:10,border:'none',background:C.verm,color:'#fff',fontSize:14,fontWeight:500,fontFamily:SN,cursor:'pointer'}}>
                    Abrir mesa
                  </button>
                )}
              </div>
            )}

            {/* Items de la comanda */}
            {!loading && comanda && vista==='items' && (
              <div style={{padding:'0 20px 10px'}}>

                {/* Edit inline de item */}
                {editItem && (
                  <div style={{background:C.ambS,border:`1px solid ${C.amb}55`,borderRadius:10,padding:14,margin:'12px 0'}}>
                    <div style={{fontSize:12,fontWeight:600,color:C.ink,marginBottom:10}}>
                      Modificar: <span style={{fontFamily:SE,fontStyle:'italic'}}>{editItem.nombre}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                      <button onClick={()=>setEditQty(q=>Math.max(1,q-1))}
                        style={{width:32,height:32,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',fontSize:18,color:C.ink3,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:24,color:C.verm,minWidth:24,textAlign:'center' as const}}>{editQty}</span>
                      <button onClick={()=>setEditQty(q=>q+1)}
                        style={{width:32,height:32,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',fontSize:18,color:C.ink3,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                    </div>
                    <input value={editNotas} onChange={e=>setEditNotas(e.target.value)} placeholder="Notas (sin sal, muy hecho…)"
                      style={{width:'100%',padding:'8px 10px',background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:8,fontFamily:SN,fontSize:12,color:C.ink,outline:'none',boxSizing:'border-box' as const,marginBottom:10}}/>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>setEditItem(null)}
                        style={{flex:1,padding:'9px',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,fontSize:12,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Cancelar</button>
                      <button onClick={async()=>{
                        if (!editItem) return; setSaving(true)
                        await fetch(`/api/comanda/${comanda.id}/item/${editItem.id}`,{method:'PUT',headers:{'Content-Type':'application/json','x-ia-session':session_str},body:JSON.stringify({cantidad:editQty,notas:editNotas})})
                        setEditItem(null); await cargarComanda(); setSaving(false); flash('Guardado ✓')
                      }} disabled={saving}
                        style={{flex:2,padding:'9px',background:C.verm,border:'none',borderRadius:8,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',opacity:saving?.6:1}}>
                        {saving?'Guardando…':'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                )}

                {comanda.items.length===0 && (
                  <div style={{padding:20,textAlign:'center',color:C.ink3,fontSize:12}}>Sin items</div>
                )}

                {comanda.items.map(item => (
                  <div key={item.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:`1px solid ${C.rule}`}}>
                    <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:4,flexShrink:0}}>
                      <button onClick={async()=>{
                        await fetch(`/api/comanda/${comanda.id}/item/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json','x-ia-session':session_str},body:JSON.stringify({cantidad:item.cantidad+1})})
                        await cargarComanda()
                      }} style={{width:28,height:28,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:C.ink3}}>+</button>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:22,fontWeight:600,color:C.verm,lineHeight:1}}>{item.cantidad}</span>
                      <button onClick={async()=>{
                        const nq = item.cantidad - 1
                        if (nq <= 0) {
                          await fetch(`/api/comanda/${comanda.id}/item/${item.id}`,{method:'DELETE',headers:{'x-ia-session':session_str}})
                        } else {
                          await fetch(`/api/comanda/${comanda.id}/item/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json','x-ia-session':session_str},body:JSON.stringify({cantidad:nq})})
                        }
                        await cargarComanda()
                      }} style={{width:28,height:28,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:C.ink3}}>−</button>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,color:C.ink}}>{item.nombre}</div>
                      {item.notas && <div style={{fontSize:11,color:C.ink4,marginTop:2,fontStyle:'italic' as const}}>{item.notas}</div>}
                      <div style={{fontSize:12,color:C.ink4,marginTop:2}}>{item.precio_unitario?.toFixed(2)} € × {item.cantidad}</div>
                    </div>
                    <button onClick={()=>{setEditItem(item);setEditQty(item.cantidad);setEditNotas(item.notas||'')}}
                      style={{width:32,height:32,borderRadius:8,background:C.bg2,border:`1px solid ${C.rule}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={async()=>{
                      await fetch(`/api/comanda/${comanda.id}/item/${item.id}`,{method:'DELETE',headers:{'x-ia-session':session_str}})
                      await cargarComanda()
                    }} style={{width:32,height:32,borderRadius:8,background:C.vermS,border:`1px solid ${C.verm}44`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.verm} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                ))}

                {comanda.total_estimado > 0 && (
                  <div style={{display:'flex',justifyContent:'flex-end',padding:'12px 0 4px',fontSize:15,fontWeight:700,color:C.ink,fontFamily:SM}}>
                    Total: {comanda.total_estimado.toFixed(2).replace('.',',')} €
                  </div>
                )}
              </div>
            )}

            {/* Historial */}
            {!loading && comanda && vista==='audit' && (
              <div style={{padding:'10px 20px'}}>
                {audit.length === 0 && (
                  <div style={{padding:20,textAlign:'center',color:C.ink4,fontSize:12,fontStyle:'italic' as const}}>Sin cambios registrados</div>
                )}
                {audit.map((a,i)=>(
                  <div key={i} style={{padding:'8px 0',borderBottom:`1px solid ${C.rule}`,fontSize:12,color:C.ink2}}>
                    <span style={{fontWeight:600,color:C.ink}}>{a.camarero_nombre}</span> · {a.accion}
                    {a.item_nombre && <span style={{color:C.ink4}}> · {a.item_nombre}</span>}
                    <span style={{color:C.ink4,float:'right' as const}}>{new Date(a.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MODO AÑADIR: carta completa pantalla ── */}
        {vistaAnadir && comanda && (() => {
          const cats = ['todo', ...Array.from(new Set(productos.map(p=>(p as {categoria?:string}).categoria||'Otros'))).sort()]
          const filtrados = productos.filter(p => {
            const q = searchAnadir.toLowerCase().trim()
            const matchQ = !q || p.nombre.toLowerCase().includes(q)
            const matchC = catAnadir==='todo' || ((p as {categoria?:string}).categoria||'Otros')===catAnadir
            return p.precio && p.precio > 0 && matchQ && matchC
          })
          const totalAnadir = cartAnadir.reduce((s,x)=>s+x.cantidad,0)
          return (
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>
              {/* Search + categorías */}
              <div style={{padding:'8px 14px 6px',borderBottom:`1px solid ${C.rule}`,flexShrink:0,background:C.bg1}}>
                <div style={{position:'relative',marginBottom:6}}>
                  <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.ink4} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={searchAnadir} onChange={e=>setSearchAnadir(e.target.value)}
                    placeholder="Buscar producto…" autoFocus
                    style={{width:'100%',padding:'9px 32px 9px 30px',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,fontFamily:SN,fontSize:13,color:C.ink,outline:'none',boxSizing:'border-box' as const}}/>
                  {searchAnadir && (
                    <button onClick={()=>setSearchAnadir('')} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.ink4,fontSize:16,lineHeight:1,padding:0}}>×</button>
                  )}
                </div>
                {!searchAnadir && (
                  <div style={{display:'flex',gap:4,overflowX:'auto',scrollbarWidth:'none' as const,paddingBottom:2}}>
                    {cats.map(cat=>(
                      <button key={cat} onClick={()=>setCatAnadir(cat)}
                        style={{padding:'4px 10px',borderRadius:20,flexShrink:0,border:`1px solid ${catAnadir===cat?C.verm+'55':C.rule}`,background:catAnadir===cat?C.vermS:'transparent',fontSize:10,fontWeight:catAnadir===cat?600:400,color:catAnadir===cat?C.verm:C.ink3,cursor:'pointer',whiteSpace:'nowrap' as const}}>
                        {cat==='todo'?'Todo':cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista productos — scroll seguro, solo botón + añade */}
              <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'6px 14px'}}>
                {filtrados.map(p => {
                  const enCarrito = cartAnadir.find(x=>x.producto_id===p.id)
                  const addP = () => setCartAnadir(prev => {
                    const ex = prev.find(x=>x.producto_id===p.id)
                    if (ex) return prev.map(x=>x.producto_id===p.id?{...x,cantidad:x.cantidad+1}:x)
                    return [...prev,{producto_id:p.id,nombre:p.nombre,cantidad:1,precio_unitario:p.precio??0}]
                  })
                  return (
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 0',borderBottom:`1px solid ${C.rule}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:enCarrito?700:500,color:enCarrito?C.verm:C.ink}}>{p.nombre}</div>
                        <div style={{fontFamily:SM,fontSize:11,color:C.ink4,marginTop:1}}>{p.precio?.toFixed(2)} €</div>
                      </div>
                      {enCarrito ? (
                        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                          <button onPointerDown={()=>setCartAnadir(prev=>prev.map(x=>x.producto_id===p.id?{...x,cantidad:Math.max(0,x.cantidad-1)}:x).filter(x=>x.cantidad>0))}
                            style={{width:30,height:30,borderRadius:'50%',border:`1px solid ${C.rule}`,background:C.bg2,cursor:'pointer',fontSize:16,color:C.ink3,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                          <span style={{fontFamily:SM,fontSize:15,color:C.verm,fontWeight:700,minWidth:20,textAlign:'center' as const}}>{enCarrito.cantidad}</span>
                          <button onPointerDown={addP}
                            style={{width:30,height:30,borderRadius:'50%',border:'none',background:C.verm,cursor:'pointer',fontSize:16,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                        </div>
                      ) : (
                        <button onPointerDown={addP}
                          style={{width:36,height:36,borderRadius:9,border:'none',background:C.ink,cursor:'pointer',fontSize:20,fontWeight:300,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,touchAction:'manipulation'}}>+</button>
                      )}
                    </div>
                  )
                })}
                {filtrados.length===0 && (
                  <div style={{textAlign:'center',padding:'24px 0',fontFamily:SE,fontStyle:'italic',fontSize:14,color:C.ink4}}>Sin resultados</div>
                )}
              </div>

              {/* Barra confirmar */}
              <div style={{padding:'10px 14px 20px',borderTop:`1px solid ${C.rule}`,flexShrink:0,background:C.bg1,display:'flex',gap:8}}>
                <button onClick={()=>{setVistaAnadir(false);setCartAnadir([]);setSearchAnadir('');setCatAnadir('todo')}}
                  style={{flex:1,padding:'12px',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>
                  Cancelar
                </button>
                <button onClick={enviarCartAnadir} disabled={savingAnadir||totalAnadir===0}
                  style={{flex:2,padding:'12px',background:totalAnadir>0?C.verm:C.bg3,border:'none',borderRadius:10,fontSize:13,fontWeight:700,color:totalAnadir>0?'#fff':C.ink4,cursor:totalAnadir>0?'pointer':'default',opacity:savingAnadir?.6:1}}>
                  {savingAnadir?'Añadiendo…':totalAnadir>0?`✓ Añadir ${totalAnadir} item${totalAnadir>1?'s':''}`:'Elige productos'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* FLASH MSG */}
        {savedMsg && !vistaAnadir && (
          <div style={{padding:'8px 20px',background:C.grS,borderTop:`1px solid ${C.gr}44`,
            fontFamily:SM,fontSize:11,color:C.gr,flexShrink:0}}>
            {savedMsg}
          </div>
        )}

        {/* ACCIONES FIJAS — solo en modo COMANDA */}
        {comanda && !vistaAnadir && (
          <div style={{padding:'10px 16px 20px',borderTop:`1px solid ${C.rule}`,flexShrink:0,display:'flex',gap:8,background:C.bg1}}>
            {comanda.estado !== 'cerrada' && <>
              <button onClick={()=>{ onAnadirPorVoz(mesaId!, mesaCodigo, comanda.id); onClose() }}
                style={{flex:1,padding:'11px 8px',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
                <span style={{fontSize:10,fontWeight:600,color:C.teal}}>Añadir voz</span>
              </button>
              <button onClick={()=>{setVistaAnadir(true);setCartAnadir([]);setSearchAnadir('');setCatAnadir('todo')}}
                style={{flex:1,padding:'11px 8px',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span style={{fontSize:10,fontWeight:600,color:C.ink3}}>＋ Añadir</span>
              </button>
              <button onClick={()=>setCobrarOpen(true)}
                style={{flex:2,padding:'11px 12px',background:C.verm,border:'none',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:'pointer'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>
                  Cobrar{comanda.total_estimado>0?` · ${comanda.total_estimado.toFixed(2).replace('.',',')} €`:''}
                </span>
              </button>
            </>}

            {/* ── COMANDA CERRADA: opciones de ticket y factura ── */}
            {comanda.estado === 'cerrada' && ['owner','jefe_sala'].includes(session.rol) && (
              <div style={{width:'100%',display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontFamily:SN,fontSize:11,color:C.ink4,textAlign:'center',letterSpacing:'0.5px',textTransform:'uppercase'}}>
                  Comanda cerrada
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button
                    onClick={()=>setAliasOpen(true)}
                    style={{flex:1,padding:'11px 8px',background:C.bg2,border:`1px solid ${hasAlias ? C.amb : C.rule}`,borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasAlias ? C.amb : C.ink3} strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span style={{fontSize:10,fontWeight:600,color:hasAlias ? C.amb : C.ink3}}>
                      {hasAlias ? 'Editar ticket' : 'Personalizar'}
                    </span>
                  </button>
                  <button
                    onClick={()=>setFacturaOpen(true)}
                    style={{flex:2,padding:'11px 12px',background:hasFactCliente ? C.grS : C.bg2,border:`1px solid ${hasFactCliente ? C.gr : C.rule}`,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:'pointer'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasFactCliente ? C.gr : C.ink3} strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <span style={{fontSize:13,fontWeight:600,color:hasFactCliente ? C.gr : C.ink3}}>
                      {hasFactCliente ? 'Ver factura emitida' : 'Emitir factura'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !comanda && (
          <div style={{padding:'12px 16px 20px',borderTop:`1px solid ${C.rule}`,flexShrink:0,background:C.bg1}}>
            <button onClick={onClose}
              style={{width:'100%',padding:13,background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,fontSize:13,fontWeight:600,color:C.ink3,cursor:'pointer'}}>
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

      {/* TICKET ALIAS MODAL */}
      {aliasOpen && comanda && (
        <TicketAliasModal
          comandaId={comanda.id}
          mesaLabel={mesaCodigo}
          items={comanda.items}
          session={session}
          onClose={()=>setAliasOpen(false)}
          onGuardado={()=>{ setHasAlias(true); setAliasOpen(false) }}
        />
      )}

      {/* FACTURA CLIENTE MODAL */}
      {facturaOpen && comanda && (
        <FacturaClienteModal
          comandaId={comanda.id}
          mesaLabel={mesaCodigo}
          total={comanda.total_estimado}
          session={session}
          onClose={()=>setFacturaOpen(false)}
          onEmitida={()=>{ setHasFactCliente(true); setFacturaOpen(false) }}
        />
      )}
    </>
  )
}
