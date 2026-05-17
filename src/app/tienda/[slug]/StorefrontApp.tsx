'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Producto {
  id: string
  nombre: string
  descripcion?: string
  precio: number
  seccion: string
  alergenos?: string[]
}
interface StorefrontConfig {
  slug: string
  nombre_publico: string
  descripcion?: string
  logo_url?: string
  color_primario: string
  acepta_delivery: boolean
  acepta_recogida: boolean
  tiempo_estimado_min: number
  pedido_minimo_eur: number
}
interface CartItem { producto: Producto; cantidad: number }
type Vista = 'carta' | 'datos' | 'pago' | 'confirmado'

// ─── Stripe ───────────────────────────────────────────────────────────────────
function PagoStripe({ clientSecret, onOk }: { clientSecret: string; onOk: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pagar = async () => {
    if (!stripe || !elements) return
    setBusy(true); setErr('')
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (error) { setErr(error.message ?? 'Error'); setBusy(false) }
    else onOk()
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {err && (
        <p className="text-sm text-[#E8A33B] bg-[#E8A33B15] border border-[#E8A33B30] px-3 py-2 rounded-xl">
          {err}
        </p>
      )}
      <button
        onClick={pagar} disabled={busy || !stripe}
        className="w-full py-4 rounded-2xl font-bold text-[#F6F1E7] text-base transition-all active:scale-[0.98]"
        style={{ background: busy ? '#3A2E28' : '#D9442B' }}
      >
        {busy ? 'Procesando…' : 'Confirmar y pagar'}
      </button>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function StorefrontApp({ slug }: { slug: string }) {
  const [config, setConfig] = useState<StorefrontConfig | null>(null)
  const [secciones, setSecciones] = useState<Record<string, Producto[]>>({})
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [vista, setVista] = useState<Vista>('carta')
  const [tipo, setTipo] = useState<'delivery' | 'recogida'>('delivery')
  const [secActiva, setSecActiva] = useState('')
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [creando, setCreando] = useState(false)
  const [clientSecret, setClientSecret] = useState('')
  const [pedidoId, setPedidoId] = useState('')
  const [pedidoNum, setPedidoNum] = useState(0)
  const secRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    fetch(`/api/storefront/carta?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErr(d.error); return }
        setConfig(d.config)
        setSecciones(d.secciones)
        setSecActiva(Object.keys(d.secciones)[0] ?? '')
        if (!d.config.acepta_delivery) setTipo('recogida')
      })
      .catch(() => setErr('No se pudo cargar la carta'))
      .finally(() => setCargando(false))
  }, [slug])

  // Scroll spy
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setSecActiva(e.target.id.replace('sec-', '')) }),
      { rootMargin: '-35% 0px -60% 0px' }
    )
    Object.values(secRefs.current).forEach(el => { if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [secciones])

  const total = carrito.reduce((a, i) => a + i.producto.precio * i.cantidad, 0)
  const uds   = carrito.reduce((a, i) => a + i.cantidad, 0)

  const añadir = useCallback((p: Producto) => {
    setCarrito(prev => {
      const ex = prev.find(i => i.producto.id === p.id)
      return ex
        ? prev.map(i => i.producto.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)
        : [...prev, { producto: p, cantidad: 1 }]
    })
  }, [])

  const cambiar = useCallback((id: string, delta: number) => {
    setCarrito(prev =>
      prev.map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
          .filter(i => i.cantidad > 0)
    )
  }, [])

  const irSec = (sec: string) => {
    setSecActiva(sec)
    secRefs.current[sec]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const crearPedido = async () => {
    if (!nombre.trim() || !telefono.trim()) return
    if (tipo === 'delivery' && !direccion.trim()) return
    setCreando(true); setErr('')
    const res = await fetch('/api/storefront/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, tipo,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: tipo === 'delivery' ? direccion : null,
        cliente_notas: notas || null,
        items: carrito.map(i => ({
          producto_id: i.producto.id,
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.producto.precio,
        })),
      }),
    })
    const d = await res.json()
    setCreando(false)
    if (d.error) { setErr(d.error); return }
    setClientSecret(d.client_secret)
    setPedidoId(d.pedido_id)
    setPedidoNum(d.numero)
    setVista('pago')
  }

  // ── Carga ────────────────────────────────────────────────────────────────
  if (cargando) return (
    <div className="min-h-screen bg-[#14110E] flex items-center justify-center" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-[#D9442B] border-t-transparent animate-spin" />
        <span className="text-sm text-[#9C8E7E]">Cargando carta…</span>
      </div>
    </div>
  )

  if (err && !config) return (
    <div className="min-h-screen bg-[#14110E] flex items-center justify-center p-6" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="text-center">
        <p className="text-[#D9442B] text-4xl mb-4">!</p>
        <p className="font-bold text-[#F6F1E7] text-lg mb-1" style={{ fontFamily: 'Newsreader, serif' }}>Tienda no disponible</p>
        <p className="text-[#9C8E7E] text-sm">{err}</p>
      </div>
    </div>
  )
  if (!config) return null

  // ── Confirmado ────────────────────────────────────────────────────────────
  if (vista === 'confirmado') return (
    <div className="min-h-screen bg-[#14110E] flex flex-col items-center justify-center p-6 text-center" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="w-16 h-16 rounded-full border-2 border-[#3F7D44] flex items-center justify-center text-[#3F7D44] text-2xl mb-6">✓</div>
      <h1 className="text-2xl font-bold text-[#F6F1E7] mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
        Pedido #{pedidoNum} recibido
      </h1>
      <p className="text-[#9C8E7E] text-sm mb-8">
        {tipo === 'delivery'
          ? `Tu pedido llegará en aprox. ${config.tiempo_estimado_min} min`
          : 'Listo para recoger en breve'}
      </p>
      <a
        href={`/tienda/${slug}/pedido/${pedidoId}`}
        className="w-full max-w-xs py-4 rounded-2xl font-bold text-[#F6F1E7] text-sm block border border-[#D9442B] hover:bg-[#D9442B15] transition-colors"
        style={{ color: '#D9442B' }}
      >
        Ver estado del pedido en directo
      </a>
    </div>
  )

  // ── Pago ──────────────────────────────────────────────────────────────────
  if (vista === 'pago' && clientSecret) return (
    <div className="min-h-screen bg-[#14110E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="sticky top-0 bg-[#14110E] border-b border-[#2A2420] px-4 py-3 flex items-center gap-3">
        <button onClick={() => setVista('datos')} className="text-[#9C8E7E] text-sm">← Volver</button>
        <span className="font-bold text-[#F6F1E7]" style={{ fontFamily: 'Newsreader, serif' }}>Pago seguro</span>
      </div>
      <div className="max-w-md mx-auto p-5">
        {/* Resumen */}
        <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] p-4 mb-5">
          <p className="text-xs text-[#9C8E7E] uppercase tracking-wide mb-1">Total a pagar</p>
          <p className="text-3xl font-bold text-[#F6F1E7]" style={{ fontFamily: 'Newsreader, serif' }}>
            {total.toFixed(2)} €
          </p>
          <p className="text-xs text-[#9C8E7E] mt-1">
            {tipo === 'delivery' ? `Delivery · ${direccion}` : 'Recogida en local'}
          </p>
        </div>
        <Elements stripe={stripePromise} options={{
          clientSecret,
          locale: 'es',
          appearance: {
            theme: 'night',
            variables: {
              colorPrimary: '#D9442B',
              colorBackground: '#1E1A16',
              colorText: '#F6F1E7',
              colorTextSecondary: '#9C8E7E',
              borderRadius: '12px',
              fontFamily: 'Inter Tight, sans-serif',
            }
          }
        }}>
          <PagoStripe clientSecret={clientSecret} onOk={() => setVista('confirmado')} />
        </Elements>
        <p className="text-center text-xs text-[#4A3F35] mt-4">Pago procesado por Stripe</p>
      </div>
    </div>
  )

  // ── Datos del cliente ─────────────────────────────────────────────────────
  if (vista === 'datos') {
    const ok = nombre.trim() && telefono.trim() && (tipo !== 'delivery' || direccion.trim())
    return (
      <div className="min-h-screen bg-[#14110E] flex flex-col" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
        <div className="sticky top-0 bg-[#14110E] border-b border-[#2A2420] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setVista('carta')} className="text-[#9C8E7E] text-sm">← Volver</button>
          <span className="font-bold text-[#F6F1E7]" style={{ fontFamily: 'Newsreader, serif' }}>Tu pedido</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto p-4 space-y-4">

            {/* Tipo */}
            {config.acepta_delivery && config.acepta_recogida && (
              <div className="grid grid-cols-2 gap-2">
                {(['delivery', 'recogida'] as const).map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    className="py-3 rounded-xl text-sm font-semibold border transition-all"
                    style={{
                      borderColor: tipo === t ? '#D9442B' : '#2A2420',
                      background: tipo === t ? '#D9442B15' : '#1E1A16',
                      color: tipo === t ? '#D9442B' : '#9C8E7E',
                    }}>
                    {t === 'delivery' ? 'Delivery' : 'Recoger en local'}
                  </button>
                ))}
              </div>
            )}

            {/* Resumen carrito */}
            <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] overflow-hidden">
              {carrito.map((item, i) => (
                <div key={item.producto.id}
                  className={`flex items-center justify-between px-4 py-3 ${i < carrito.length - 1 ? 'border-b border-[#2A2420]' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#F6F1E7] bg-[#D9442B] px-1.5 py-0.5 rounded-md min-w-[22px] text-center">
                      {item.cantidad}
                    </span>
                    <span className="text-sm text-[#D8CDB6]">{item.producto.nombre}</span>
                  </div>
                  <span className="text-sm text-[#9C8E7E]">
                    {(item.producto.precio * item.cantidad).toFixed(2)} €
                  </span>
                </div>
              ))}
              <div className="px-4 py-3 border-t border-[#2A2420] flex justify-between">
                <span className="text-sm font-bold text-[#F6F1E7]">Total</span>
                <span className="text-sm font-bold text-[#D9442B]">{total.toFixed(2)} €</span>
              </div>
            </div>

            {/* Campos */}
            {[
              { label: 'Tu nombre', val: nombre, set: setNombre, ph: 'Nombre completo', type: 'text' },
              { label: 'Teléfono', val: telefono, set: setTelefono, ph: '600 000 000', type: 'tel' },
              ...(tipo === 'delivery'
                ? [{ label: 'Dirección de entrega', val: direccion, set: setDireccion, ph: 'Calle, número, piso', type: 'text' }]
                : []),
              { label: 'Notas (opcional)', val: notas, set: setNotas, ph: 'Sin cebolla, alérgenos…', type: 'text' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-[#9C8E7E] mb-1.5 uppercase tracking-wide">
                  {f.label}
                </label>
                <input
                  type={f.type} value={f.val}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.ph}
                  className="w-full px-4 py-3 rounded-xl bg-[#1E1A16] border border-[#2A2420] text-[#F6F1E7] placeholder-[#4A3F35] text-sm focus:outline-none focus:border-[#D9442B] transition-colors"
                />
              </div>
            ))}

            {err && (
              <p className="text-sm text-[#E8A33B] text-center">{err}</p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#2A2420] bg-[#14110E]">
          <button onClick={crearPedido} disabled={!ok || creando}
            className="w-full py-4 rounded-2xl font-bold text-[#F6F1E7] text-sm transition-all active:scale-[0.98]"
            style={{ background: ok && !creando ? '#D9442B' : '#2A2420', color: ok && !creando ? '#F6F1E7' : '#4A3F35' }}>
            {creando ? 'Un momento…' : `Ir a pagar · ${total.toFixed(2)} €`}
          </button>
        </div>
      </div>
    )
  }

  // ── CARTA ─────────────────────────────────────────────────────────────────
  const secsKeys = Object.keys(secciones)

  return (
    <div className="min-h-screen bg-[#14110E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#14110E] border-b border-[#2A2420]">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center gap-3 mb-3">
            {config.logo_url && (
              <img src={config.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-[#F6F1E7] text-base leading-tight truncate"
                style={{ fontFamily: 'Newsreader, serif' }}>
                {config.nombre_publico}
              </h1>
              <div className="flex items-center gap-2 text-xs text-[#9C8E7E] mt-0.5 flex-wrap">
                <span>{config.tiempo_estimado_min} min</span>
                {config.pedido_minimo_eur > 0 && (
                  <><span className="text-[#2A2420]">·</span><span>Mín. {config.pedido_minimo_eur} €</span></>
                )}
                {config.acepta_delivery && (
                  <><span className="text-[#2A2420]">·</span><span className="text-[#3F7D44]">Delivery</span></>
                )}
                {config.acepta_recogida && (
                  <><span className="text-[#2A2420]">·</span><span className="text-[#3F7D44]">Recogida</span></>
                )}
              </div>
            </div>
          </div>

          {/* Tabs secciones */}
          <div className="overflow-x-auto scrollbar-none pb-3">
            <div className="flex gap-1.5 w-max">
              {secsKeys.map(sec => (
                <button key={sec} onClick={() => irSec(sec)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border"
                  style={{
                    background: secActiva === sec ? '#D9442B' : 'transparent',
                    color: secActiva === sec ? '#F6F1E7' : '#9C8E7E',
                    borderColor: secActiva === sec ? '#D9442B' : '#2A2420',
                  }}>
                  {sec.charAt(0).toUpperCase() + sec.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Productos */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-36 space-y-6">
        {secsKeys.map(sec => (
          <div key={sec} id={`sec-${sec}`} ref={el => { secRefs.current[sec] = el }}>
            <h2 className="text-sm font-bold text-[#9C8E7E] uppercase tracking-widest mb-2">
              {sec}
            </h2>
            <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] overflow-hidden divide-y divide-[#2A2420]">
              {(secciones[sec] ?? []).map(p => {
                const en = carrito.find(i => i.producto.id === p.id)
                return (
                  <div key={p.id} className="flex items-center px-4 py-3.5 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#F6F1E7] leading-snug">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="text-xs text-[#9C8E7E] mt-0.5 line-clamp-2">{p.descripcion}</p>
                      )}
                      {p.alergenos && p.alergenos.length > 0 && (
                        <p className="text-xs text-[#4A3F35] mt-0.5">{p.alergenos.join(' · ')}</p>
                      )}
                      <p className="text-sm font-bold text-[#D9442B] mt-1">
                        {p.precio.toFixed(2)} €
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {en ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => cambiar(p.id, -1)}
                            className="w-7 h-7 rounded-full border border-[#3A2E28] flex items-center justify-center text-[#D8CDB6] font-bold text-base leading-none transition-colors active:bg-[#2A2420]">
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-bold text-[#F6F1E7]"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {en.cantidad}
                          </span>
                          <button onClick={() => cambiar(p.id, 1)}
                            className="w-7 h-7 rounded-full bg-[#D9442B] flex items-center justify-center text-[#F6F1E7] font-bold text-base leading-none transition-colors active:bg-[#A8311E]">
                            +
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => añadir(p)}
                          className="w-8 h-8 rounded-full bg-[#D9442B] flex items-center justify-center text-[#F6F1E7] font-bold text-lg leading-none transition-colors active:bg-[#A8311E]">
                          +
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Botón carrito flotante */}
      {uds > 0 && !drawerAbierto && (
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-30 px-4">
          <button onClick={() => setDrawerAbierto(true)}
            className="flex items-center gap-3 px-5 py-3.5 rounded-2xl font-bold shadow-2xl w-full max-w-sm transition-all active:scale-[0.98]"
            style={{ background: '#D9442B', color: '#F6F1E7' }}>
            <span className="bg-[#A8311E] rounded-lg px-2 py-0.5 text-xs font-bold min-w-[28px] text-center"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {uds}
            </span>
            <span className="flex-1 text-center text-sm">Ver mi pedido</span>
            <span className="text-sm" style={{ fontFamily: 'Newsreader, serif' }}>
              {total.toFixed(2)} €
            </span>
          </button>
        </div>
      )}

      {/* Drawer carrito */}
      {drawerAbierto && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setDrawerAbierto(false)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-[#1E1A16] rounded-t-3xl border-t border-[#2A2420] shadow-2xl flex flex-col max-h-[80vh]">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-[#2A2420]" />
            </div>
            {/* Título */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-[#2A2420] flex-shrink-0">
              <h2 className="font-bold text-[#F6F1E7]" style={{ fontFamily: 'Newsreader, serif' }}>
                Tu pedido
              </h2>
              <button onClick={() => setDrawerAbierto(false)}
                className="text-xs text-[#9C8E7E] border border-[#2A2420] px-2.5 py-1 rounded-lg">
                Cerrar
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {carrito.map(item => (
                <div key={item.producto.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#F6F1E7] truncate">{item.producto.nombre}</p>
                    <p className="text-xs text-[#9C8E7E]">{item.producto.precio.toFixed(2)} € / ud.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cambiar(item.producto.id, -1)}
                      className="w-7 h-7 rounded-full border border-[#3A2E28] flex items-center justify-center text-[#D8CDB6] font-bold text-base leading-none">
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-[#F6F1E7]"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {item.cantidad}
                    </span>
                    <button onClick={() => cambiar(item.producto.id, 1)}
                      className="w-7 h-7 rounded-full bg-[#D9442B] flex items-center justify-center text-[#F6F1E7] font-bold text-base leading-none active:bg-[#A8311E]">
                      +
                    </button>
                  </div>
                  <p className="w-14 text-right text-sm font-bold text-[#F6F1E7]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {(item.producto.precio * item.cantidad).toFixed(2)} €
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 pt-3 border-t border-[#2A2420] space-y-3 flex-shrink-0">
              {config.pedido_minimo_eur > 0 && total < config.pedido_minimo_eur && (
                <p className="text-xs text-[#E8A33B] text-center bg-[#E8A33B10] border border-[#E8A33B20] py-2 rounded-xl">
                  Pedido mínimo {config.pedido_minimo_eur} € · Faltan {(config.pedido_minimo_eur - total).toFixed(2)} €
                </p>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-[#F6F1E7]">Total</span>
                <span className="font-bold text-[#D9442B]" style={{ fontFamily: 'Newsreader, serif' }}>
                  {total.toFixed(2)} €
                </span>
              </div>
              <button
                onClick={() => { setDrawerAbierto(false); setVista('datos') }}
                disabled={total < (config.pedido_minimo_eur ?? 0)}
                className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
                style={{
                  background: total >= (config.pedido_minimo_eur ?? 0) ? '#D9442B' : '#2A2420',
                  color: total >= (config.pedido_minimo_eur ?? 0) ? '#F6F1E7' : '#4A3F35',
                }}>
                Pedir ahora · {total.toFixed(2)} €
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
