'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ─── Tipos ──────────────────────────────────────────────────────────────────
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

interface CartItem {
  producto: Producto
  cantidad: number
  notas?: string
}

type Pantalla = 'carta' | 'carrito' | 'datos' | 'pago' | 'confirmado'

// ─── Componente de pago Stripe ───────────────────────────────────────────────
function FormularioPago({
  clientSecret,
  onSuccess,
}: {
  clientSecret: string
  onSuccess: (pedidoId: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  const handlePagar = async () => {
    if (!stripe || !elements) return
    setProcesando(true)
    setError('')

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Error en el pago')
      setProcesando(false)
    } else {
      // Pago OK — el webhook procesará la comanda
      // Extraemos el pedido_id del clientSecret (o lo pasamos por prop)
      onSuccess('ok')
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      <button
        onClick={handlePagar}
        disabled={procesando || !stripe}
        className="w-full py-4 rounded-xl font-semibold text-white text-lg transition-all"
        style={{ backgroundColor: procesando ? '#999' : '#D9442B' }}
      >
        {procesando ? 'Procesando pago...' : 'Pagar ahora'}
      </button>
    </div>
  )
}

// ─── App principal ───────────────────────────────────────────────────────────
export default function StorefrontApp({ slug }: { slug: string }) {
  const [config, setConfig] = useState<StorefrontConfig | null>(null)
  const [secciones, setSecciones] = useState<Record<string, Producto[]>>({})
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [pantalla, setPantalla] = useState<Pantalla>('carta')
  const [tipo, setTipo] = useState<'delivery' | 'recogida'>('delivery')
  const [seccionActiva, setSeccionActiva] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [pedidoId, setPedidoId] = useState('')
  const [pedidoNumero, setPedidoNumero] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [creandoPedido, setCreandoPedido] = useState(false)

  // Formulario de datos del cliente
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')

  // Cargar carta
  useEffect(() => {
    fetch(`/api/storefront/carta?slug=${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setConfig(data.config)
        setSecciones(data.secciones)
        const primera = Object.keys(data.secciones)[0] ?? ''
        setSeccionActiva(primera)
        // Si no acepta delivery, forzar recogida
        if (!data.config.acepta_delivery && data.config.acepta_recogida) {
          setTipo('recogida')
        }
      })
      .catch(() => setError('Error cargando la tienda'))
      .finally(() => setCargando(false))
  }, [slug])

  const totalCarrito = carrito.reduce(
    (acc, item) => acc + item.producto.precio * item.cantidad, 0
  )
  const unidadesCarrito = carrito.reduce((acc, item) => acc + item.cantidad, 0)

  const añadirAlCarrito = useCallback((producto: Producto) => {
    setCarrito(prev => {
      const existe = prev.find(i => i.producto.id === producto.id)
      if (existe) {
        return prev.map(i =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        )
      }
      return [...prev, { producto, cantidad: 1 }]
    })
  }, [])

  const cambiarCantidad = useCallback((id: string, delta: number) => {
    setCarrito(prev =>
      prev
        .map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
        .filter(i => i.cantidad > 0)
    )
  }, [])

  const crearPedido = async () => {
    if (!nombre.trim() || !telefono.trim()) return
    if (tipo === 'delivery' && !direccion.trim()) return
    setCreandoPedido(true)

    const res = await fetch('/api/storefront/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        tipo,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: tipo === 'delivery' ? direccion : null,
        cliente_notas: notas || null,
        items: carrito.map(item => ({
          producto_id: item.producto.id,
          nombre: item.producto.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.producto.precio,
          notas: item.notas ?? null,
        })),
      }),
    })

    const data = await res.json()
    setCreandoPedido(false)

    if (data.error) {
      setError(data.error)
      return
    }

    setClientSecret(data.client_secret)
    setPedidoId(data.pedido_id)
    setPedidoNumero(data.numero)
    setPantalla('pago')
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F1E7]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#D9442B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6B5E4C] font-medium" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            Cargando carta...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F1E7]">
        <div className="text-center px-6">
          <p className="text-4xl mb-4">😕</p>
          <h1 className="text-xl font-bold text-[#14110E] mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
            Tienda no disponible
          </h1>
          <p className="text-[#6B5E4C]">{error}</p>
        </div>
      </div>
    )
  }

  if (!config) return null

  const acento = config.color_primario ?? '#D9442B'

  // ── PANTALLA CONFIRMADO ──────────────────────────────────────────────────
  if (pantalla === 'confirmado') {
    return (
      <div className="min-h-screen bg-[#F6F1E7] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl"
            style={{ backgroundColor: acento + '20' }}
          >
            ✓
          </div>
          <h1
            className="text-2xl font-bold text-[#14110E] mb-2"
            style={{ fontFamily: 'Newsreader, serif' }}
          >
            ¡Pedido recibido!
          </h1>
          <p className="text-[#6B5E4C] mb-4">
            Pedido #{pedidoNumero} confirmado.<br />
            {tipo === 'delivery'
              ? `Tu pedido llegará en aprox. ${config.tiempo_estimado_min} minutos.`
              : 'Te avisaremos cuando esté listo para recoger.'}
          </p>
          <a
            href={`/tienda/${slug}/pedido/${pedidoId}`}
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold"
            style={{ backgroundColor: acento }}
          >
            Ver estado del pedido
          </a>
        </div>
      </div>
    )
  }

  // ── PANTALLA PAGO ────────────────────────────────────────────────────────
  if (pantalla === 'pago' && clientSecret) {
    return (
      <div className="min-h-screen bg-[#F6F1E7]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#E8E0D4] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setPantalla('datos')}
            className="text-[#6B5E4C] hover:text-[#14110E]"
          >
            ← Volver
          </button>
          <h1 className="font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>
            Pago seguro
          </h1>
        </div>

        <div className="max-w-md mx-auto p-6">
          {/* Resumen */}
          <div className="bg-white rounded-2xl p-4 mb-6 border border-[#E8E0D4]">
            <p className="text-sm text-[#6B5E4C] mb-1">Total a pagar</p>
            <p className="text-3xl font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>
              {totalCarrito.toFixed(2)} €
            </p>
            <p className="text-sm text-[#6B5E4C] mt-1">
              {tipo === 'delivery' ? `Delivery · ${direccion}` : `Recogida en local`}
            </p>
          </div>

          <Elements stripe={stripePromise} options={{ clientSecret, locale: 'es' }}>
            <FormularioPago
              clientSecret={clientSecret}
              onSuccess={() => setPantalla('confirmado')}
            />
          </Elements>

          <p className="text-xs text-center text-[#9C8E7E] mt-4">
            Pago seguro procesado por Stripe
          </p>
        </div>
      </div>
    )
  }

  // ── PANTALLA DATOS DEL CLIENTE ────────────────────────────────────────────
  if (pantalla === 'datos') {
    const camposOK = nombre.trim() && telefono.trim() &&
      (tipo === 'recogida' || direccion.trim())

    return (
      <div className="min-h-screen bg-[#F6F1E7]">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#E8E0D4] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setPantalla('carrito')} className="text-[#6B5E4C]">← Volver</button>
          <h1 className="font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>
            Tus datos
          </h1>
        </div>

        <div className="max-w-md mx-auto p-6 space-y-4">
          {/* Tipo de pedido */}
          {config.acepta_delivery && config.acepta_recogida && (
            <div className="grid grid-cols-2 gap-3">
              {(['delivery', 'recogida'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className="py-3 rounded-xl font-semibold text-sm border-2 transition-all"
                  style={{
                    borderColor: tipo === t ? acento : '#E8E0D4',
                    backgroundColor: tipo === t ? acento + '15' : 'white',
                    color: tipo === t ? acento : '#6B5E4C',
                  }}
                >
                  {t === 'delivery' ? '🛵 Delivery' : '🏪 Recogida'}
                </button>
              ))}
            </div>
          )}

          {[
            { label: 'Nombre', value: nombre, set: setNombre, placeholder: 'Tu nombre', type: 'text' },
            { label: 'Teléfono', value: telefono, set: setTelefono, placeholder: '600 000 000', type: 'tel' },
            ...(tipo === 'delivery'
              ? [{ label: 'Dirección de entrega', value: direccion, set: setDireccion, placeholder: 'Calle, número, piso', type: 'text' }]
              : []),
            { label: 'Notas (opcional)', value: notas, set: setNotas, placeholder: 'Sin cebolla, sin gluten...', type: 'text' },
          ].map(field => (
            <div key={field.label}>
              <label className="block text-sm font-medium text-[#14110E] mb-1">
                {field.label}
              </label>
              <input
                type={field.type}
                value={field.value}
                onChange={e => field.set(e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-4 py-3 bg-white border border-[#E8E0D4] rounded-xl text-[#14110E] placeholder-[#C0B5A8] focus:outline-none focus:border-[#D9442B]"
                style={{ fontFamily: 'Inter Tight, sans-serif' }}
              />
            </div>
          ))}

          <button
            onClick={crearPedido}
            disabled={!camposOK || creandoPedido}
            className="w-full py-4 rounded-xl font-semibold text-white text-lg mt-4 transition-all"
            style={{ backgroundColor: camposOK && !creandoPedido ? acento : '#C0B5A8' }}
          >
            {creandoPedido ? 'Preparando pedido...' : `Ir a pagar · ${totalCarrito.toFixed(2)} €`}
          </button>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
        </div>
      </div>
    )
  }

  // ── PANTALLA CARRITO ─────────────────────────────────────────────────────
  if (pantalla === 'carrito') {
    return (
      <div className="min-h-screen bg-[#F6F1E7]">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#E8E0D4] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setPantalla('carta')} className="text-[#6B5E4C]">← Volver</button>
          <h1 className="font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>
            Tu pedido
          </h1>
        </div>

        <div className="max-w-md mx-auto p-4 space-y-3">
          {carrito.length === 0 ? (
            <div className="text-center py-16 text-[#9C8E7E]">
              <p className="text-4xl mb-3">🛒</p>
              <p>Tu carrito está vacío</p>
            </div>
          ) : (
            <>
              {carrito.map(item => (
                <div key={item.producto.id} className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-[#E8E0D4]">
                  <div className="flex-1">
                    <p className="font-semibold text-[#14110E]">{item.producto.nombre}</p>
                    <p className="text-sm text-[#9C8E7E]">{item.producto.precio.toFixed(2)} € / ud.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => cambiarCantidad(item.producto.id, -1)}
                      className="w-8 h-8 rounded-full border border-[#E8E0D4] flex items-center justify-center text-[#6B5E4C] font-bold"
                    >−</button>
                    <span className="w-6 text-center font-bold text-[#14110E]">{item.cantidad}</span>
                    <button
                      onClick={() => cambiarCantidad(item.producto.id, 1)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: acento }}
                    >+</button>
                  </div>
                  <p className="w-16 text-right font-bold text-[#14110E]">
                    {(item.producto.precio * item.cantidad).toFixed(2)} €
                  </p>
                </div>
              ))}

              {/* Total */}
              <div className="bg-white rounded-2xl p-4 border border-[#E8E0D4]">
                <div className="flex justify-between text-sm text-[#6B5E4C] mb-1">
                  <span>Subtotal</span>
                  <span>{totalCarrito.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-[#14110E]">
                  <span>Total</span>
                  <span>{totalCarrito.toFixed(2)} €</span>
                </div>
                {config.pedido_minimo_eur > 0 && totalCarrito < config.pedido_minimo_eur && (
                  <p className="text-xs text-amber-600 mt-2">
                    Pedido mínimo: {config.pedido_minimo_eur} €
                  </p>
                )}
              </div>

              <button
                onClick={() => setPantalla('datos')}
                disabled={totalCarrito < (config.pedido_minimo_eur ?? 0)}
                className="w-full py-4 rounded-xl font-semibold text-white text-lg"
                style={{
                  backgroundColor:
                    totalCarrito >= (config.pedido_minimo_eur ?? 0) ? acento : '#C0B5A8',
                }}
              >
                Continuar
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── PANTALLA CARTA (principal) ───────────────────────────────────────────
  const seccionesKeys = Object.keys(secciones)

  return (
    <div className="min-h-screen bg-[#F6F1E7]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#E8E0D4]">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-4">
          {config.logo_url && (
            <img src={config.logo_url} alt={config.nombre_publico} className="w-12 h-12 rounded-xl object-cover" />
          )}
          <div>
            <h1 className="text-xl font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>
              {config.nombre_publico}
            </h1>
            {config.descripcion && (
              <p className="text-sm text-[#9C8E7E]">{config.descripcion}</p>
            )}
          </div>
        </div>

        {/* Info tiempo */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-4 text-sm text-[#6B5E4C]">
          <span>⏱ ~{config.tiempo_estimado_min} min</span>
          {config.pedido_minimo_eur > 0 && <span>🛒 Mínimo {config.pedido_minimo_eur} €</span>}
        </div>

        {/* Navegación secciones */}
        <div className="max-w-2xl mx-auto overflow-x-auto scrollbar-none">
          <div className="flex gap-1 px-4 pb-3">
            {seccionesKeys.map(sec => (
              <button
                key={sec}
                onClick={() => {
                  setSeccionActiva(sec)
                  document.getElementById(`sec-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-all border"
                style={{
                  backgroundColor: seccionActiva === sec ? acento : 'white',
                  color: seccionActiva === sec ? 'white' : '#6B5E4C',
                  borderColor: seccionActiva === sec ? acento : '#E8E0D4',
                }}
              >
                {sec.charAt(0).toUpperCase() + sec.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Productos */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-8 pb-32">
        {seccionesKeys.map(sec => (
          <div key={sec} id={`sec-${sec}`}>
            <h2
              className="text-lg font-bold text-[#14110E] mb-3 capitalize"
              style={{ fontFamily: 'Newsreader, serif' }}
            >
              {sec}
            </h2>
            <div className="space-y-2">
              {(secciones[sec] ?? []).map(producto => {
                const enCarrito = carrito.find(i => i.producto.id === producto.id)
                return (
                  <div
                    key={producto.id}
                    className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-[#E8E0D4] active:scale-[0.99] transition-transform"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#14110E] truncate">{producto.nombre}</p>
                      {producto.descripcion && (
                        <p className="text-xs text-[#9C8E7E] line-clamp-2 mt-0.5">{producto.descripcion}</p>
                      )}
                      <p className="text-sm font-bold mt-1" style={{ color: acento }}>
                        {producto.precio.toFixed(2)} €
                      </p>
                    </div>
                    <div>
                      {enCarrito ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => cambiarCantidad(producto.id, -1)}
                            className="w-8 h-8 rounded-full border border-[#E8E0D4] flex items-center justify-center text-[#6B5E4C] font-bold"
                          >−</button>
                          <span className="w-5 text-center font-bold text-[#14110E]">{enCarrito.cantidad}</span>
                          <button
                            onClick={() => cambiarCantidad(producto.id, 1)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: acento }}
                          >+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => añadirAlCarrito(producto)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xl"
                          style={{ backgroundColor: acento }}
                        >+</button>
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
      {unidadesCarrito > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-20 px-4">
          <button
            onClick={() => setPantalla('carrito')}
            className="flex items-center gap-3 px-6 py-4 rounded-2xl text-white font-semibold shadow-2xl w-full max-w-sm"
            style={{ backgroundColor: acento }}
          >
            <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm font-bold">
              {unidadesCarrito}
            </span>
            <span className="flex-1 text-center">Ver pedido</span>
            <span className="font-bold">{totalCarrito.toFixed(2)} €</span>
          </button>
        </div>
      )}
    </div>
  )
}
