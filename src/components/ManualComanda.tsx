'use client'
import { SE, SN, SM } from '@/lib/colors'
import { useState, useEffect, useCallback, useRef } from 'react'
import PlanoSala, { MesaPlano, ZonaInfo } from '@/components/PlanoSala'
import CobrarSheet from '@/components/edge/CobrarSheet'

const L = {
  bg:'#F6F1E7', bg2:'#EFE7D6', bg3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6', ruleS:'#B8A98B',
  red:'#D9442B', redS:'#F4D8CF',
  gr:'#3F7D44', grS:'#D4E4D2',
  amb:'#E8A33B', ambS:'#F7E3B6',
}

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
interface CartItem { producto_id:string; nombre:string; cantidad:number; precio_unitario:number|null; formato_id?:string; formato_nombre?:string; seccion_id?:string; notas?:string }
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
  const [notaIdx, setNotaIdx] = useState<number|null>(null)  // ítem con input de nota abierto
  const [cobrarOpen, setCobrarOpen] = useState(false)
  const [cuentaEnviada, setCuentaEnviada] = useState(false)
  const [cuentaLoading, setCuentaLoading] = useState(false)
  const [comandaActiva, setComandaActiva] = useState<{ id: string; total: number; estado: string } | null>(null)
  // Recomendaciones activas: Set de producto_id + mapa id→nota
  const [recsIds, setRecsIds] = useState<Set<string>>(new Set())
  const [recsNota, setRecsNota] = useState<Record<string, string>>({})  // producto_id → nota
  const [nombreCuenta, setNombreCuenta] = useState('')
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [draftNombre, setDraftNombre] = useState('')
  const [numComensales, setNumComensales] = useState(0)
  const nombreInputRef = useRef<HTMLInputElement>(null)

  // Scroll-safe: cancela tap si el dedo se movió >6px (es scroll, no tap)
  const ptrStart = useRef<{x:number, y:number} | null>(null)

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
      fetch('/api/recomendaciones', { headers }).then(r => r.ok ? r.json() : { recomendaciones: [] }),
    ]).then(([m, c, f, rec]) => {
      const ms = m.mesas ?? []
      setMesas(ms)
      const zs = [...new Set<string>(ms.map((x: Mesa) => x.zona))].filter(Boolean)
      setZonas(zs)
      setProductos((c.productos ?? []).filter((p: Producto) => p.activo))
      setFormatos(f.formatos ?? [])
      const recs: { producto_id: string; nota: string | null }[] = rec.recomendaciones ?? []
      setRecsIds(new Set(recs.map(r => r.producto_id)))
      const notaMap: Record<string, string> = {}
      recs.forEach(r => { if (r.nota) notaMap[r.producto_id] = r.nota })
      setRecsNota(notaMap)
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

  const selectMesa = (m: Mesa) => { setMesaId(m.id); setMesaSel(m); setStep('carta'); setNombreCuenta(''); setEditandoNombre(false); setDraftNombre('') }

  // Fetch comanda activa cuando cambia la mesa
  useEffect(() => {
    if (!mesaId) { setComandaActiva(null); return }
    fetch(`/api/mesa/${mesaId}/comanda`, { headers: h() })
      .then(r => r.json())
      .then(d => {
        if (d.comanda) {
          setComandaActiva({ id: d.comanda.id, total: d.comanda.total_estimado ?? 0, estado: d.comanda.estado })
          setCuentaEnviada(d.comanda.estado === 'cuenta_pedida')
        } else {
          setComandaActiva(null)
        }
      })
      .catch(() => setComandaActiva(null))
  }, [mesaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const pedirCuenta = async () => {
    if (!comandaActiva || cuentaEnviada || cuentaLoading) return
    setCuentaLoading(true)
    try {
      const res = await fetch(`/api/comanda/${comandaActiva.id}/pedir-cuenta`, {
        method: 'POST', headers: h(),
      })
      if (res.ok) {
        setCuentaEnviada(true)
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Error al pedir la cuenta — inténtalo de nuevo')
      }
    } catch {
      setError('Sin conexión al pedir cuenta')
    } finally { setCuentaLoading(false) }
  }

  const send = async () => {
    if (!mesaId || !cart.length) return
    setSending(true); setError('')
    try {
      const r = await fetch('/api/comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h() },
        body: JSON.stringify({ mesa_id: mesaId, items: cart.map(it => ({...it, notas: it.notas?.trim() || undefined})), tipo: 'comanda', ...(numComensales > 0 ? { num_comensales: numComensales } : {}), ...(nombreCuenta.trim() ? { nombre_cuenta: nombreCuenta.trim() } : {}) }),
      })
      const d = await r.json()
      if (d.ok) {
        // /api/comanda ya crea print_jobs internamente — no llamar /api/marchar aquí
        setSent(true)
        onSent()
        // Refetch comanda activa (puede haberse creado nueva)
        fetch(`/api/mesa/${mesaId}/comanda`, { headers: h() })
          .then(r => r.json())
          .then(dd => {
            if (dd.comanda) setComandaActiva({ id: dd.comanda.id, total: dd.comanda.total_estimado ?? 0, estado: dd.comanda.estado })
          }).catch(() => {})
        setTimeout(() => { setSent(false); setCart([]); setMesaId(''); setMesaSel(null); setStep('mesa'); setShowCart(false); setNotaIdx(null); setComandaActiva(null); setCuentaEnviada(false); setNombreCuenta(''); setEditandoNombre(false); setDraftNombre(''); setNumComensales(0) }, 2000)
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

        {step === 'mesa' && (
          <span style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink2 }}>Elige mesa</span>
        )}

        {step === 'carta' && !editandoNombre && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
            <span style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink2, whiteSpace:'nowrap' }}>
              Mesa {mesaSel?.codigo ?? ''}
            </span>
            {nombreCuenta && (
              <span style={{
                background:'rgba(232,163,59,0.14)', border:`1px solid ${L.amb}`,
                borderRadius:6, padding:'2px 8px',
                fontFamily:SM, fontSize:10, color:'#7A5910',
                maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                {nombreCuenta}
              </span>
            )}
            <button
              onPointerDown={() => { setDraftNombre(nombreCuenta); setEditandoNombre(true); setTimeout(() => nombreInputRef.current?.focus(), 40) }}
              title={nombreCuenta ? 'Editar nombre' : 'Añadir nombre'}
              style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px', color:L.ink4, display:'flex', alignItems:'center', flexShrink:0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
              </svg>
            </button>
          </div>
        )}

        {step === 'carta' && editandoNombre && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
            <input
              ref={nombreInputRef}
              type="text"
              value={draftNombre}
              onChange={e => setDraftNombre(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { setNombreCuenta(draftNombre.trim()); setEditandoNombre(false) }
                if (e.key === 'Escape') setEditandoNombre(false)
              }}
              placeholder="Ej: cumpleaños Ana…"
              maxLength={30}
              style={{ flex:1, padding:'4px 10px', background:L.bg2, border:'none',
                boxShadow:`${L.amb} 0 0 0 1.5px`, borderRadius:6,
                fontFamily:SN, fontSize:12, color:L.ink, outline:'none' }}
            />
            <button
              onPointerDown={() => { setNombreCuenta(draftNombre.trim()); setEditandoNombre(false) }}
              style={{ padding:'4px 10px', background:L.red, border:'none', borderRadius:6,
                color:'#fff', fontFamily:SN, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
              OK
            </button>
            <button
              onPointerDown={() => setEditandoNombre(false)}
              style={{ padding:'4px 8px', background:'transparent', border:`1px solid ${L.rule}`, borderRadius:6,
                color:L.ink3, fontFamily:SN, fontSize:12, cursor:'pointer', flexShrink:0 }}>
              ✕
            </button>
          </div>
        )}

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
        // Enriquecer mesas con datos de tiempo y estado desde mesasPlano (Realtime) si disponible
        // FIX: sobrescribir estado con el de mesasPlano — el array local `mesas` se carga una vez
        // al montar y no se actualiza; mesasPlano sí se sincroniza via Realtime desde edge/page.tsx
        const mesasEnriquecidas = mesasFiltradas.map(m => {
          const plano = mesasPlano?.find(p => p.id === m.id)
          return {
            ...m,
            estado: plano?.estado ?? m.estado,
            minutos: plano?.minutos_abierta ?? null,
            capacidad: plano?.capacidad ?? null,
          }
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
                const cnt = mesas.filter(m => m.zona === z.key && (mesasPlano?.find(p => p.id === m.id)?.estado ?? m.estado) !== 'libre').length
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
            <div style={{ flex:1, overflow:'auto', padding:'4px 14px 20px', touchAction:'pan-y' }}>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${nCols}, 1fr)`, gap:10 }}>
                {mesasEnriquecidas.map(m => {
                  const t = tiempoStr(m.minutos)
                  return (
                    <button key={m.id}
                      onPointerDown={e => { ptrStart.current = { x: e.clientX, y: e.clientY } }}
                      onPointerMove={e => {
                        if (!ptrStart.current) return
                        if (Math.abs(e.clientY - ptrStart.current.y) > 6) ptrStart.current = null
                      }}
                      onPointerUp={e => {
                        if (e.pointerType !== 'touch') return
                        if (!ptrStart.current) return
                        ptrStart.current = null
                        selectMesa(m)
                      }}
                      onPointerCancel={() => { ptrStart.current = null }}
                      onClick={e => {
                        if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return
                        selectMesa(m)
                      }}
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
                  const esRec = recsIds.has(p.id)
                  const notaRec = recsNota[p.id]
                  return (
                    <div key={p.id} style={{
                      background:L.bone, border:`1px solid ${inCart>0 ? L.red : esRec ? L.amb+'99' : L.rule}`,
                      borderRadius:10, padding:'10px 10px 8px',
                      display:'flex', flexDirection:'column', gap:4,
                      position:'relative',
                    }}>
                      {/* Badge cantidad en carrito */}
                      {inCart > 0 && (
                        <div style={{ position:'absolute', top:6, right:6, background:L.red, color:L.bone, borderRadius:999, padding:'1px 6px', fontFamily:SM, fontSize:9, fontWeight:700 }}>×{inCart}</div>
                      )}
                      {/* Badge recomendación ★ */}
                      {esRec && inCart === 0 && (
                        <div style={{ position:'absolute', top:6, right:6, background:L.amb, color:'#fff', borderRadius:999, width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, lineHeight:1 }}>★</div>
                      )}
                      {/* Nombre */}
                      <span style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink, lineHeight:1.25, paddingRight: (inCart>0||esRec)?22:0 }}>{p.nombre}</span>
                      {/* Nota del chef si es recomendación */}
                      {esRec && notaRec && (
                        <span style={{ fontFamily:"'Caveat',cursive", fontSize:12, color:L.amb, lineHeight:1.3 }}>{notaRec}</span>
                      )}
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
            maxHeight: showCart ? '55vh' : (cart.length || comandaActiva) ? '54px' : '0px',
            transition:'max-height .25s ease',
            overflow:'hidden', flexShrink:0,
          }}>
            {/* Header carrito — siempre visible, toca para expandir en móvil */}
            <div onPointerDown={() => (cart.length || comandaActiva) && setShowCart(sc => !sc)}
              style={{ padding:'0 10px 0 14px', height:54, borderBottom: showCart ? `1px solid ${L.rule}` : 'none', display:'flex', alignItems:'center', gap:8, flexShrink:0, cursor: (cart.length || comandaActiva) ? 'pointer' : 'default' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontFamily:SM, fontSize:10, color:L.ink3, letterSpacing:'.08em' }}>
                  COMANDA · {mesaSel?.codigo}
                  {totalItems > 0 && ` · ${totalItems} items`}
                </span>
                {cart.length > 0 && total > 0 && (
                  <div style={{ fontFamily:SE, fontSize:15, fontWeight:500, color:L.ink }}>{total.toFixed(2)}€</div>
                )}
              </div>
              {(cart.length > 0 || comandaActiva) && (
                <span style={{ fontFamily:SM, fontSize:10, color:L.ink4, flexShrink:0 }}>{showCart ? '▲' : '▼'}</span>
              )}
              {/* Botón Enviar inline — visible solo cuando plegado y hay items */}
              {!showCart && cart.length > 0 && (
                <>
                  {/* Selector comensales compacto */}
                  <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}
                    onPointerDown={e => e.stopPropagation()}>
                    <button onPointerDown={() => setNumComensales(n => Math.max(0, n-1))}
                      style={{ width:22,height:22,borderRadius:999,border:`1px solid ${L.rule}`,background:'transparent',cursor:'pointer',fontSize:14,color:L.ink3,display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
                    <span style={{ fontFamily:SM,fontSize:11,color:numComensales>0?L.ink:L.ink4,minWidth:14,textAlign:'center' as const }}>
                      {numComensales > 0 ? `${numComensales}p` : 'pax'}
                    </span>
                    <button onPointerDown={() => setNumComensales(n => Math.min(20, n+1))}
                      style={{ width:22,height:22,borderRadius:999,border:`1px solid ${L.rule}`,background:'transparent',cursor:'pointer',fontSize:14,color:L.ink3,display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                  </div>
                <button
                  onPointerDown={e => { e.stopPropagation(); send() }}
                  disabled={sending || sent}
                  style={{
                    flexShrink:0, padding:'8px 13px', borderRadius:9, border:'none',
                    background: sent ? L.gr : L.ink,
                    color: L.bone, fontFamily:SN, fontSize:12, fontWeight:700,
                    cursor: sending||sent ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', gap:5,
                    WebkitTapHighlightColor:'transparent', touchAction:'manipulation',
                    transition:'background .15s',
                  }}>
                  {sent ? '✓ Enviado' : sending ? '…' : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      Enviar
                    </>
                  )}
                </button>
                </>
              )}
            </div>

            {/* Items */}
            <div style={{ flex:1, overflow:'auto', padding:'0 14px' }}>
              {cart.length === 0 ? (
                <div style={{ padding:'12px 0', fontFamily:SE, fontSize:13, color:L.ink3, fontStyle:'italic' }}>Toca un producto para añadirlo.</div>
              ) : cart.map((it, i) => {
                const open = notaIdx === i
                const tieneNota = !!it.notas?.trim()
                return (
                  <div key={i} style={{ borderBottom:`1px solid ${L.rule}` }}>
                    {/* Fila principal */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0' }}>
                      <button onPointerDown={() => updateQty(i,-1)} style={{ width:26,height:26,borderRadius:999,border:`1px solid ${L.rule}`,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:L.ink,flexShrink:0 }}>−</button>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:L.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {it.nombre}
                          {it.formato_nombre && <span style={{ fontFamily:SM, fontSize:9, color:L.ink3, marginLeft:5 }}>{it.formato_nombre}</span>}
                        </div>
                        {/* Chip nota si tiene y está cerrado */}
                        {tieneNota && !open && (
                          <div style={{ display:'inline-flex', alignItems:'center', marginTop:2,
                            background:'rgba(232,163,59,0.12)', border:`1px solid ${L.amb}`,
                            borderRadius:20, padding:'1px 8px' }}>
                            <span style={{ fontFamily:SN, fontSize:10, color:L.amb }}>{it.notas}</span>
                          </div>
                        )}
                        {it.precio_unitario != null && (
                          <div style={{ fontFamily:SM, fontSize:10, color:L.ink3, marginTop: tieneNota&&!open ? 2 : 0 }}>{it.precio_unitario}€ × {it.cantidad} = {(it.precio_unitario * it.cantidad).toFixed(2)}€</div>
                        )}
                      </div>
                      <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:L.ink }}>{it.cantidad}</span>
                      <button onPointerDown={() => updateQty(i,+1)} style={{ width:26,height:26,borderRadius:999,border:`1px solid ${L.rule}`,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:L.ink,flexShrink:0 }}>+</button>
                      {/* Botón lápiz nota */}
                      <button
                        onPointerDown={() => { setShowCart(true); setNotaIdx(open ? null : i) }}
                        style={{ width:26,height:26,borderRadius:999,border:'none',flexShrink:0,cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          background: tieneNota||open ? 'rgba(232,163,59,0.18)' : 'transparent',
                          boxShadow: tieneNota||open ? `rgba(232,163,59,0.5) 0px 0px 0px 1px` : `rgba(200,184,154,0.5) 0px 0px 0px 1px` }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke={tieneNota||open ? L.amb : L.ink4} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                      </button>
                      <button onPointerDown={() => removeItem(i)} style={{ width:24,height:24,borderRadius:999,border:'none',background:'none',cursor:'pointer',color:L.red,fontSize:16,lineHeight:1 }}>×</button>
                    </div>
                    {/* Panel nota inline */}
                    {open && (
                      <div style={{ display:'flex', gap:6, alignItems:'center', paddingBottom:8 }}>
                        <input
                          autoFocus
                          type="text"
                          value={it.notas ?? ''}
                          onChange={e => setCart(prev => prev.map((c,j) => j===i ? {...c, notas: e.target.value} : c))}
                          onKeyDown={e => { if (e.key === 'Enter') setNotaIdx(null) }}
                          placeholder="en copa · sin sal · bien hecho…"
                          style={{ flex:1, padding:'6px 10px', background:L.bg2,
                            border:'none', boxShadow:`rgba(232,163,59,0.45) 0px 0px 0px 1.5px`,
                            borderRadius:6, fontFamily:SN, fontSize:12, color:L.ink, outline:'none' }}
                        />
                        <button onPointerDown={() => setNotaIdx(null)}
                          style={{ padding:'6px 12px', background: tieneNota ? L.amb : L.bg3,
                            border:'none', borderRadius:6, color: tieneNota ? '#fff' : L.ink3,
                            fontFamily:SN, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                          {tieneNota ? '✓' : '✕'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer: Cuenta + Cobrar (solo cuando hay comanda activa en mesa) */}
            {comandaActiva && showCart && (
              <div style={{ padding:'10px 14px 12px', flexShrink:0, borderTop:`1px solid ${L.rule}`, display:'flex', gap:8 }}>
                {error && <div style={{ fontFamily:SN, fontSize:11, color:L.red, marginBottom:6 }}>{error}</div>}
                {/* Pedir cuenta */}
                <button
                  onPointerDown={pedirCuenta}
                  disabled={cuentaEnviada || cuentaLoading}
                  style={{
                    flex:1, padding:'11px 8px', borderRadius:10, cursor: cuentaEnviada ? 'default' : 'pointer',
                    background: cuentaEnviada ? '#EAF3DE' : '#FEF3C7',
                    border: `1.5px solid ${cuentaEnviada ? L.gr : L.amb}`,
                    color: cuentaEnviada ? '#2A5C2E' : '#92610A',
                    fontFamily:SN, fontSize:13, fontWeight:700,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                    WebkitTapHighlightColor:'transparent',
                  }}>
                  {cuentaEnviada ? '✓ Cuenta' : cuentaLoading ? '…' : '🧾 Cuenta'}
                </button>
                {/* Cobrar */}
                <button
                  onPointerDown={() => setCobrarOpen(true)}
                  style={{
                    flex:1, padding:'11px 8px', borderRadius:10, cursor:'pointer',
                    background: L.red, border:'none', color:'#fff',
                    fontFamily:SN, fontSize:13, fontWeight:700,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                    WebkitTapHighlightColor:'transparent',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  Cobrar
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

      {/* ── COBRAR SHEET ── */}
      {cobrarOpen && comandaActiva && mesaSel && (
        <CobrarSheet
          comandaId={comandaActiva.id}
          mesaLabel={mesaSel.codigo}
          total={comandaActiva.total}
          session={session}
          onCerrado={(_result) => {
            setCobrarOpen(false)
            setComandaActiva(null)
            setCuentaEnviada(false)
            setShowCart(false)
            onSent()
          }}
          onCancel={() => setCobrarOpen(false)}
        />
      )}
    </div>
  )
}
