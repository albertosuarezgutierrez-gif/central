'use client'
// QrClientApp — App completa del cliente en la mesa
// Flujo: bienvenida → carta → carrito → cocina → cuenta → propina → pago

import { useState, useEffect, useCallback } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type Screen = 'loading' | 'error' | 'welcome' | 'menu' | 'cart' | 'cooking' | 'bill' | 'tip' | 'paying'

interface Producto {
  id: string; nombre: string; descripcion: string; precio: number
  categoria: string; alergenos: string[]; imagen_url?: string
}

interface CartItem extends Producto { qty: number }

interface SessionData {
  mesa: { id: string; codigo: string; nombre: string; qr_modo_pago: string }
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
    const d = await callEF('qr-session', { token })
    if (d.sesion_id) { setSesionId(d.sesion_id); setScreen('menu') }
    else { setError('No se pudo iniciar sesión'); setScreen('error') }
  }, [data, token])

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
    if (res.ok) setScreen('cooking')
    else showToast('Error al enviar el pedido')
  }, [data, sesionId, cart])

  const cobrar = useCallback(async () => {
    if (!sesionId) return
    setScreen('paying')
    const res = await callEF('qr-cobro', {
      sesion_id: sesionId,
      propina_pct: propinaPct,
      success_url: `${window.location.origin}/q/success`,
      cancel_url: window.location.href,
    })
    if (res.checkout_url) window.location.href = res.checkout_url
    else { showToast('Error al procesar el pago'); setScreen('bill') }
  }, [sesionId, propinaPct])

  const addToCart = (prod: Producto) => setCart(prev => {
    const ex = prev.find(p => p.id === prod.id)
    return ex ? prev.map(p => p.id === prod.id ? { ...p, qty: p.qty + 1 } : p) : [...prev, { ...prod, qty: 1 }]
  })

  const totalItems = cart.reduce((a, b) => a + b.qty, 0)
  const subtotal   = cart.reduce((a, b) => a + b.precio * b.qty, 0)
  const total      = subtotal * 1.10

  const s: React.CSSProperties = { fontFamily: 'sans-serif', background: C.bg, color: C.cream, minHeight: '100vh', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }

  if (screen === 'loading') return <div style={{ ...s, alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 32 }}>🍷</div></div>
  if (screen === 'error')   return <div style={{ ...s, alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}><div style={{ fontSize: 40, marginBottom: 16 }}>😕</div><div style={{ color: C.creamDim }}>{error}</div></div>
  if (screen === 'paying')  return <div style={{ ...s, alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div><div style={{ color: C.creamDim, fontSize: 14 }}>Abriendo pasarela de pago...</div></div>
  if (!data) return null

  const cats = [...new Set(data.productos.map(p => p.categoria))]

  return (
    <div style={s}>
      <style>{`:root{color-scheme:dark} *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#2e2720}`}</style>

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
          <button onClick={() => setScreen('bill')} style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 13, color: C.creamDim, fontSize: 13, cursor: 'pointer' }}>Pedir la cuenta</button>
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
              {[['Subtotal', fmt(subtotal)], ['IVA (10%)', fmt(subtotal * 0.10)]].map(([k, v]) => (
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
          <div style={{ padding: '14px 18px', flexShrink: 0 }}>
            <button onClick={() => setScreen('tip')} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Pagar ahora — {fmt(total)}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: C.creamDim, marginTop: 9 }}>🔒 Pago seguro via Stripe</div>
          </div>
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
          <button onClick={cobrar} style={{ width: '100%', padding: '14px', background: C.vermilion, border: 'none', borderRadius: 13, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {propinaPct > 0 ? `Pagar ${fmt(total + total * propinaPct / 100)}` : `Pagar ${fmt(total)}`}
          </button>
        </div>
      )}
    </div>
  )
}
