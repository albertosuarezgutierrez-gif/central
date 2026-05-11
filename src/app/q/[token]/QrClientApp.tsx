'use client'
// QrClientApp — App completa del cliente en la mesa
// Flujo: bienvenida → carta → carrito → cocina ↔ carta (multi-pedido) → cuenta → propina → pago
// El cliente puede hacer múltiples comandas en la misma sesión. Todas se agrupan en la cuenta final.

import { useState, useEffect, useCallback } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type Screen = 'loading' | 'error' | 'welcome' | 'comensales' | 'menu' | 'cart' | 'cooking' | 'bill' | 'split_modo' | 'split_igual' | 'split_items' | 'tip' | 'paying'

interface Producto {
  id: string; nombre: string; descripcion: string; precio: number
  categoria: string; alergenos: string[]; imagen_url?: string
}

interface CartItem extends Producto { qty: number }

interface SessionData {
  mesa: { id: string; codigo: string; nombre: string; qr_modo_pago: string; precio_fijo_persona?: number | null; precio_fijo_concepto?: string | null }
  restaurante: { id: string; nombre: string; connect_activo: boolean }
  productos: Producto[]
  sesion_id: string | null
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  vermilion: '#D9442B', cream: '#F6F1E7', creamMid: '#D8CDB6',
  creamDim: '#8C7B69', amber: '#E8A33B', green: '#3F7D44', rule: '#2E2720',
}

async function callEF(fn: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function QrClientApp({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [data, setData] = useState<SessionData | null>(null)
  const [sesionId, setSesionId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [numComensales, setNumComensales] = useState(1)
  const [numComandas, setNumComandas] = useState(0)   // cuántas comandas ha hecho en esta sesión
  const [splitPersonas, setSplitPersonas] = useState(2)
  const [splitItemsSeleccionados, setSplitItemsSeleccionados] = useState<string[]>([])
  const [splitItemsDisponibles, setSplitItemsDisponibles] = useState<any[]>([])
  const [splitSlotId, setSplitSlotId] = useState<string | null>(null)
  const [callModal, setCallModal] = useState(false)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [propinaPct, setPropinaPct] = useState(0)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/qr-session?token=${token}`, {
      headers: { 'apikey': ANON_KEY }
    })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error || 'QR no válido'); setScreen('error'); return }
        setData(d); setScreen('welcome')
      })
      .catch(() => { setError('Error de conexión'); setScreen('error') })
  }, [token])

  const iniciarSesion = useCallback(async () => {
    if (!data) return
    // Si hay precio fijo por persona → preguntar comensales primero
    if (data.mesa.precio_fijo_persona) {
      setScreen('comensales')
    } else {
      // Sin precio fijo: crear sesión con 1 comensal y pasar a carta
      const d = await callEF('qr-session', { token, num_comensales: 1 })
      if (d.sesion_id) { setSesionId(d.sesion_id); setNumComensales(1); setScreen('menu') }
      else { setError('No se pudo iniciar sesión'); setScreen('error') }
    }
  }, [data, token])

  const confirmarComensales = useCallback(async (n: number) => {
    const d = await callEF('qr-session', { token, num_comensales: n })
    if (d.sesion_id) { setSesionId(d.sesion_id); setNumComensales(n); setScreen('menu') }
    else { setError('No se pudo iniciar sesión'); setScreen('error') }
  }, [token])

  const confirmarPedido = useCallback(async () => {
    if (!data || !sesionId || !cart.length) return
    const items = cart.map(i => ({
      producto_id: i.id, cantidad: i.qty,
      precio_unitario: i.precio, notas: ''
    }))
    const res = await callEF('qr-order', {
      sesion_id: sesionId,
      mesa_id: data.mesa.id,
      restaurante_id: data.restaurante.id,
      items
    })
    if (res.ok) {
      setNumComandas(n => n + 1)
      setCart([])          // limpia carrito para el próximo pedido
      setScreen('cooking')
    }
    else showToast('Error al enviar el pedido')
  }, [data, sesionId, cart])

  const cobrar = useCallback(async (modo: 'completo' | 'igual' | 'items' = 'completo') => {
    if (!sesionId) return
    setScreen('paying')

    if (modo === 'completo') {
      const res = await callEF('qr-cobro', {
        sesion_id: sesionId, propina_pct: propinaPct,
        success_url: `${window.location.origin}/q/success`,
        cancel_url: window.location.href,
      })
      if (res.checkout_url) window.location.href = res.checkout_url
      else { showToast('Error al procesar el pago'); setScreen('bill') }
    }

    if (modo === 'igual') {
      const res = await callEF('qr-split', {
        action: 'pay_slot', sesion_id: sesionId,
        modo: 'igual', personas: splitPersonas, propina_pct: propinaPct,
        success_url: `${window.location.origin}/q/success`,
        cancel_url: window.location.href,
      })
      if (res.checkout_url) window.location.href = res.checkout_url
      else { showToast('Error al procesar el pago'); setScreen('split_igual') }
    }

    if (modo === 'items') {
      // Primero claim_items para crear el slot
      const claim = await callEF('qr-split', {
        action: 'claim_items', sesion_id: sesionId,
        item_ids: splitItemsSeleccionados, propina_pct: propinaPct,
      })
      if (!claim.ok) { showToast('Error al reclamar items'); setScreen('split_items'); return }

      const res = await callEF('qr-split', {
        action: 'pay_slot', sesion_id: sesionId,
        modo: 'por_items', slot_id: claim.slot_id, propina_pct: propinaPct,
        success_url: `${window.location.origin}/q/success`,
        cancel_url: window.location.href,
      })
      if (res.checkout_url) window.location.href = res.checkout_url
      else { showToast('Error al procesar el pago'); setScreen('split_items') }
    }
  }, [sesionId, propinaPct, splitPersonas, splitItemsSeleccionados])

  const iniciarSplitItems = useCallback(async () => {
    const res = await callEF('qr-split', { action: 'init_por_items', sesion_id: sesionId })
    if (res.ok) {
      setSplitItemsDisponibles(res.items_disponibles || [])
      setSplitItemsSeleccionados([])
      setScreen('split_items')
    }
  }, [sesionId])

  const callWaiter = useCallback(async (motivo: string) => {
    if (!sesionId || calling) return
    setCalling(true)
    setCallModal(false)
    const res = await callEF('qr-call-waiter', { sesion_id: sesionId, motivo })
    setCalling(false)
    if (res.ok) showToast('🙋 Camarero avisado — viene enseguida')
    else showToast('Error al llamar al camarero')
  }, [sesionId, calling])

  const addToCart = (prod: Producto) => setCart(prev => {
    const ex = prev.find(p => p.id === prod.id)
    return ex ? prev.map(p => p.id === prod.id ? { ...p, qty: p.qty + 1 } : p) : [...prev, { ...prod, qty: 1 }]
  })

  const totalItems = cart.reduce((a, b) => a + b.qty, 0)
  const subtotal     = cart.reduce((a, b) => a + b.precio * b.qty, 0)
  const precioFijo   = (data?.mesa.precio_fijo_persona || 0) * numComensales
  const total        = subtotal * 1.10 + precioFijo

  const s: React.CSSProperties = { fontFamily: 'sans-serif', background: C.bg, color: C.cream, minHeight: '100vh', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }

  if (screen === 'loading') return <div style={{ ...s, alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 32 }}>🍷</div></div>
  if (screen === 'error')   return <div style={{ ...s, alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}><div style={{ fontSize: 40, marginBottom: 16 }}>😕</div><div style={{ color: C.creamDim }}>{error}</div></div>
  if (screen === 'paying')  return <div style={{ ...s, alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div><div style={{ color: C.creamDim, fontSize: 14 }}>Abriendo pasarela de pago...</div></div>
  if (!data) return null

  const cats = [...new Set(data.productos.map(p => p.categoria))]

  const MOTIVOS = [
    { id:'ayuda',     emoji:'🙋', label:'Necesito ayuda' },
    { id:'pedir_mas', emoji:'🍽️', label:'Quiero pedir más' },
    { id:'cuenta',    emoji:'💳', label:'Quiero la cuenta' },
    { id:'problema',  emoji:'⚠️', label:'Tengo un problema' },
  ]

  const mostrarHeader = sesionId && !['welcome','paying'].includes(screen)

  return (
    <div style={s}>
      <style>{`:root{color-scheme:dark} *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#2e2720}`}</style>

      {/* ── HEADER FIJO — nombre restaurante + botón camarero ── */}
      {mostrarHeader && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 18px', background:C.bg, borderBottom:`1px solid ${C.rule}`, flexShrink:0, position:'sticky', top:0, zIndex:40 }}>
          <div>
            <div style={{ fontFamily:'monospace', fontSize:9, color:C.creamDim, letterSpacing:'0.08em' }}>{data?.restaurante.nombre.toUpperCase()}</div>
            <div style={{ fontSize:12, fontWeight:600, color:C.cream, marginTop:1 }}>Mesa {data?.mesa.codigo}</div>
          </div>
          <button
            onClick={() => setCallModal(true)}
            disabled={calling}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', background: calling ? C.bg3 : C.amber, border:'none', borderRadius:20, cursor: calling ? 'not-allowed' : 'pointer', fontSize:12, fontWeight:600, color:'#1A1714', transition:'all 0.2s' }}
          >
            <span style={{ fontSize:14 }}>{calling ? '⏳' : '🙋'}</span>
            {calling ? 'Avisando...' : 'Camarero'}
          </button>
        </div>
      )}

      {/* ── MODAL MOTIVO LLAMADA ── */}
      {callModal && (
        <div
          onClick={() => setCallModal(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:60, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background:C.bg2, borderRadius:'20px 20px 0 0', padding:'20px 20px 32px', width:'100%', maxWidth:480, border:`1px solid ${C.rule}`, borderBottom:'none' }}
          >
            <div style={{ width:36, height:4, background:C.rule, borderRadius:2, margin:'0 auto 16px' }} />
            <div style={{ fontSize:16, fontStyle:'italic', color:C.cream, marginBottom:3 }}>¿En qué te ayudamos?</div>
            <div style={{ fontSize:12, color:C.creamDim, marginBottom:16 }}>El camarero recibe un aviso en su móvil ahora mismo</div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {MOTIVOS.map(m => (
                <button
                  key={m.id}
                  onClick={() => callWaiter(m.id)}
                  style={{ display:'flex', gap:14, alignItems:'center', padding:'13px 16px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:12, cursor:'pointer', textAlign:'left' }}
                >
                  <span style={{ fontSize:22 }}>{m.emoji}</span>
                  <span style={{ fontSize:14, color:C.cream }}>{m.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setCallModal(false)} style={{ width:'100%', marginTop:12, padding:'11px', background:'transparent', border:`1px solid ${C.rule}`, borderRadius:11, color:C.creamDim, fontSize:13, cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: 16, right: 16, maxWidth: 448, margin: '0 auto', background: C.amber, borderRadius: 11, padding: '11px 16px', fontSize: 13, color: '#1A1714', fontWeight: 600, zIndex: 99, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}

      {/* ── WELCOME ── */}
      {screen === 'welcome' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 22 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: C.vermilion, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, boxShadow: `0 0 36px ${C.vermilion}55` }}>🍷</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontStyle: 'italic', color: C.cream, marginBottom: 4 }}>{data.restaurante.nombre}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.creamDim, letterSpacing: '0.1em' }}>MESA {data.mesa.codigo}</div>
          </div>
          <div style={{ width: '100%', background: C.bg2, borderRadius: 14, padding: '16px 18px', border: `1px solid ${C.rule}` }}>
            {['Elige de la carta', 'Pedido directo a cocina', 'Paga desde aquí al terminar'].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: i < 2 ? 9 : 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.vermilion, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: C.creamMid }}>{t}</div>
              </div>
            ))}
          </div>
          <button onClick={iniciarSesion} style={{ width: '100%', padding: '15px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Ver la carta →
          </button>
          <button onClick={() => showToast('🙋 Camarero avisado')} style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 13, color: C.creamDim, fontSize: 13, cursor: 'pointer' }}>
            🙋 Llamar al camarero
          </button>
        </div>
      )}

      {/* ── COMENSALES ── */}
      {screen === 'comensales' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 22px', gap: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 42 }}>👥</div>
          <div>
            <div style={{ fontSize: 22, fontStyle: 'italic', color: C.cream, marginBottom: 6 }}>¿Cuántas personas sois?</div>
            <div style={{ fontSize: 13, color: C.creamDim }}>Para preparar vuestra cuenta correctamente</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, margin: '8px 0' }}>
            <button onClick={() => setNumComensales(n => Math.max(1, n - 1))} style={{ width: 48, height: 48, borderRadius: '50%', background: C.bg3, border: `1px solid ${C.rule}`, color: C.cream, fontSize: 24, cursor: 'pointer' }}>−</button>
            <div style={{ fontSize: 60, fontStyle: 'italic', color: C.cream, fontFamily: 'serif', width: 70, textAlign: 'center', lineHeight: 1 }}>{numComensales}</div>
            <button onClick={() => setNumComensales(n => Math.min(20, n + 1))} style={{ width: 48, height: 48, borderRadius: '50%', background: C.bg3, border: `1px solid ${C.rule}`, color: C.cream, fontSize: 24, cursor: 'pointer' }}>+</button>
          </div>
          {data.mesa.precio_fijo_persona && (
            <div style={{ width: '100%', background: C.bg2, borderRadius: 14, padding: '16px 20px', border: `1px solid ${C.rule}` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.creamDim, marginBottom: 8, letterSpacing: '0.08em' }}>{data.mesa.precio_fijo_concepto?.toUpperCase()}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: C.creamMid }}>{numComensales} persona{numComensales !== 1 ? 's' : ''} × {fmt(data.mesa.precio_fijo_persona)}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: C.cream }}>{fmt(data.mesa.precio_fijo_persona * numComensales)}</span>
              </div>
              <div style={{ fontSize: 11, color: C.creamDim }}>Se añade automáticamente a vuestra cuenta</div>
            </div>
          )}
          <button onClick={() => confirmarComensales(numComensales)} style={{ width: '100%', padding: '15px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Ver la carta →
          </button>
        </div>
      )}

      {/* ── MENU ── */}
      {screen === 'menu' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 0', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontStyle: 'italic', marginBottom: 11 }}>La carta</div>
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 11 }}>
              {cats.map(c => (
                <button key={c} style={{ padding: '6px 14px', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 20, color: C.cream, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{c}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 18px' }}>
            {data.productos.map(prod => {
              const inCart = cart.find(p => p.id === prod.id)
              return (
                <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0', borderBottom: `1px solid ${C.rule}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{prod.nombre}</div>
                    <div style={{ fontSize: 11, color: C.creamDim, marginTop: 1 }}>{prod.descripcion}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmt(prod.precio)}</div>
                    <button onClick={() => addToCart(prod)} style={{ width: 30, height: 30, borderRadius: 7, background: inCart ? C.vermilion : C.bg3, border: inCart ? 'none' : `1px solid ${C.rule}`, color: 'white', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {inCart ? inCart.qty : '+'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {totalItems > 0 && (
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>
              <button onClick={() => setScreen('cart')} style={{ width: '100%', padding: '13px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 18 }}>
                <span>Pedido ({totalItems})</span><span style={{ fontFamily: 'monospace' }}>{fmt(subtotal)}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CART ── */}
      {screen === 'cart' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', gap: 11, alignItems: 'center', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <button onClick={() => setScreen('menu')} style={{ background: 'none', border: 'none', color: C.creamDim, fontSize: 22, cursor: 'pointer' }}>←</button>
            <div style={{ fontSize: 21, fontStyle: 'italic' }}>Tu pedido</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px' }}>
            {cart.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0', borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.nombre}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.creamDim, marginTop: 2 }}>{fmt(item.precio)} × {item.qty}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <button onClick={() => setCart(p => p.map(i => i.id === item.id ? { ...i, qty: Math.max(0, i.qty - 1) } : i).filter(i => i.qty > 0))} style={{ width: 27, height: 27, borderRadius: 7, background: C.bg3, border: `1px solid ${C.rule}`, color: C.cream, cursor: 'pointer', fontSize: 15 }}>−</button>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, width: 14, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => setCart(p => p.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i))} style={{ width: 27, height: 27, borderRadius: 7, background: C.bg3, border: `1px solid ${C.rule}`, color: C.cream, cursor: 'pointer', fontSize: 15 }}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '14px 18px', borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 13 }}>
              <span style={{ fontSize: 14, color: C.creamMid }}>Total</span>
              <span style={{ fontFamily: 'monospace', fontSize: 19, fontWeight: 700 }}>{fmt(subtotal)}</span>
            </div>
            <button onClick={confirmarPedido} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Confirmar y enviar a cocina →
            </button>
          </div>
        </div>
      )}

      {/* ── COOKING ── */}
      {screen === 'cooking' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 22px', gap: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>👨‍🍳</div>
          <div style={{ fontSize: 23, fontStyle: 'italic' }}>En cocina...</div>
          <div style={{ fontSize: 13, color: C.creamDim }}>Tiempo estimado: ~12 min</div>
          {numComandas > 1 && (
            <div style={{ background: C.bg2, borderRadius: 10, padding: '8px 16px', border: `1px solid ${C.rule}` }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.creamDim }}>{numComandas} pedidos enviados esta sesión</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button
              onClick={() => setScreen('menu')}
              style={{ width: '100%', padding: '13px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              + Pedir algo más
            </button>
            <button
              onClick={() => setScreen('bill')}
              style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 13, color: C.creamDim, fontSize: 13, cursor: 'pointer' }}
            >
              Pedir la cuenta
            </button>
          </div>
        </div>
      )}

      {/* ── BILL ── */}
      {screen === 'bill' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 18px 12px', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <div style={{ fontSize: 23, fontStyle: 'italic' }}>Cuenta</div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.creamDim, marginTop: 2 }}>{data.restaurante.nombre.toUpperCase()} · MESA {data.mesa.codigo}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
            {cart.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.rule}22` }}>
                <span style={{ fontSize: 13, color: C.creamMid }}>{item.qty}× {item.nombre}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.precio * item.qty)}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, background: C.bg2, borderRadius: 11, padding: '14px 16px', border: `1px solid ${C.rule}` }}>
              {[
                ['Subtotal', fmt(subtotal)],
                ['IVA (10%)', fmt(subtotal * 0.10)],
                ...(data.mesa.precio_fijo_persona ? [[`${data.mesa.precio_fijo_concepto} (${numComensales}p)`, fmt(data.mesa.precio_fijo_persona * numComensales)]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, color: C.creamDim }}>{k}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.creamDim }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: C.rule, margin: '9px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 24, fontStyle: 'italic' }}>{fmt(total)}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 18px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button onClick={() => setScreen('tip')} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Pagar todo — {fmt(total)}
            </button>
            <button onClick={() => setScreen('split_modo')} style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 13, color: C.creamMid, fontSize: 14, cursor: 'pointer' }}>
              👥 Dividir la cuenta
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: C.creamDim }}>🔒 Pago seguro via Stripe</div>
          </div>
        </div>
      )}

      {/* ── SPLIT MODO ── */}
      {screen === 'split_modo' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', gap: 11, alignItems: 'center', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <button onClick={() => setScreen('bill')} style={{ background: 'none', border: 'none', color: C.creamDim, fontSize: 22, cursor: 'pointer' }}>←</button>
            <div style={{ fontSize: 21, fontStyle: 'italic' }}>Dividir cuenta</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '28px 22px', gap: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: C.creamDim }}>Total a dividir</div>
              <div style={{ fontSize: 28, fontStyle: 'italic', color: C.cream, marginTop: 4 }}>{fmt(total)}</div>
            </div>

            <button onClick={() => setScreen('split_igual')} style={{ width: '100%', padding: '20px 20px', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>➗</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.cream, marginBottom: 3 }}>A partes iguales</div>
                <div style={{ fontSize: 12, color: C.creamDim }}>Dividís el total entre N personas. Cada uno paga lo mismo.</div>
              </div>
            </button>

            <button onClick={iniciarSplitItems} style={{ width: '100%', padding: '20px 20px', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>🍽️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.cream, marginBottom: 3 }}>Cada uno lo suyo</div>
                <div style={{ fontSize: 12, color: C.creamDim }}>Cada persona elige los platos que ha pedido y paga exactamente eso.</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── SPLIT IGUAL ── */}
      {screen === 'split_igual' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', gap: 11, alignItems: 'center', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <button onClick={() => setScreen('split_modo')} style={{ background: 'none', border: 'none', color: C.creamDim, fontSize: 22, cursor: 'pointer' }}>←</button>
            <div style={{ fontSize: 21, fontStyle: 'italic' }}>A partes iguales</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '28px 22px', gap: 22, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 13, color: C.creamDim, marginBottom: 4 }}>¿Cuántas personas sois?</div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, marginTop: 12 }}>
                <button onClick={() => setSplitPersonas(p => Math.max(2, p - 1))} style={{ width: 44, height: 44, borderRadius: '50%', background: C.bg3, border: `1px solid ${C.rule}`, color: C.cream, fontSize: 22, cursor: 'pointer' }}>−</button>
                <div style={{ fontSize: 52, fontStyle: 'italic', color: C.cream, fontFamily: 'serif', width: 60, textAlign: 'center' }}>{splitPersonas}</div>
                <button onClick={() => setSplitPersonas(p => Math.min(10, p + 1))} style={{ width: 44, height: 44, borderRadius: '50%', background: C.bg3, border: `1px solid ${C.rule}`, color: C.cream, fontSize: 22, cursor: 'pointer' }}>+</button>
              </div>
            </div>
            <div style={{ background: C.bg2, borderRadius: 14, padding: '20px', border: `1px solid ${C.rule}` }}>
              <div style={{ fontSize: 13, color: C.creamDim, marginBottom: 8 }}>Cada persona paga</div>
              <div style={{ fontSize: 36, fontStyle: 'italic', color: C.cream }}>{fmt(total / splitPersonas)}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.creamDim, marginTop: 6 }}>{fmt(total)} ÷ {splitPersonas} personas</div>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              {[5, 10, 15].map(p => (
                <button key={p} onClick={() => setPropinaPct(propinaPct === p ? 0 : p)} style={{ flex: 1, padding: '10px 0', background: propinaPct === p ? C.vermilion : C.bg2, border: propinaPct === p ? 'none' : `1px solid ${C.rule}`, borderRadius: 11, color: 'white', cursor: 'pointer', fontSize: 12 }}>
                  +{p}%<br/><span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>{fmt(total / splitPersonas * p / 100)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => cobrar('igual')} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Pagar mi parte — {fmt(total / splitPersonas * (1 + propinaPct / 100))}
            </button>
            <div style={{ fontFamily: 'cursive', fontSize: 12, color: C.creamDim }}>Pasa el móvil a los demás para que paguen su parte 📱</div>
          </div>
        </div>
      )}

      {/* ── SPLIT ITEMS ── */}
      {screen === 'split_items' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', gap: 11, alignItems: 'center', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
            <button onClick={() => setScreen('split_modo')} style={{ background: 'none', border: 'none', color: C.creamDim, fontSize: 22, cursor: 'pointer' }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontStyle: 'italic' }}>Elige lo que has pedido</div>
              <div style={{ fontSize: 11, color: C.creamDim, marginTop: 1 }}>Toca los platos que son tuyos</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px' }}>
            {splitItemsDisponibles.filter(i => !i.reclamado).map(item => {
              const sel = splitItemsSeleccionados.includes(item.id)
              return (
                <div key={item.id} onClick={() => setSplitItemsSeleccionados(prev => sel ? prev.filter(id => id !== item.id) : [...prev, item.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.rule}`, cursor: 'pointer' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: sel ? C.vermilion : C.bg3, border: sel ? 'none' : `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>{sel ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? C.cream : C.creamMid }}>{item.cantidad}× {item.productos?.nombre || item.nombre}</div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: sel ? C.cream : C.creamDim }}>{fmt(item.precio_unitario * item.cantidad)}</div>
                </div>
              )
            })}
            {splitItemsDisponibles.filter(i => i.reclamado).length > 0 && (
              <div style={{ padding: '12px 0', opacity: 0.4 }}>
                <div style={{ fontSize: 11, color: C.creamDim, marginBottom: 8, fontFamily: 'monospace', letterSpacing: '0.05em' }}>YA RECLAMADOS</div>
                {splitItemsDisponibles.filter(i => i.reclamado).map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.rule}22` }}>
                    <span style={{ fontSize: 13, color: C.creamDim, textDecoration: 'line-through' }}>{item.cantidad}× {item.productos?.nombre}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.creamDim }}>{fmt(item.precio_unitario * item.cantidad)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {splitItemsSeleccionados.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>
              {(() => {
                const miTotal = splitItemsDisponibles
                  .filter(i => splitItemsSeleccionados.includes(i.id))
                  .reduce((a, i) => a + i.precio_unitario * i.cantidad, 0) * 1.10
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: C.creamMid }}>Mi parte ({splitItemsSeleccionados.length} items)</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700 }}>{fmt(miTotal)}</span>
                    </div>
                    <button onClick={() => cobrar('items')} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      Pagar mis platos — {fmt(miTotal)}
                    </button>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── TIP ── */}
      {screen === 'tip' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 22px', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 25, fontStyle: 'italic', marginBottom: 5 }}>¿Añadir propina?</div>
            <div style={{ fontSize: 12, color: C.creamDim }}>100% para el equipo del restaurante</div>
          </div>
          <div style={{ display: 'flex', gap: 9, width: '100%' }}>
            {[5, 10, 15].map(p => (
              <button key={p} onClick={() => setPropinaPct(propinaPct === p ? 0 : p)} style={{ flex: 1, padding: '13px 0', background: propinaPct === p ? C.vermilion : C.bg2, border: propinaPct === p ? 'none' : `1px solid ${C.rule}`, borderRadius: 13, color: 'white', cursor: 'pointer' }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{p}%</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: propinaPct === p ? '#ffffff88' : C.creamDim, marginTop: 2 }}>{fmt(total * p / 100)}</div>
              </button>
            ))}
          </div>
          <button onClick={() => cobrar('completo')} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {propinaPct > 0 ? `Pagar ${fmt(total + total * propinaPct / 100)}` : `Pagar ${fmt(total)}`}
          </button>
        </div>
      )}
    </div>
  )
}
