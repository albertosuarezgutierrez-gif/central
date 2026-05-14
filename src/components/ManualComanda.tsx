'use client'
import { useState, useEffect, useCallback } from 'react'
import PlanoSala, { MesaPlano, ZonaInfo } from '@/components/PlanoSala'

const L = {
  bg:'#F6F1E7', bg2:'#EFE7D6', bg3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6', ruleS:'#B8A98B',
  red:'#D9442B', redS:'#F4D8CF',
  gr:'#3F7D44', grS:'#D4E4D2',
  amb:'#E8A33B', ambS:'#F7E3B6',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

const ESTADO_DOT: Record<string,string> = {
  libre: L.ruleS, activa: L.gr, marchar: '#2D5C32',
  aviso: L.amb, urgente: L.red, cuenta: L.ink3,
}
const ESTADO_BG: Record<string,string> = {
  libre: L.bone, activa: '#EAF4EB', marchar: '#D4E4D2',
  aviso: L.ambS, urgente: L.redS, cuenta: L.bg2,
}
const ESTADO_BORDER: Record<string,string> = {
  libre: L.rule, activa: L.gr, marchar: '#2D5C32',
  aviso: L.amb, urgente: L.red, cuenta: L.ink4,
}

interface Mesa { id:string; codigo:string; zona:string; estado:string }
interface Producto { id:string; nombre:string; precio:number|null; categoria:string; activo:boolean; seccion:string; nombre_alternativo:string[] }
interface Formato { id:string; producto_id:string; nombre:string; precio:number; orden:number }
interface CartItem { producto_id:string; nombre:string; cantidad:number; precio_unitario:number|null; formato_id?:string; formato_nombre?:string; seccion_id?:string }
interface Session { id:string; nombre:string; rol:string; restaurante_id?:string }

export default function ManualComanda({
  session, onSent, onVoiceMode,
  mesasPlano, zonasPlano, zonasAsignadas,
}: {
  session: Session
  onSent: () => void
  onVoiceMode?: () => void
  mesasPlano?: MesaPlano[]
  zonasPlano?: ZonaInfo[]
  zonasAsignadas?: string[]
}) {
  const [step, setStep] = useState<'mesa'|'carta'>('mesa')
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [zonas, setZonas] = useState<string[]>([])
  const [zonaFiltro, setZonaFiltro] = useState('todas')
  const [mesaId, setMesaId] = useState('')
  const [mesaSel, setMesaSel] = useState<Mesa|null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [formatos, setFormatos] = useState<Formato[]>([])
  const [cat, setCat] = useState('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [formatoPicker, setFormatoPicker] = useState<Producto|null>(null)
  const [showCart, setShowCart] = useState(false)

  // Auto-filtrar según zonas asignadas del camarero
  useEffect(() => {
    if (zonasAsignadas && zonasAsignadas.length === 1) {
      setZonaFiltro(zonasAsignadas[0])
    } else {
      setZonaFiltro('todas')
    }
  }, [zonasAsignadas?.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const h = useCallback(() => ({
    'x-ia-session': JSON.stringify(session),
  }), [session])

  useEffect(() => {
    const headers = h()
    Promise.all([
      fetch('/api/owner/mesas', { headers }).then(r => r.json()),
      fetch('/api/owner/carta', { headers }).then(r => r.json()),
      fetch('/api/owner/formatos', { headers }).then(r => r.json()),
    ]).then(([m, c, f]) => {
      const ms = m.mesas ?? []
      setMesas(ms)
      const zs = [...new Set<string>(ms.map((x: Mesa) => x.zona))].filter(Boolean)
      setZonas(zs)
      setProductos((c.productos ?? []).filter((p: Producto) => p.activo))
      setFormatos(f.formatos ?? [])
    })
  }, [h])

  const categorias = ['all', ...Array.from(new Set(productos.map(p => p.categoria || 'Otros'))).sort()]
  const getFormatos = (pid: string) => formatos.filter(f => f.producto_id === pid).sort((a,b) => a.orden - b.orden)

  const addItem = (p: Producto, fmt?: Formato) => {
    setCart(prev => {
      const exist = prev.find(c => c.producto_id === p.id && c.formato_id === fmt?.id)
      if (exist) return prev.map(c => c.producto_id === p.id && c.formato_id === fmt?.id ? {...c, cantidad: c.cantidad + 1} : c)
      return [...prev, { producto_id: p.id, nombre: p.nombre, cantidad: 1, precio_unitario: fmt?.precio ?? p.precio, formato_id: fmt?.id, formato_nombre: fmt?.nombre, seccion_id: p.seccion }]
    })
    setFormatoPicker(null)
  }

  const tapProduct = (p: Producto) => {
    const fmts = getFormatos(p.id)
    if (fmts.length > 0) setFormatoPicker(p)
    else addItem(p)
  }

  const updateQty = (idx: number, delta: number) => setCart(prev => prev.map((c,i) => i === idx ? { ...c, cantidad: Math.max(1, c.cantidad + delta) } : c).filter(c => c.cantidad > 0))
  const removeItem = (idx: number) => setCart(prev => prev.filter((_,i) => i !== idx))

  const total = cart.reduce((s, it) => s + (it.precio_unitario ?? 0) * it.cantidad, 0)
  const totalItems = cart.reduce((s, it) => s + it.cantidad, 0)

  const selectMesa = (m: Mesa) => { setMesaId(m.id); setMesaSel(m); setStep('carta') }

  const send = async () => {
    if (!mesaId || !cart.length) return
    setSending(true); setError('')
    try {
      const r = await fetch('/api/comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h() },
        body: JSON.stringify({ mesa_id: mesaId, items: cart, tipo: 'comanda' }),
      })
      const d = await r.json()
      if (d.ok) {
        // /api/comanda ya crea print_jobs internamente — no llamar /api/marchar aquí
        setSent(true)
        onSent()
        setTimeout(() => { setSent(false); setCart([]); setMesaId(''); setMesaSel(null); setStep('mesa'); setShowCart(false) }, 2000)
      } else { setError(d.error ?? 'Error') }
    } catch { setError('Error de red') }
    finally { setSending(false) }
  }

  const filtered = productos.filter(p => {
    const mc = cat === 'all' || (p.categoria || 'Otros') === cat
    const q = search.toLowerCase()
    const mq = !q || p.nombre.toLowerCase().includes(q) || (p.nombre_alternativo ?? []).some(a => a.toLowerCase().includes(q))
    return mc && mq
  })

  const mesasFiltradas = zonaFiltro === 'todas'
    ? (zonasAsignadas?.length ? mesas.filter(m => zonasAsignadas.includes(m.zona)) : mesas)
    : mesas.filter(m => m.zona === zonaFiltro)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:L.bg, fontFamily:SN, overflow:'hidden' }}>
      <style>{`
        .pb { background:${L.bone}; border:1px solid ${L.rule}; border-radius:8px; cursor:pointer; text-align:left; transition:background .1s,transform .08s; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
        .pb:active { background:${L.bg2}; transform:scale(.96); }
        .pb:hover { background:${L.bg2}; }
        .cb { padding:6px 14px; border-radius:999px; border:1px solid ${L.rule}; background:transparent; cursor:pointer; font-family:${SN}; font-size:12px; font-weight:600; color:${L.ink3}; white-space:nowrap; transition:all .1s; -webkit-tap-highlight-color:transparent; }
        .cb.on { background:${L.ink}; border-color:${L.ink}; color:${L.bone}; }
        .zb { padding:5px 12px; border-radius:999px; border:1px solid ${L.rule}; background:transparent; cursor:pointer; font-family:${SM}; font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:${L.ink3}; transition:all .1s; -webkit-tap-highlight-color:transparent; }
        .zb.on { background:${L.red}; border-color:${L.red}; color:${L.bone}; }
        @keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
        @keyframes sent{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @media(min-width:768px){
          .ml{flex-direction:row!important}
          .pp{flex:1.6!important;border-right:1px solid ${L.rule};border-bottom:none!important}
          .cp{width:300px!important;flex:none!important;max-height:none!important;border-top:none!important}
          .pg{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))!important}
          .step-mesa .mg{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))!important}
        }
        @media(min-width:1100px){
          .pp{flex:1.8!important}
          .cp{width:340px!important}
          .pg{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))!important}
        }
      `}</style>

      {/* ── HEADER — solo navegación, sin logo ni usuario (redundantes con nav global) ── */}
      <div style={{ height:44, padding:'0 14px', borderBottom:`1px solid ${L.rule}`, background:L.bone, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        {/* Breadcrumb paso */}
        {step === 'carta' && (
          <button onPointerDown={() => setStep('mesa')}
            style={{ fontFamily:SM, fontSize:9, color:L.ink3, background:'none', border:`1px solid ${L.rule}`, borderRadius:3, padding:'3px 8px', cursor:'pointer', letterSpacing:'.06em' }}>
            ← MESAS
          </button>
        )}
        <span style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink2 }}>
          {step === 'mesa' ? 'Elige mesa' : `Mesa ${mesaSel?.codigo ?? ''}`}
        </span>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {/* Badge carrito en móvil */}
          {cart.length > 0 && step === 'carta' && (
            <button onPointerDown={() => setShowCart(sc => !sc)}
              style={{ position:'relative', background:L.red, border:'none', borderRadius:999, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={L.bone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              <span style={{ position:'absolute', top:-4, right:-4, background:L.ink, color:L.bone, borderRadius:999, width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:SM, fontSize:9, fontWeight:700 }}>{totalItems}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── STEP: MESAS ── */}
      {step === 'mesa' && (() => {
        // Enriquecer mesas con datos de tiempo desde mesasPlano si disponible
        const mesasEnriquecidas = mesasFiltradas.map(m => {
          const plano = mesasPlano?.find(p => p.id === m.id)
          return { ...m, minutos: plano?.minutos_abierta ?? null, capacidad: plano?.capacidad ?? null }
        })
        // Zonas para tabs — usar zonasPlano si hay, si no usar zonas string[]
        const zonaTabsAll = zonasPlano && zonasPlano.length > 0
          ? zonasPlano.map(z => ({ key: z.tipo, label: z.nombre }))
          : zonas.map(z => ({ key: z, label: z }))
        const zonaTabs = zonasAsignadas?.length
          ? zonaTabsAll.filter(z => zonasAsignadas.includes(z.key))
          : zonaTabsAll

        // Colores de sombra por estado (técnica shadow ring tintada)
        const shadowCard = (estado: string) => {
          const m: Record<string, string> = {
            libre:   `rgba(200,184,154,0.45) 0px 0px 0px 1px`,
            activa:  `rgba(63,125,68,0.35) 0px 0px 0px 1px, rgba(63,125,68,0.12) 0px 5px 14px -3px`,
            marchar: `rgba(45,122,45,0.4) 0px 0px 0px 1px, rgba(45,122,45,0.16) 0px 5px 14px -3px`,
            aviso:   `rgba(232,163,59,0.4) 0px 0px 0px 1px, rgba(232,163,59,0.14) 0px 5px 14px -3px`,
            urgente: `rgba(217,68,43,0.45) 0px 0px 0px 1px, rgba(217,68,43,0.18) 0px 5px 14px -3px`,
            cuenta:  `rgba(107,95,82,0.35) 0px 0px 0px 1px, rgba(107,95,82,0.1) 0px 5px 14px -3px`,
          }
          return m[estado] ?? m.libre
        }
        const bgCard = (estado: string) => ({
          libre:'#F6F1E7', activa:'rgba(63,125,68,.08)', marchar:'rgba(63,125,68,.14)',
          aviso:'rgba(232,163,59,.08)', urgente:'rgba(217,68,43,.08)', cuenta:'#EFE7D6',
        }[estado] ?? '#F6F1E7')
        const fgCard = (estado: string) => ({
          libre:L.ink4, activa:'#2A5C2E', marchar:'#1F4A23',
          aviso:'#A8761A', urgente:L.red, cuenta:L.ink3,
        }[estado] ?? L.ink4)
        const tiempoStr = (min: number | null) => {
          if (!min || min < 1) return null
          return min < 60 ? `${min}'` : `${Math.floor(min/60)}h${min%60?min%60+"'":""}`
        }
        const nCols = mesasEnriquecidas.length <= 4 ? 2 : 3

        return (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Tabs de zona */}
            <div style={{ padding:'0 14px', borderBottom:`1px solid ${L.rule}`, background:L.bone, display:'flex', gap:0, overflowX:'auto', scrollbarWidth:'none', flexShrink:0 }}>
              <button
                onPointerDown={() => setZonaFiltro('todas')}
                style={{ border:'none', background:'none', padding:'9px 10px', fontFamily:SN, fontWeight: zonaFiltro==='todas'?700:500, fontSize:'0.82rem', color: zonaFiltro==='todas'?L.ink:L.ink3, borderBottom: zonaFiltro==='todas'?`2px solid ${L.red}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1, transition:'all .14s' }}>
                Todas
              </button>
              {zonaTabs.map(z => {
                const cnt = mesas.filter(m => m.zona === z.key && m.estado !== 'libre').length
                return (
                  <button key={z.key}
                    onPointerDown={() => setZonaFiltro(z.key)}
                    style={{ border:'none', background:'none', padding:'9px 10px', fontFamily:SN, fontWeight: zonaFiltro===z.key?700:500, fontSize:'0.82rem', color: zonaFiltro===z.key?L.ink:L.ink3, borderBottom: zonaFiltro===z.key?`2px solid ${L.red}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1, transition:'all .14s', display:'flex', alignItems:'center', gap:5 }}>
                    {z.label}
                    {cnt > 0 && <span style={{ background: zonaFiltro===z.key?L.red:L.bg2, color: zonaFiltro===z.key?'#fff':L.ink3, borderRadius:9999, padding:'0 6px', fontSize:'0.62rem', fontWeight:700, lineHeight:'16px' }}>{cnt}</span>}
                  </button>
                )
              })}
            </div>

            {/* Info strip */}
            <div style={{ padding:'8px 14px 4px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <span style={{ fontFamily:SM, fontSize:'0.6rem', color:L.ink4, letterSpacing:'.08em', textTransform:'uppercase' }}>
                {mesasEnriquecidas.length} mesa{mesasEnriquecidas.length!==1?'s':''} · {mesasEnriquecidas.filter(m=>m.estado!=='libre').length} ocupadas
              </span>
            </div>

            {/* Grid mesas */}
            <div style={{ flex:1, overflow:'auto', padding:'4px 14px 20px' }}>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${nCols}, 1fr)`, gap:10 }}>
                {mesasEnriquecidas.map(m => {
                  const t = tiempoStr(m.minutos)
                  return (
                    <button key={m.id} onPointerDown={() => selectMesa(m)}
                      style={{ padding: nCols===3?'13px 8px 11px':'16px 10px 14px', borderRadius:12, border:'none', background:bgCard(m.estado), boxShadow:shadowCard(m.estado), cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, transition:'all .15s cubic-bezier(.4,0,.2,1)', WebkitTapHighlightColor:'transparent' }}>
                      <span style={{ fontFamily:SE, fontStyle:'italic', fontSize: nCols===3?'1.25rem':'1.4rem', fontWeight:500, color:L.ink, lineHeight:1 }}>
                        {m.codigo}
                      </span>
                      <span style={{ fontFamily:SM, fontSize:'0.65rem', fontWeight:700, color:fgCard(m.estado), letterSpacing:'.05em', textTransform:'uppercase' }}>
                        {t ?? (m.estado==='libre' ? 'libre' : m.estado)}
                      </span>
                      {m.capacidad && (
                        <span style={{ fontFamily:SN, fontSize:'0.58rem', color:L.ink4, marginTop:1 }}>{m.capacidad} pax</span>
                      )}
                    </button>
                  )
                })}
                {mesasEnriquecidas.length === 0 && (
                  <div style={{ gridColumn:'1/-1', fontFamily:SE, fontStyle:'italic', fontSize:14, color:L.ink3, padding:32, textAlign:'center' }}>
                    Sin mesas en esta zona.
                  </div>
                )}
              </div>
            </div>

            {/* Leyenda */}
            <div style={{ padding:'8px 14px 10px', borderTop:`1px solid ${L.rule}`, display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', flexShrink:0 }}>
              {[['#C8B89A','Libre'],['#3F7D44','< 15\''],['#E8A33B','15–30\''],['#E07040','30–45\''],['#D9442B','> 45\'']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:c, display:'inline-block' }}/>
                  <span style={{ fontFamily:SN, fontSize:'0.62rem', color:L.ink4 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}


      {/* ── STEP: CARTA ── */}
      {step === 'carta' && (
        <div className="ml" style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>

          {/* Panel productos */}
          <div className="pp" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', borderBottom:`1px solid ${L.rule}` }}>
            {/* Búsqueda + categorías */}
            <div style={{ padding:'8px 12px 6px', borderBottom:`1px solid ${L.rule}`, flexShrink:0 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                style={{ width:'100%', padding:'7px 10px', background:L.bg2, border:`1px solid ${L.rule}`, borderRadius:4, fontFamily:SN, fontSize:13, color:L.ink, outline:'none', boxSizing:'border-box', marginBottom:8 }}/>
              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                {categorias.map(c => (
                  <button key={c} className={`cb ${cat===c?'on':''}`} onPointerDown={() => setCat(c)}>
                    {c === 'all' ? 'Todo' : c}
                  </button>
                ))}
              </div>
            </div>
            {/* Grid productos — estilo PDA */}
            <div style={{ flex:1, overflow:'auto', padding:10 }}>
              <div className="pg" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10 }}>
                {filtered.map(p => {
                  const fmts = getFormatos(p.id)
                  const inCart = cart.filter(c => c.producto_id === p.id).reduce((s,c) => s+c.cantidad, 0)
                  return (
                    <div key={p.id} style={{
                      background:L.bone, border:`1px solid ${inCart>0?L.red:L.rule}`,
                      borderRadius:10, padding:'10px 10px 8px',
                      display:'flex', flexDirection:'column', gap:4,
                      position:'relative',
                    }}>
                      {/* Badge cantidad en carrito */}
                      {inCart > 0 && (
                        <div style={{ position:'absolute', top:6, right:6, background:L.red, color:L.bone, borderRadius:999, padding:'1px 6px', fontFamily:SM, fontSize:9, fontWeight:700 }}>×{inCart}</div>
                      )}
                      {/* Nombre */}
                      <span style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink, lineHeight:1.25, paddingRight: inCart>0?22:0 }}>{p.nombre}</span>
                      {/* Precio o formatos */}
                      {fmts.length > 0 ? (
                        <span style={{ fontFamily:SM, fontSize:9, color:L.ink3, lineHeight:1.4 }}>
                          {fmts.map(f => `${f.nombre} ${f.precio}€`).join(' · ')}
                        </span>
                      ) : p.precio != null ? (
                        <span style={{ fontFamily:SM, fontSize:11, color:L.ink3 }}>{p.precio}€</span>
                      ) : null}
                      {/* Botón + explícito — único punto de acción */}
                      <button
                        onPointerDown={e => { e.stopPropagation(); tapProduct(p) }}
                        style={{
                          marginTop:4, alignSelf:'flex-end',
                          width:32, height:32, borderRadius:8,
                          background:L.ink, border:'none', color:L.bone,
                          fontSize:20, lineHeight:1, fontWeight:300,
                          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                          flexShrink:0, WebkitTapHighlightColor:'transparent',
                          touchAction:'manipulation',
                        }}>
                        +
                      </button>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ gridColumn:'1/-1', fontFamily:SE, fontSize:13, color:L.ink3, fontStyle:'italic', padding:'20px 0', textAlign:'center' }}>Sin resultados.</div>
                )}
              </div>
            </div>
          </div>

          {/* Panel carrito — siempre visible en desktop, toggle en móvil */}
          <div className="cp" style={{
            borderTop:`1px solid ${L.rule}`, background:L.bone,
            display:'flex', flexDirection:'column',
            maxHeight: showCart ? '55vh' : cart.length ? '100px' : '64px',
            transition:'max-height .25s ease',
            overflow:'hidden', flexShrink:0,
          }}>
            {/* Header carrito — siempre visible, toca para expandir en móvil */}
            <div onPointerDown={() => cart.length && setShowCart(sc => !sc)}
              style={{ padding:'10px 14px', borderBottom:`1px solid ${L.rule}`, display:'flex', alignItems:'center', gap:8, flexShrink:0, cursor: cart.length ? 'pointer' : 'default' }}>
              <span style={{ fontFamily:SM, fontSize:10, color:L.ink3, letterSpacing:'.08em' }}>
                COMANDA · {mesaSel?.codigo}
                {totalItems > 0 && ` · ${totalItems} items`}
              </span>
              {cart.length > 0 && total > 0 && (
                <span style={{ fontFamily:SE, fontSize:15, fontWeight:500, color:L.ink, marginLeft:'auto' }}>{total.toFixed(2)}€</span>
              )}
              {cart.length > 0 && (
                <span style={{ fontFamily:SM, fontSize:10, color:L.ink4 }}>{showCart ? '▲' : '▼'}</span>
              )}
            </div>

            {/* Items */}
            <div style={{ flex:1, overflow:'auto', padding:'0 14px' }}>
              {cart.length === 0 ? (
                <div style={{ padding:'12px 0', fontFamily:SE, fontSize:13, color:L.ink3, fontStyle:'italic' }}>Toca un producto para añadirlo.</div>
              ) : cart.map((it, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:`1px solid ${L.rule}` }}>
                  <button onPointerDown={() => updateQty(i,-1)} style={{ width:26,height:26,borderRadius:999,border:`1px solid ${L.rule}`,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:L.ink,flexShrink:0 }}>−</button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {it.nombre}
                      {it.formato_nombre && <span style={{ fontFamily:SM, fontSize:9, color:L.ink3, marginLeft:5 }}>{it.formato_nombre}</span>}
                    </div>
                    {it.precio_unitario != null && (
                      <div style={{ fontFamily:SM, fontSize:10, color:L.ink3 }}>{it.precio_unitario}€ × {it.cantidad} = {(it.precio_unitario * it.cantidad).toFixed(2)}€</div>
                    )}
                  </div>
                  <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:L.ink }}>{it.cantidad}</span>
                  <button onPointerDown={() => updateQty(i,+1)} style={{ width:26,height:26,borderRadius:999,border:`1px solid ${L.rule}`,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:L.ink,flexShrink:0 }}>+</button>
                  <button onPointerDown={() => removeItem(i)} style={{ width:24,height:24,borderRadius:999,border:'none',background:'none',cursor:'pointer',color:L.red,fontSize:16,lineHeight:1 }}>×</button>
                </div>
              ))}
            </div>

            {/* Footer envío */}
            {cart.length > 0 && (
              <div style={{ padding:'10px 14px 14px', flexShrink:0, borderTop: showCart ? `1px solid ${L.rule}` : 'none' }}>
                {error && <div style={{ fontFamily:SN, fontSize:11, color:L.red, marginBottom:6 }}>{error}</div>}
                <button onPointerDown={send} disabled={sending || sent}
                  style={{ width:'100%', padding:'13px', borderRadius:4, border:'none', fontFamily:SN, fontSize:14, fontWeight:700, cursor: sending||sent ? 'default' : 'pointer', transition:'all .2s', animation: sent ? 'sent .4s ease' : 'none',
                    background: sent ? L.gr : L.ink, color: L.bone }}>
                  {sent ? '✓ Enviado a cocina' : sending ? 'Enviando...' : `Enviar a cocina — ${mesaSel?.codigo}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL FORMATO ── */}
      {formatoPicker && (
        <div onPointerDown={() => setFormatoPicker(null)}
          style={{ position:'fixed', inset:0, background:'rgba(26,23,20,.55)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:50 }}>
          <div onPointerDown={e => e.stopPropagation()}
            style={{ background:L.bone, borderRadius:'12px 12px 0 0', padding:'20px 20px 36px', width:'100%', maxWidth:420, animation:'slideUp .2s ease' }}>
            <div style={{ fontFamily:SE, fontSize:22, color:L.ink, marginBottom:4 }}>{formatoPicker.nombre}</div>
            <div style={{ fontFamily:SN, fontSize:12, color:L.ink3, marginBottom:14 }}>Elige el formato:</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {getFormatos(formatoPicker.id).map(f => (
                <button key={f.id} onPointerDown={() => addItem(formatoPicker, f)}
                  style={{ padding:'14px 16px', background:L.bg, border:`1px solid ${L.rule}`, borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', fontFamily:SN, fontSize:14, transition:'background .1s' }}>
                  <span style={{ fontWeight:600, color:L.ink }}>{f.nombre}</span>
                  <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:L.ink3 }}>{f.precio}€</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
