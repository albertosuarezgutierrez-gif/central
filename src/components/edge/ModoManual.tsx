'use client'
import React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg:'#14110E', e1:'#1F1A15', e2:'#2A241D', e3:'#2F2820',
  fg:'#F6F1E7', fg2:'#C9BFAA', fg3:'#8D8270',
  rule:'#2F2820', rS:'#4A3F33',
  red:'#D9442B', rD:'#A8311E', grS:'rgba(63,125,68,.15)',
  gr:'#3F7D44', amber:'#E8A33B',
}
const L = {
  bg:'#F6F1E7', bg2:'#EFE7D6', bg3:'#E5DAC2',
  fg:'#1A1714', fg2:'#3A332C', fg3:'#6B5F52',
  rule:'#D8CDB6', rS:'#B8A98B',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

interface Mesa { id:string; codigo:string; zona:string; estado:string }
interface Formato { id:string; nombre:string; precio:number }
interface Producto { id:string; nombre:string; categoria:string; precio:number|null; seccion:string; nombre_alternativo:string[]; formatos?:Formato[] }
interface LineaComanda { producto:Producto; cantidad:number; formato:Formato|null; notas:string }

function shadowMesa(estado: string, selected = false): string {
  if (selected) return `rgba(217,68,43,0.25) 0px 0px 0px 2px, rgba(217,68,43,0.20) 0px 6px 20px -4px`
  const map: Record<string, string> = {
    libre:    `rgba(200,184,154,0.5) 0px 0px 0px 1px`,
    activa:   `rgba(63,125,68,0.35) 0px 0px 0px 1px, rgba(63,125,68,0.15) 0px 5px 14px -3px`,
    marchar:  `rgba(45,122,45,0.4) 0px 0px 0px 1px, rgba(45,122,45,0.18) 0px 5px 14px -3px`,
    aviso:    `rgba(232,163,59,0.4) 0px 0px 0px 1px, rgba(232,163,59,0.15) 0px 5px 14px -3px`,
    urgente:  `rgba(217,68,43,0.45) 0px 0px 0px 1px, rgba(217,68,43,0.20) 0px 5px 14px -3px`,
    cuenta:   `rgba(107,95,82,0.4) 0px 0px 0px 1px, rgba(107,95,82,0.12) 0px 5px 14px -3px`,
  }
  return map[estado] ?? map.libre
}

const ESTADO_FG: Record<string,string> = {
  libre:'#4A3F33', activa:'#3F7D44', marchar:'#2D7A2D',
  aviso:'#E8A33B', urgente:'#D9442B', cuenta:'#6B5F52',
  reservada:'#1D4ED8',
}
const ESTADO_BG_LIGHT: Record<string,string> = {
  libre:'#EFE7D6', activa:'rgba(63,125,68,.10)', marchar:'rgba(63,125,68,.16)',
  aviso:'rgba(232,163,59,.10)', urgente:'rgba(217,68,43,.10)', cuenta:'#E5DAC2',
  reservada:'rgba(59,130,246,.08)',
}

interface Props {
  session: { id:string; nombre:string; rol:string; restaurante_id:string }
  turnoId: string | null
  onBack?: () => void
}

export default function ModoManual({ session, turnoId, onBack }: Props) {
  const T = { ...C, bg:L.bg, e1:L.bg2, e2:L.bg3, fg:L.fg, fg2:L.fg2, fg3:L.fg3, rule:L.rule, rS:L.rS }

  const [step, setStep] = useState<'mesa'|'carta'|'resumen'|'enviado'|'error'>('mesa')
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [mesaSel, setMesaSel] = useState<Mesa|null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [catActiva, setCatActiva] = useState('')
  const [lineas, setLineas] = useState<LineaComanda[]>([])
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [ticketNum, setTicketNum] = useState<number|null>(null)
  const [notaGeneral, setNotaGeneral] = useState('')
  const [zonas, setZonas] = useState<string[]>([])
  const [zonaFiltro, setZonaFiltro] = useState('todas')
  const [nombreMesa, setNombreMesa] = useState('')
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [notaAbiertaIdx, setNotaAbiertaIdx] = useState<number|null>(null)  // índice del ítem con input de nota abierto

  // ── Filtro "Mis mesas" ──────────────────────────────────────
  const [misFiltro, setMisFiltro] = useState(false)       // activo o no
  const [misMesasIds, setMisMesasIds] = useState<Set<string>>(new Set()) // IDs con comanda abierta

  // Scroll-safe
  const ptrStart = useRef<{x:number, y:number} | null>(null)

  const sh = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-ia-session': JSON.stringify(session),
  }), [session])

  // Carga mesas y carta
  useEffect(() => {
    fetch('/api/owner/mesas', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.mesas) {
          setMesas(d.mesas)
          const zs = [...new Set<string>(d.mesas.map((m: Mesa) => m.zona))]
          setZonas(zs)
        }
      })
    fetch('/api/owner/carta', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.productos) {
          const prods: Producto[] = d.productos
          setProductos(prods)
          const cats = [...new Set<string>(prods.map(p => p.categoria || p.seccion || 'Otros'))]
          setCategorias(cats)
          if (cats.length) setCatActiva(cats[0])
        }
      })
    fetch('/api/owner/formatos', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.formatos) {
          setProductos(prev => prev.map(p => ({
            ...p,
            formatos: d.formatos.filter((f: Formato & {producto_id:string}) => f.producto_id === p.id)
          })))
        }
      })
  }, [sh])

  // Polling "mis mesas" abiertas → para el chip con contador y el filtro
  useEffect(() => {
    const cargar = () =>
      fetch('/api/edge/mis-cuentas', { headers: sh() })
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d.cuentas)) {
            const ids = new Set<string>(
              (d.cuentas as { mesa: { id: string } | null }[])
                .map(c => c.mesa?.id)
                .filter((id): id is string => !!id)
            )
            setMisMesasIds(ids)
          }
        })
        .catch(() => {})
    cargar()
    const iv = setInterval(cargar, 20_000)
    return () => clearInterval(iv)
  }, [sh])

  const addProducto = (p: Producto, fmt: Formato | null = null) => {
    setLineas(prev => {
      const exist = prev.find(l => l.producto.id === p.id && l.formato?.id === fmt?.id)
      if (exist) return prev.map(l => l.producto.id === p.id && l.formato?.id === fmt?.id ? {...l, cantidad: l.cantidad + 1} : l)
      return [...prev, { producto: p, cantidad: 1, formato: fmt, notas: '' }]
    })
  }

  const removeLinea = (idx: number) => setLineas(prev => prev.filter((_,i) => i !== idx))
  const updateCantidad = (idx: number, delta: number) => setLineas(prev => prev.map((l,i) => i===idx ? {...l, cantidad: Math.max(1, l.cantidad+delta)} : l))

  const totalPrecio = lineas.reduce((acc, l) => {
    const precio = l.formato ? l.formato.precio : (l.producto.precio ?? 0)
    return acc + precio * l.cantidad
  }, 0)

  const enviar = async () => {
    if (!mesaSel || !lineas.length) return
    setEnviando(true)
    try {
      const items = lineas.map(l => ({
        nombre: l.formato ? `${l.producto.nombre} (${l.formato.nombre})` : l.producto.nombre,
        cantidad: l.cantidad,
        notas: l.notas || undefined,
        producto_id: l.producto.id,
        precio_unitario: l.formato ? l.formato.precio : (l.producto.precio ?? undefined),
        formato_id: l.formato?.id ?? undefined,
        formato_nombre: l.formato?.nombre ?? undefined,
        seccion_id: l.producto.seccion ?? undefined,
      }))
      const r = await fetch('/api/comanda', {
        method: 'POST',
        headers: sh(),
        body: JSON.stringify({
          mesa_id: mesaSel.id, items, tipo: 'comanda',
          ...(notaGeneral.trim() ? { nota_general: notaGeneral.trim() } : {}),
          ...(nombreMesa.trim()  ? { nombre_cuenta: nombreMesa.trim()  } : {}),
        }),
      })
      const d = await r.json()
      if (d.ok) {
        // /api/comanda ya crea print_jobs internamente — no llamar /api/marchar aquí
        setTicketNum(d.numero_ticket)
        setStep('enviado')
      } else {
        setErrorMsg(d.error ?? 'Error al enviar')
        setStep('error')
      }
    } catch {
      setErrorMsg('Error de red')
      setStep('error')
    } finally {
      setEnviando(false)
    }
  }

  const reset = () => {
    setStep('mesa'); setMesaSel(null); setLineas([])
    setErrorMsg(''); setTicketNum(null); setNotaGeneral(''); setNombreMesa(''); setEditandoNombre(false); setNotaAbiertaIdx(null)
  }

  // ── Filtrado de mesas ──────────────────────────────────────
  const mesasFiltradas = misFiltro
    ? mesas.filter(m => misMesasIds.has(m.id))
    : (zonaFiltro === 'todas' ? mesas : mesas.filter(m => m.zona === zonaFiltro))

  const prodsFiltrados = productos.filter(p => (p.categoria || p.seccion || 'Otros') === catActiva)

  const wrapStyle: React.CSSProperties = {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: T.bg, fontFamily: SN,
  }

  // ── Estilos chip reutilizables ─────────────────────────────
  const chipBase: React.CSSProperties = {
    fontFamily: SM, fontSize: 9, padding: '4px 12px', borderRadius: 9999,
    border: 'none', cursor: 'pointer', letterSpacing: '.06em',
    transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 4,
  }
  const chipOff: React.CSSProperties = {
    ...chipBase, boxShadow: `${T.rS} 0px 0px 0px 1px`,
    background: 'transparent', color: T.fg3,
  }
  const chipOn: React.CSSProperties = {
    ...chipBase, background: C.red, boxShadow: 'none', color: C.fg,
  }

  const Header = () => (
    <div style={{ flexShrink:0, background:L.bg2, borderBottom:`1px solid ${T.rule}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px' }}>
        {step !== 'mesa' && (
          <button onPointerDown={() => { setStep('mesa'); setLineas([]) }}
            style={{ background:'none', border:'none', boxShadow:`${T.rS} 0px 0px 0px 1px`, borderRadius:9999,
              padding:'4px 10px', color:T.fg3, fontFamily:SM, fontSize:9, cursor:'pointer', letterSpacing:'.06em', flexShrink:0 }}>
            ← MESAS
          </button>
        )}
        {mesaSel && (
          <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:T.fg, fontWeight:500, lineHeight:1 }}>
            {mesaSel.codigo}
          </span>
        )}
        {mesaSel && step === 'carta' && (
          editandoNombre ? (
            <input
              autoFocus
              value={nombreMesa}
              onChange={e => setNombreMesa(e.target.value)}
              onBlur={() => setEditandoNombre(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoNombre(false) }}
              placeholder="Nombre…"
              style={{ flex:1, background:L.bg, border:`1px solid ${T.amber}`, borderRadius:8,
                padding:'4px 10px', fontFamily:SN, fontSize:13, color:T.fg, outline:'none', minWidth:0 }}
            />
          ) : (
            <button onPointerDown={() => setEditandoNombre(true)}
              style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center',
                gap:5, padding:'2px 0', minWidth:0 }}>
              {nombreMesa
                ? <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:14, color:T.amber }}>★ {nombreMesa}</span>
                : <span style={{ fontFamily:SN, fontSize:11, color:T.fg3 }}>+ nombre</span>
              }
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.fg3} strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )
        )}
        <div style={{ flex:1 }}/>
        {lineas.length > 0 && (
          <span style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.red, flexShrink:0 }}>
            {lineas.reduce((a,l) => a+l.cantidad, 0)}u · {totalPrecio.toFixed(2)}€
          </span>
        )}
        {lineas.length > 0 && step === 'carta' && (
          <button onPointerDown={() => setStep('resumen')}
            style={{ background:C.red, border:'none', borderRadius:9999, padding:'6px 14px',
              color:C.fg, fontFamily:SN, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            Revisar →
          </button>
        )}
        {step === 'mesa' && onBack && (
          <button onPointerDown={onBack}
            style={{ background:'none', border:'none', boxShadow:`${T.rS} 0px 0px 0px 1px`, borderRadius:9999,
              padding:'4px 10px', color:T.fg3, fontFamily:SM, fontSize:9, cursor:'pointer', letterSpacing:'.06em' }}>
            ← VOZ
          </button>
        )}
      </div>
    </div>
  )

  // ══ STEP: MESA ════════════════════════════════════════════
  if (step === 'mesa') return (
    <div style={wrapStyle}>
      <Header/>

      {/* ── Chips de filtro ── */}
      <div style={{ padding:'10px 14px 6px', flexShrink:0 }}>

        {/* Título */}
        {!misFiltro && (
          <div style={{ fontFamily:SE, fontSize:18, color:T.fg, fontWeight:500, marginBottom:8 }}>¿Qué mesa?</div>
        )}
        {misFiltro && (
          <div style={{ fontFamily:SE, fontSize:18, color:T.fg, fontWeight:500, marginBottom:8, display:'flex', alignItems:'baseline', gap:8 }}>
            Mis mesas
            {misMesasIds.size > 0 && (
              <span style={{ fontFamily:SM, fontSize:10, color:T.fg3 }}>
                {misMesasIds.size} abiert{misMesasIds.size===1?'a':'as'}
              </span>
            )}
          </div>
        )}

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>

          {/* Chip MIS MESAS — siempre primero */}
          <button
            onPointerDown={() => {
              setMisFiltro(true)
              setZonaFiltro('todas') // reset zona al entrar en mis mesas
            }}
            style={misFiltro ? chipOn : {
              ...chipOff,
              ...(misMesasIds.size > 0 ? {
                boxShadow: `rgba(63,125,68,0.5) 0px 0px 0px 1px`,
                color: C.gr,
              } : {}),
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={misFiltro ? C.fg : (misMesasIds.size > 0 ? C.gr : T.fg3)} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            MIS MESAS
            {misMesasIds.size > 0 && !misFiltro && (
              <span style={{
                background: C.gr, color: '#fff', borderRadius: 9999,
                fontFamily: SN, fontSize: 8, fontWeight: 700,
                padding: '1px 5px', lineHeight: 1.4,
              }}>
                {misMesasIds.size}
              </span>
            )}
          </button>

          {/* Chip TODAS */}
          <button
            onPointerDown={() => { setMisFiltro(false); setZonaFiltro('todas') }}
            style={!misFiltro && zonaFiltro==='todas' ? chipOn : chipOff}
          >
            TODAS
          </button>

          {/* Chips de zona */}
          {!misFiltro && zonas.map(z => (
            <button key={z} onPointerDown={() => { setMisFiltro(false); setZonaFiltro(z) }}
              style={!misFiltro && zonaFiltro===z ? chipOn : { ...chipOff, textTransform:'uppercase' as const }}>
              {z}
            </button>
          ))}
        </div>

        {/* Aviso si mis mesas vacío */}
        {misFiltro && misMesasIds.size === 0 && (
          <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:13, color:T.fg3, marginTop:12, textAlign:'center' }}>
            No tienes mesas abiertas ahora mismo
          </div>
        )}
      </div>

      {/* ── Grid de mesas ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'row' }}>
        {/* Franja scroll lateral */}
        <div
          style={{ width:18, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', cursor:'ns-resize' }}
          onTouchStart={e => {
            const scrollEl = e.currentTarget.nextElementSibling as HTMLDivElement
            if (!scrollEl) return
            const startY = e.touches[0].clientY
            const startScroll = scrollEl.scrollTop
            const onMove = (ev: TouchEvent) => { scrollEl.scrollTop = startScroll - (ev.touches[0].clientY - startY) }
            const onEnd = () => {
              document.removeEventListener('touchmove', onMove)
              document.removeEventListener('touchend', onEnd)
            }
            document.addEventListener('touchmove', onMove, { passive: true })
            document.addEventListener('touchend', onEnd, { passive: true })
          }}
        >
          <div style={{ width:3, height:40, borderRadius:99, background:L.rule, opacity:0.6 }}/>
        </div>

        <div style={{ flex:1, overflow:'auto', padding:'10px 14px 20px 6px', touchAction:'pan-y' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(80px, 1fr))', gap:9 }}>
            {mesasFiltradas.map(m => {
              const isSel = mesaSel?.id === m.id
              const bgEst = ESTADO_BG_LIGHT[m.estado] ?? L.bg2
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
                    if (m.estado === 'reservada') return
                    setMesaSel(m); setStep('carta')
                  }}
                  onPointerCancel={() => { ptrStart.current = null }}
                  onClick={e => {
                    if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return
                    if (m.estado === 'reservada') return
                    setMesaSel(m); setStep('carta')
                  }}
                  style={{
                    padding:'12px 6px 10px', borderRadius:12, border:'none',
                    background: m.estado === 'reservada' ? 'rgba(59,130,246,.08)' : (isSel ? '#F4D8CF' : bgEst),
                    boxShadow: m.estado === 'reservada' ? '0 0 0 1.5px rgba(59,130,246,.4)' : shadowMesa(m.estado, isSel),
                    cursor: m.estado === 'reservada' ? 'not-allowed' : 'pointer',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                    transition:'all .15s cubic-bezier(.4,0,.2,1)',
                    transform: isSel ? 'scale(0.95)' : 'scale(1)',
                    opacity: m.estado === 'reservada' ? 0.75 : 1,
                    touchAction:'manipulation',
                  }}>
                  <span style={{ fontFamily:SE, fontSize:20, fontWeight:500, color: m.estado === 'reservada' ? '#1D4ED8' : (isSel ? C.red : L.fg), lineHeight:1 }}>
                    {m.estado === 'reservada' ? '🔒' : m.codigo}
                  </span>
                  <span style={{ fontFamily:SM, fontSize:8, color: isSel ? C.red : (ESTADO_FG[m.estado] ?? T.fg3), letterSpacing:'.06em', textTransform:'uppercase' }}>
                    {m.estado === 'reservada' ? (m as {reserva_hora?:string|null}).reserva_hora || 'res.' : m.estado}
                  </span>
                  {m.estado !== 'reservada' && (
                    <span style={{ fontFamily:SE, fontSize:8, color: isSel ? C.red : T.fg3, lineHeight:1 }}>{m.codigo}</span>
                  )}
                  <span style={{ fontFamily:SM, fontSize:8, color: isSel ? C.red : (ESTADO_FG[m.estado] ?? T.fg3), letterSpacing:'.06em', textTransform:'uppercase' }}>
                    {m.estado}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  // ══ STEP: CARTA ═══════════════════════════════════════════
  if (step === 'carta') return (
    <div style={wrapStyle}>
      <Header/>
      <div style={{ display:'flex', gap:0, overflowX:'auto', borderBottom:`1px solid ${T.rule}`, flexShrink:0, padding:'0 4px' }}>
        {categorias.map(cat => (
          <button key={cat} onPointerDown={() => setCatActiva(cat)}
            style={{ padding:'9px 14px', background:'transparent', border:'none', borderBottom: catActiva===cat?`2px solid ${C.red}`:'2px solid transparent', color: catActiva===cat?T.fg:T.fg3, fontFamily:SN, fontSize:12, fontWeight: catActiva===cat?700:400, cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1 }}>
            {cat}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:10, display:'flex', flexDirection:'column', gap:6 }}>
        {prodsFiltrados.map(p => {
          const fmts = p.formatos?.filter(f => f.precio > 0)
          return (
            <div key={p.id} style={{
              background: L.bg2, border:'none',
              boxShadow: `rgba(184,169,139,0.45) 0px 0px 0px 1px`,
              borderRadius:10, padding:'10px 12px',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: fmts?.length ? 8 : 0 }}>
                <span style={{ fontFamily:SN, fontSize:14, fontWeight:600, color:T.fg }}>{p.nombre}</span>
                {!fmts?.length && (
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {p.precio != null && <span style={{ fontFamily:SM, fontSize:11, color:T.fg3 }}>{p.precio.toFixed(2)}€</span>}
                    <button onPointerDown={() => addProducto(p)}
                      style={{ width:30, height:30, borderRadius:9999, background:C.red, border:'none', color:C.fg, fontSize:20, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                      +
                    </button>
                  </div>
                )}
              </div>
              {fmts?.length ? (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {fmts.map(fmt => (
                    <button key={fmt.id} onPointerDown={() => addProducto(p, fmt)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:9999,
                        background: L.bg3, border:'none',
                        boxShadow: `rgba(184,169,139,0.45) 0px 0px 0px 1px`,
                        cursor:'pointer' }}>
                      <span style={{ fontFamily:SN, fontSize:12, color:T.fg2 }}>{fmt.nombre}</span>
                      <span style={{ fontFamily:SM, fontSize:10, color:T.fg3 }}>{fmt.precio.toFixed(2)}€</span>
                      <span style={{ fontFamily:SN, fontSize:16, fontWeight:700, color:C.red, lineHeight:1 }}>+</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
        {prodsFiltrados.length === 0 && (
          <div style={{ fontFamily:SE, fontSize:14, color:T.fg3, fontStyle:'italic', padding:20, textAlign:'center' }}>Sin productos en esta categoría.</div>
        )}
      </div>
      {lineas.length > 0 && (
        <div style={{ padding:'10px 14px', borderTop:`1px solid ${T.rule}`, background: L.bg2, flexShrink:0, display:'flex', gap:8, alignItems:'center', overflowX:'auto' }}>
          {lineas.map((l,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4, background: L.bg3, borderRadius:9999, padding:'4px 10px', flexShrink:0,
              boxShadow: `rgba(184,169,139,0.4) 0px 0px 0px 1px` }}>
              <span style={{ fontFamily:SM, fontSize:10, color:T.fg3 }}>{l.cantidad}×</span>
              <span style={{ fontFamily:SN, fontSize:11, color:T.fg }}>{l.formato ? `${l.producto.nombre}·${l.formato.nombre}` : l.producto.nombre}</span>
              <button onPointerDown={() => removeLinea(i)} style={{ background:'none', border:'none', color:C.red, fontSize:14, cursor:'pointer', lineHeight:1, padding:'0 2px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ══ STEP: RESUMEN ═════════════════════════════════════════
  if (step === 'resumen') return (
    <div style={wrapStyle}>
      <Header/>
      <div style={{ flex:1, overflow:'auto', padding:14 }}>
        <div style={{ marginBottom:12 }}>
          <span style={{ fontFamily:SE, fontSize:22, color:T.fg, fontWeight:500 }}>{mesaSel?.codigo}</span>
          <span style={{ fontFamily:SM, fontSize:11, color:T.fg3, marginLeft:10 }}>{lineas.reduce((a,l)=>a+l.cantidad,0)} items</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
          {lineas.map((l,i) => {
            const notaOpen = notaAbiertaIdx === i
            const tieneNota = l.notas.trim().length > 0
            return (
              <div key={i} style={{ borderRadius:10, overflow:'hidden',
                boxShadow: `rgba(184,169,139,0.45) 0px 0px 0px 1px`, background: L.bg2 }}>
                {/* Fila principal */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px' }}>
                  {/* Cantidad */}
                  <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                    <button onPointerDown={() => updateCantidad(i,-1)} style={{ width:24,height:24,borderRadius:9999,background:L.bg3,border:'none',boxShadow:`${T.rS} 0px 0px 0px 1px`,color:T.fg,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
                    <span style={{ fontFamily:SM,fontSize:13,fontWeight:700,color:T.fg,width:24,textAlign:'center' }}>{l.cantidad}</span>
                    <button onPointerDown={() => updateCantidad(i,+1)} style={{ width:24,height:24,borderRadius:9999,background:L.bg3,border:'none',boxShadow:`${T.rS} 0px 0px 0px 1px`,color:T.fg,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                  </div>
                  {/* Nombre + chip nota si existe */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SN,fontSize:13,fontWeight:600,color:T.fg,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{l.producto.nombre}</div>
                    {l.formato && <div style={{ fontFamily:SM,fontSize:10,color:T.fg3 }}>{l.formato.nombre}</div>}
                    {tieneNota && !notaOpen && (
                      <div style={{ marginTop:2, display:'inline-flex', alignItems:'center', gap:4,
                        background:'rgba(232,163,59,0.12)', border:'1px solid rgba(232,163,59,0.35)',
                        borderRadius:20, padding:'1px 8px' }}>
                        <span style={{ fontFamily:SN, fontSize:10, color:C.amber }}>{l.notas}</span>
                      </div>
                    )}
                  </div>
                  {/* Precio */}
                  <span style={{ fontFamily:SM,fontSize:11,color:T.fg3,flexShrink:0 }}>
                    {((l.formato?l.formato.precio:(l.producto.precio??0))*l.cantidad).toFixed(2)}€
                  </span>
                  {/* Botón nota (icono lápiz) */}
                  <button
                    onPointerDown={() => setNotaAbiertaIdx(notaOpen ? null : i)}
                    style={{ width:28,height:28,borderRadius:9999,border:'none',flexShrink:0,cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background: tieneNota || notaOpen ? 'rgba(232,163,59,0.18)' : L.bg3,
                      boxShadow: tieneNota || notaOpen ? `rgba(232,163,59,0.5) 0px 0px 0px 1px` : `${T.rS} 0px 0px 0px 1px`,
                      transition:'all .15s' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke={tieneNota || notaOpen ? C.amber : T.fg3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                    </svg>
                  </button>
                  {/* Borrar */}
                  <button onPointerDown={() => removeLinea(i)} style={{ background:'none',border:'none',color:C.red,fontSize:18,cursor:'pointer',lineHeight:1,flexShrink:0 }}>×</button>
                </div>
                {/* Panel nota desplegable */}
                {notaOpen && (
                  <div style={{ padding:'0 12px 10px', display:'flex', gap:6, alignItems:'center' }}>
                    <input
                      autoFocus
                      type="text"
                      value={l.notas}
                      onChange={e => setLineas(prev => prev.map((ln,j) => j===i ? {...ln, notas: e.target.value} : ln))}
                      onKeyDown={e => { if (e.key === 'Enter') setNotaAbiertaIdx(null) }}
                      placeholder="en copa · sin sal · bien hecho…"
                      style={{ flex:1, padding:'7px 10px', background:L.bg,
                        border:'none', boxShadow:`rgba(232,163,59,0.45) 0px 0px 0px 1.5px`,
                        borderRadius:8, fontFamily:SN, fontSize:12, color:T.fg, outline:'none' }}
                    />
                    <button onPointerDown={() => setNotaAbiertaIdx(null)}
                      style={{ padding:'7px 12px', background:tieneNota?C.amber:L.bg3, border:'none',
                        borderRadius:8, color:tieneNota?'#000':T.fg3, fontFamily:SN, fontSize:12,
                        fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                      {tieneNota ? '✓' : '✕'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'10px 12px',borderTop:`2px solid ${T.rule}`,marginBottom:12 }}>
          <span style={{ fontFamily:SM,fontSize:11,color:T.fg3,letterSpacing:'.06em' }}>TOTAL</span>
          <span style={{ fontFamily:SE,fontSize:22,fontWeight:500,color:T.fg }}>{totalPrecio.toFixed(2)}€</span>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontFamily:SM,fontSize:10,color:T.fg3,letterSpacing:'.08em',display:'block',marginBottom:6 }}>NOTA DE COMANDA (opcional)</label>
          <input
            type="text"
            value={notaGeneral}
            onChange={e => setNotaGeneral(e.target.value)}
            placeholder="ej: sin sal en todo · alérgica al gluten · es su cumpleaños"
            style={{ width:'100%', padding:'9px 12px', background:L.bg2, border:'none',
              boxShadow:`rgba(232,163,59,0.4) 0px 0px 0px 1px`,
              borderRadius:8, fontFamily:SN, fontSize:13, color:T.fg,
              outline:'none', boxSizing:'border-box' }}
          />
          {notaGeneral.trim() && (
            <div style={{ marginTop:6, fontFamily:SN, fontSize:11, color:C.amber }}>
              ⚠ Esta nota aparecerá en todos los tickets de esta comanda
            </div>
          )}
        </div>
      </div>
      <div style={{ padding:'10px 14px 24px',display:'flex',gap:8,flexShrink:0 }}>
        <button onPointerDown={() => setStep('carta')}
          style={{ flex:1,padding:'12px',background:'transparent',border:'none',boxShadow:`${T.rS} 0px 0px 0px 1px`,borderRadius:9999,color:T.fg3,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
          Añadir más
        </button>
        <button onPointerDown={enviar} disabled={enviando}
          style={{ flex:2,padding:'12px',background:enviando?C.rD:C.red,border:'none',borderRadius:9999,color:C.fg,fontFamily:SN,fontSize:14,fontWeight:700,cursor:enviando?'default':'pointer',transition:'background .15s' }}>
          {enviando ? 'Enviando...' : 'Enviar a cocina'}
        </button>
      </div>
    </div>
  )

  // ══ STEP: ENVIADO ═════════════════════════════════════════
  if (step === 'enviado') return (
    <div style={{ ...wrapStyle, alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ width:64,height:64,borderRadius:9999,background:C.grS,border:`2px solid ${C.gr}`,display:'flex',alignItems:'center',justifyContent:'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
      </div>
      <div style={{ fontFamily:SE,fontSize:22,color:T.fg,fontWeight:500 }}>Comanda enviada.</div>
      {ticketNum && <div style={{ fontFamily:SM,fontSize:11,color:T.fg3 }}>Ticket #{ticketNum} · {mesaSel?.codigo}</div>}
      <div style={{ display:'flex',gap:8,marginTop:12 }}>
        <button onPointerDown={reset}
          style={{ padding:'10px 20px',background:'transparent',border:'none',boxShadow:`${T.rS} 0px 0px 0px 1px`,borderRadius:9999,color:T.fg3,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
          Nueva comanda
        </button>
        {onBack && (
          <button onPointerDown={onBack}
            style={{ padding:'10px 20px',background:C.red,border:'none',borderRadius:9999,color:C.fg,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
            Volver a voz
          </button>
        )}
      </div>
    </div>
  )

  // ══ STEP: ERROR ═══════════════════════════════════════════
  return (
    <div style={{ ...wrapStyle, alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontFamily:SM,fontSize:12,color:C.red,textAlign:'center',maxWidth:240 }}>{errorMsg}</div>
      <button onPointerDown={reset}
        style={{ padding:'10px 20px',background:'transparent',border:'none',boxShadow:`${T.rS} 0px 0px 0px 1px`,borderRadius:9999,color:T.fg3,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
        Reintentar
      </button>
    </div>
  )
}
