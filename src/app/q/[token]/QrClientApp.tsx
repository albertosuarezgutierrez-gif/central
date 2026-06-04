'use client'
import React from 'react'
import { SE, SN, SM } from '@/lib/colors'
// QrClientApp — App completa del cliente en la mesa
// Flujo: bienvenida → carta → carrito → cocina ↔ carta (multi-pedido) → cuenta → propina → pago
// El cliente puede hacer múltiples comandas en la misma sesión. Todas se agrupan en la cuenta final.

import { useState, useEffect, useCallback, useRef } from 'react'

import SelectorIdioma from '@/components/qr/SelectorIdioma'
import { leerIdioma, guardarIdioma, CodigoIdioma } from '@/lib/useIdiomasCarta'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  || 'BKLVkE3Cz7RjzFoSqOdmdXQOaRyoh6lNLPEtMNsA-xATgG-6q6MqbwA2NQkcRk5EWQLbpdaagD_o918fWOwmUbc'

type Screen = 'loading' | 'error' | 'welcome' | 'comensales' | 'preauth' | 'menu' | 'cart' | 'cooking' | 'bill' | 'split_modo' | 'split_igual' | 'split_items' | 'tip' | 'paying'

interface WineMetadata {
  tipo?: string; bodega?: string; varietal?: string; do?: string
  añada?: string; temperatura_servicio?: string; maridaje?: string
}
interface Producto {
  id: string; nombre: string; descripcion: string; precio: number
  categoria: string; alergenos: string[]; imagen_url?: string
  familia?: string; metadata?: WineMetadata
}

interface CartItem extends Producto { qty: number }

interface SessionData {
  mesa: { id: string; codigo: string; nombre: string; qr_modo_pago: string; precio_fijo_persona?: number | null; precio_fijo_concepto?: string | null }
  restaurante: { id: string; nombre: string; connect_activo: boolean; stripe_account_id?: string | null }
  cobro?: { modo_cobro: 'por_ronda' | 'pre_auth' | 'cuenta_abierta'; timer_min: number }
  productos: Producto[]
  sesion_id: string | null
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  vermilion: '#D9442B', cream: '#F6F1E7', creamMid: '#D8CDB6',
  creamDim: '#8C7B69', amber: '#E8A33B', green: '#3F7D44', rule: '#2E2720',
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
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
  // Pre-auth state
  const [preauthClientSecret, setPreauthClientSecret] = useState<string | null>(null)
  const [preauthProcessing, setPreauthProcessing] = useState(false)
  const [preauthError, setPreauthError] = useState('')
  const stripeRef = useRef<any>(null)
  const cardElementRef = useRef<any>(null)

  const [idioma, setIdioma] = useState<CodigoIdioma>('es')

  // ── Avisos "pedido listo" (Capa 1: en página + Capa 2: push web) ──
  const [comandaIds, setComandaIds] = useState<string[]>([])   // comandas hechas esta sesión
  const [pedidoListo, setPedidoListo] = useState(false)
  const [avisoEstado, setAvisoEstado] = useState<'idle' | 'pidiendo' | 'activo' | 'no_soportado' | 'error'>('idle')
  const wakeLockRef = useRef<any>(null)
  const audioCtxRef = useRef<any>(null)
  const listoPrevRef = useRef(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Prepara/desbloquea el AudioContext dentro de un gesto del usuario (necesario en móvil)
  const primeAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
        if (Ctx) audioCtxRef.current = new Ctx()
      }
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume()
    } catch { /* sin audio, seguimos */ }
  }, [])

  // Sonido + vibración cuando el pedido está listo (sin assets: tono ascendente WebAudio)
  const reproducirAvisoListo = useCallback(() => {
    try { navigator.vibrate?.([300, 120, 300, 120, 500]) } catch { /* sin vibración */ }
    try {
      const ctx = audioCtxRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') ctx.resume()
      const now = ctx.currentTime
      ;[660, 880, 1180].forEach((freq, i) => {
        const t = now + i * 0.18
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(t); osc.stop(t + 0.18)
      })
    } catch { /* sin sonido, queda el visual */ }
  }, [])

  // Pedir push y registrar el aviso server-side para esta comanda
  const suscribirAviso = useCallback(async () => {
    const comandaId = comandaIds[comandaIds.length - 1]
    if (!sesionId || !comandaId) return
    primeAudio()
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setAvisoEstado('no_soportado'); return
    }
    setAvisoEstado('pidiendo')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setAvisoEstado('error'); return }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }
      const res = await fetch('/api/qr/avisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, sesion_id: sesionId, comanda_id: comandaId,
          canal: 'web_push', subscription: sub.toJSON(),
        }),
      }).then(r => r.json())
      setAvisoEstado(res?.ok ? 'activo' : 'error')
    } catch {
      setAvisoEstado('error')
    }
  }, [comandaIds, sesionId, token, primeAudio])

  // Inicializar idioma desde preferencia guardada
  useEffect(() => {
    setIdioma(leerIdioma(token))
  }, [token])

  // Función para cambiar idioma y recargar productos
  const cambiarIdioma = async (lang: CodigoIdioma) => {
    setIdioma(lang)
    guardarIdioma(lang, token)
    if (!data) return
    try {
      const res = await fetch(`/api/qr/carta-i18n?token=${token}&lang=${lang}`)
      const d = await res.json()
      if (d.ok && d.productos) {
        setData(prev => prev ? { ...prev, productos: d.productos } : prev)
      }
    } catch {
      // fallo silencioso — mantiene productos anteriores
    }
  }

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

  const modoCobro = data?.cobro?.modo_cobro || 'cuenta_abierta'

  // Función auxiliar: crear sesión + manejar flujo post-sesión
  const postCrearSesion = useCallback(async (sid: string, nCom: number, d: SessionData) => {
    setSesionId(sid)
    setNumComensales(nCom)
    setData(prev => ({ ...(prev || d), ...d }))

    if (d.cobro?.modo_cobro === 'pre_auth') {
      // Crear SetupIntent para capturar tarjeta
      const res = await fetch('/api/qr/preauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sesion_id: sid, restaurante_id: d.restaurante.id }),
      }).then(r => r.json())

      if (res.ok && res.client_secret) {
        setPreauthClientSecret(res.client_secret)
        setScreen('preauth')
      } else {
        // Si falla el pre-auth, continúa sin él
        if (d.mesa.precio_fijo_persona) setScreen('comensales')
        else setScreen('menu')
      }
    } else {
      if (d.mesa.precio_fijo_persona) setScreen('comensales')
      else setScreen('menu')
    }
  }, [])

  const iniciarSesion = useCallback(async () => {
    if (!data) return
    if (data.mesa.precio_fijo_persona && modoCobro !== 'pre_auth') {
      // Sin pre_auth: pedir comensales primero, sesión se crea en confirmarComensales
      setScreen('comensales')
    } else {
      // Con pre_auth O sin precio fijo: crear sesión ya
      const d = await callEF('qr-session', { token, num_comensales: 1 })
      if (!d.sesion_id) { setError('No se pudo iniciar sesión'); setScreen('error'); return }
      await postCrearSesion(d.sesion_id, 1, { ...data, ...d })
    }
  }, [data, token, modoCobro, postCrearSesion])

  // Cargar Stripe.js y montar card element cuando entramos en pantalla preauth
  useEffect(() => {
    if (screen !== 'preauth' || !preauthClientSecret) return

    const mountCard = async () => {
      if (!stripeRef.current) {
        await new Promise<void>(resolve => {
          const s = document.createElement('script')
          s.src = 'https://js.stripe.com/v3/'
          s.onload = () => resolve()
          document.head.appendChild(s)
        })
        const stripeAccountId = data?.restaurante?.stripe_account_id
        stripeRef.current = (window as any).Stripe(
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
          stripeAccountId ? { stripeAccount: stripeAccountId } : {}
        )
      }

      const elements = stripeRef.current.elements()
      const card = elements.create('card', {
        style: {
          base: {
            color: '#F6F1E7', fontSize: '16px', fontFamily: 'system-ui, sans-serif',
            '::placeholder': { color: '#8C7B69' },
            iconColor: '#D9442B',
          },
          invalid: { color: '#E8A33B' },
        },
      })
      const el = document.getElementById('stripe-card-element')
      if (el && !el.children.length) card.mount('#stripe-card-element')
      cardElementRef.current = { elements, card }
    }

    mountCard()
  }, [screen, preauthClientSecret, data])

  // ── Capa 1: sondear el estado del pedido mientras esperamos en "En cocina" ──
  useEffect(() => {
    if (screen !== 'cooking' || !sesionId || comandaIds.length === 0 || pedidoListo) return
    let cancelado = false
    const comprobar = async () => {
      try {
        const r = await fetch(`/api/qr/estado?sesion_id=${sesionId}&comandas=${comandaIds.join(',')}`)
        const d = await r.json()
        if (!cancelado && d?.ok && d.alguna_lista) setPedidoListo(true)
      } catch { /* reintenta en el siguiente tick */ }
    }
    comprobar()
    const iv = setInterval(comprobar, 8000)
    return () => { cancelado = true; clearInterval(iv) }
  }, [screen, sesionId, comandaIds, pedidoListo])

  // Disparar sonido/vibración una sola vez al pasar a "listo"
  useEffect(() => {
    if (pedidoListo && !listoPrevRef.current) {
      listoPrevRef.current = true
      reproducirAvisoListo()
    }
    if (!pedidoListo) listoPrevRef.current = false
  }, [pedidoListo, reproducirAvisoListo])

  // Mantener la pantalla encendida mientras se espera el pedido (Wake Lock)
  useEffect(() => {
    if (screen !== 'cooking' || pedidoListo) {
      if (wakeLockRef.current) { wakeLockRef.current.release?.().catch(() => {}); wakeLockRef.current = null }
      return
    }
    let liberado = false
    const pedir = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      } catch { /* el navegador puede denegarlo: no pasa nada */ }
    }
    pedir()
    const onVis = () => { if (document.visibilityState === 'visible' && !liberado) pedir() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      liberado = true
      document.removeEventListener('visibilitychange', onVis)
      if (wakeLockRef.current) { wakeLockRef.current.release?.().catch(() => {}); wakeLockRef.current = null }
    }
  }, [screen, pedidoListo])

  const confirmarPreauth = useCallback(async () => {
    if (!stripeRef.current || !cardElementRef.current || !preauthClientSecret) return
    setPreauthProcessing(true)
    setPreauthError('')

    const { error: stripeErr, setupIntent } = await stripeRef.current.confirmCardSetup(
      preauthClientSecret,
      { payment_method: { card: cardElementRef.current.card } }
    )

    if (stripeErr) {
      setPreauthError(stripeErr.message || 'Error al verificar la tarjeta')
      setPreauthProcessing(false)
      return
    }

    // Guardar PM en la sesión
    await fetch('/api/qr/preauth', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sesion_id: sesionId, payment_method_id: setupIntent.payment_method }),
    })

    setPreauthProcessing(false)
    // Continuar al flujo normal
    if (data?.mesa.precio_fijo_persona) setScreen('comensales')
    else setScreen('menu')
  }, [preauthClientSecret, sesionId, data])

  const confirmarComensales = useCallback(async (n: number) => {
    // Si ya tenemos sesionId (venimos de pre_auth), actualizamos comensales en BD
    if (sesionId) {
      setNumComensales(n)
      // Actualizar num_comensales en la sesión existente si hay precio fijo
      if (data?.mesa.precio_fijo_persona) {
        const preciofijo = Math.round((data.mesa.precio_fijo_persona * n) * 100) / 100
        await fetch(`${SUPABASE_URL}/functions/v1/qr-session`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
          body: JSON.stringify({ sesion_id: sesionId, num_comensales: n, precio_fijo_aplicado: preciofijo }),
        }).catch(() => {}) // no crítico, continúa
      }
      setScreen('menu')
      return
    }
    const d = await callEF('qr-session', { token, num_comensales: n })
    if (d.sesion_id) { setSesionId(d.sesion_id); setNumComensales(n); setScreen('menu') }
    else { setError('No se pudo iniciar sesión'); setScreen('error') }
  }, [token, sesionId, data])

  const confirmarPedido = useCallback(async () => {
    if (!data || !sesionId || !cart.length) return
    const items = cart.map(i => ({
      producto_id: i.id, nombre: i.nombre, cantidad: i.qty,
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
      if (res.comanda_id) setComandaIds(prev => [...prev, res.comanda_id])
      setPedidoListo(false)
      setAvisoEstado('idle')
      primeAudio()         // desbloquea el sonido dentro de este gesto
      setCart([])          // limpia carrito para el próximo pedido
      setScreen('cooking')
    }
    else showToast('Error al enviar el pedido')
  }, [data, sesionId, cart, primeAudio])

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

  const mostrarHeader = sesionId && !['welcome','paying','preauth'].includes(screen)

  return (
    <div style={s}>
      <style>{`:root{color-scheme:dark} *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#2e2720} @keyframes iaPulse{0%,100%{opacity:1}50%{opacity:0.25}} @keyframes iaPop{0%{transform:scale(0.6);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>

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
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', background: calling ? C.bg3 : C.amber, border:'none', borderRadius:20, cursor: calling ? 'not-allowed' : 'pointer', fontSize:12, fontWeight:600, color: calling ? C.creamDim : '#1A1714', transition:'all 0.2s' }}
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
      {screen === 'preauth' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 22px', gap: 20 }}>
          <div style={{ fontSize: 38 }}>💳</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontStyle: 'italic', color: C.cream, marginBottom: 8 }}>Añade tu tarjeta</div>
            <div style={{ fontSize: 13, color: C.creamDim, lineHeight: 1.6 }}>
              Este local requiere verificar tu tarjeta antes de pedir.{'\n'}
              No se realiza ningún cobro ahora.
            </div>
          </div>

          {/* Contenedor del card element */}
          <div style={{ width: '100%', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '16px 18px' }}>
            <div id="stripe-card-element" style={{ minHeight: 24 }} />
          </div>

          {preauthError && (
            <div style={{ width: '100%', background: '#A8311E22', border: '1px solid #A8311E55', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#E8A33B' }}>
              {preauthError}
            </div>
          )}

          <button
            onClick={confirmarPreauth}
            disabled={preauthProcessing}
            style={{ width: '100%', padding: '15px', background: preauthProcessing ? C.bg3 : C.vermilion, border: 'none', borderRadius: 13, color: preauthProcessing ? C.creamDim : 'white', fontSize: 15, fontWeight: 700, cursor: preauthProcessing ? 'not-allowed' : 'pointer' }}>
            {preauthProcessing ? 'Verificando...' : 'Verificar tarjeta →'}
          </button>

          <div style={{ fontSize: 11, color: C.creamDim, textAlign: 'center', lineHeight: 1.6 }}>
            Tu tarjeta se guarda de forma segura por Stripe.{'\n'}
            Solo se cobrará el importe final de tu consumo.
          </div>
        </div>
      )}

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 20, fontStyle: 'italic' }}>La carta</div>
            </div>
            {/* Selector de idioma */}
            <SelectorIdioma idioma={idioma} onChange={cambiarIdioma} />
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 11, marginTop: 4 }}>
              {cats.map(c => (
                <button key={c} style={{ padding: '6px 14px', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 20, color: C.cream, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{c}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 18px' }}>
            {data.productos.map(prod => {
              const inCart = cart.find(p => p.id === prod.id)
              return (
                <div key={prod.id} style={{ padding: '12px 0', borderBottom: `1px solid ${C.rule}` }}>
                  {(prod.familia?.startsWith('vino') || prod.metadata?.tipo === 'vino') ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13 }}>🍷</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{prod.nombre}</span>
                          </div>
                          {(prod.metadata?.bodega || prod.metadata?.do) && (
                            <div style={{ fontSize: 11, color: '#D9442B', marginTop: 2, fontWeight: 600 }}>
                              {[prod.metadata?.bodega, prod.metadata?.do].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {prod.metadata?.varietal && (
                            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 1 }}>{prod.metadata.varietal}</div>
                          )}
                          {(prod.metadata?.añada || prod.metadata?.temperatura_servicio) && (
                            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 1 }}>
                              {prod.metadata?.añada && <span>Añada {prod.metadata.añada}</span>}
                              {prod.metadata?.añada && prod.metadata?.temperatura_servicio && <span style={{ color: C.rule }}> · </span>}
                              {prod.metadata?.temperatura_servicio && <span>{prod.metadata.temperatura_servicio}</span>}
                            </div>
                          )}
                          {prod.metadata?.maridaje && (
                            <div style={{ fontSize: 10, color: C.creamDim, marginTop: 2, fontStyle: 'italic' }}>Maridaje: {prod.metadata.maridaje}</div>
                          )}
                          {prod.descripcion && (
                            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 2 }}>{prod.descripcion}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'white' }}>{fmt(prod.precio)}</div>
                          <button onClick={() => addToCart(prod)} style={{ width: 30, height: 30, borderRadius: 7, background: inCart ? C.vermilion : C.bg3, border: inCart ? 'none' : `1px solid ${C.rule}`, color: 'white', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {inCart ? inCart.qty : '+'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{prod.nombre}</div>
                        <div style={{ fontSize: 11, color: C.creamDim, marginTop: 1 }}>{prod.descripcion}</div>
                        {prod.alergenos && prod.alergenos.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                            {prod.alergenos.map((al: string) => (
                              <span key={al} style={{
                                fontSize: 9, padding: '1px 6px',
                                background: '#ffffff12', border: '1px solid #ffffff20',
                                borderRadius: 10, color: C.creamDim,
                              }}>{al}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmt(prod.precio)}</div>
                        <button onClick={() => addToCart(prod)} style={{ width: 30, height: 30, borderRadius: 7, background: inCart ? C.vermilion : C.bg3, border: inCart ? 'none' : `1px solid ${C.rule}`, color: 'white', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {inCart ? inCart.qty : '+'}
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* ── COOKING · esperando ── */}
      {screen === 'cooking' && !pedidoListo && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 22px', gap: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>👨‍🍳</div>
          <div style={{ fontSize: 23, fontStyle: 'italic' }}>En cocina...</div>
          <div style={{ fontSize: 13, color: C.creamDim }}>Tiempo estimado: ~12 min</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.green }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'iaPulse 1.4s ease-in-out infinite' }} />
            Te avisamos en esta pantalla en cuanto salga
          </div>
          {numComandas > 1 && (
            <div style={{ background: C.bg2, borderRadius: 10, padding: '8px 16px', border: `1px solid ${C.rule}` }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.creamDim }}>{numComandas} pedidos enviados esta sesión</span>
            </div>
          )}

          {/* Aviso en el móvil (push web) — para poder cerrar/bloquear la pantalla */}
          {avisoEstado === 'activo' ? (
            <div style={{ width: '100%', background: '#3F7D4422', border: `1px solid ${C.green}55`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <span style={{ fontSize: 12.5, color: C.creamMid, textAlign: 'left', lineHeight: 1.4 }}>Listo. Te avisaremos en el móvil aunque cierres esta página.</span>
            </div>
          ) : avisoEstado === 'no_soportado' ? (
            <div style={{ width: '100%', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '11px 15px', fontSize: 11.5, color: C.creamDim, lineHeight: 1.5 }}>
              Tu navegador no admite avisos al móvil. Deja esta pantalla abierta y te avisamos aquí.
            </div>
          ) : (
            <button
              onClick={suscribirAviso}
              disabled={avisoEstado === 'pidiendo'}
              style={{ width: '100%', padding: '13px', background: C.bg2, border: `1px solid ${C.amber}77`, borderRadius: 13, color: C.amber, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 16 }}>🔔</span>
              {avisoEstado === 'pidiendo' ? 'Activando...' : avisoEstado === 'error' ? 'Reintentar aviso al móvil' : 'Avísame en el móvil'}
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 2 }}>
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

      {/* ── COOKING · pedido listo ── */}
      {screen === 'cooking' && pedidoListo && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 22px', gap: 18, textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#3F7D4422', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, animation: 'iaPop 0.5s ease-out' }}>✅</div>
          <div style={{ fontSize: 26, fontStyle: 'italic', color: C.cream }}>¡Tu pedido está listo!</div>
          <div style={{ fontSize: 13.5, color: C.creamMid, lineHeight: 1.5 }}>Ya puede salir de cocina. ¡Que aproveche! 🍽️</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 6 }}>
            <button
              onClick={() => { setPedidoListo(false); setScreen('menu') }}
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

      {/* ── FOOTER ia.rest ── */}
      <div style={{ flexShrink: 0, padding: '14px 0 10px', textAlign: 'center', borderTop: `1px solid ${C.rule}22` }}>
        <a
          href="https://www.iarest.es"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: 0.45 }}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: C.creamDim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Gestionado con
          </span>
          <span style={{ fontFamily: 'serif', fontSize: 10, fontStyle: 'italic', color: C.cream, fontWeight: 600 }}>
            ia.rest
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: C.creamDim, letterSpacing: '0.05em' }}>
            · www.iarest.es
          </span>
        </a>
      </div>
    </div>
  )
}
