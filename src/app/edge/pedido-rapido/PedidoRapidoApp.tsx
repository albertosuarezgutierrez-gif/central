'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Producto {
  id: string
  nombre: string
  precio: number
  seccion: string
}

interface CartItem {
  producto: Producto
  cantidad: number
  notas?: string
}

interface Session {
  id: string
  nombre: string
  rol: string
  restaurante_id: string
}

type Canal = 'telefono' | 'mostrador'
type TipoPedido = 'delivery' | 'recogida'
type Cobro = 'efectivo' | 'tarjeta' | 'contraentrega'
type Paso = 'canal' | 'cliente' | 'carta' | 'confirmar' | 'enviado'

// ─── App ─────────────────────────────────────────────────────────────────────
export default function PedidoRapidoApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [secciones, setSecciones] = useState<Record<string, Producto[]>>({})
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [seccionActiva, setSeccionActiva] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const [paso, setPaso] = useState<Paso>('canal')
  const [canal, setCanal] = useState<Canal>('telefono')
  const [tipo, setTipo] = useState<TipoPedido>('delivery')
  const [cobro, setCobro] = useState<Cobro>('contraentrega')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [tiempoMin, setTiempoMin] = useState(30)

  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ numero: number; tiempo: number } | null>(null)
  const [error, setError] = useState('')

  // Leer sesión
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ia_session')
      if (raw) setSession(JSON.parse(raw))
    } catch { /* nada */ }
  }, [])

  // Cargar productos del restaurante
  useEffect(() => {
    if (!session) return
    const headers = {
      'Content-Type': 'application/json',
      'x-ia-session': JSON.stringify(session),
    }
    fetch('/api/carta', { headers })
      .then(r => r.json())
      .then(data => {
        const prods: Producto[] = (data.productos ?? data ?? []).filter(
          (p: Producto & { activo?: boolean }) => p.activo !== false
        )
        setProductos(prods)
        const secs: Record<string, Producto[]> = {}
        for (const p of prods) {
          const s = p.seccion ?? 'Otros'
          if (!secs[s]) secs[s] = []
          secs[s]!.push(p)
        }
        setSecciones(secs)
        setSeccionActiva(Object.keys(secs)[0] ?? '')
      })
      .catch(() => {
        // Fallback: cargar desde productos API directa
        fetch('/api/owner/productos', { headers })
          .then(r => r.json())
          .then(data => {
            const prods = data.productos ?? []
            setProductos(prods)
            const secs: Record<string, Producto[]> = {}
            for (const p of prods) {
              const s = p.seccion ?? 'Otros'
              if (!secs[s]) secs[s] = []
              secs[s]!.push(p)
            }
            setSecciones(secs)
            setSeccionActiva(Object.keys(secs)[0] ?? '')
          })
      })
  }, [session])

  const añadir = useCallback((producto: Producto) => {
    setCarrito(prev => {
      const existe = prev.find(i => i.producto.id === producto.id)
      if (existe) return prev.map(i => i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { producto, cantidad: 1 }]
    })
  }, [])

  const cambiar = useCallback((id: string, delta: number) => {
    setCarrito(prev => prev.map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + delta } : i).filter(i => i.cantidad > 0))
  }, [])

  const total = carrito.reduce((acc, i) => acc + i.producto.precio * i.cantidad, 0)
  const unidades = carrito.reduce((acc, i) => acc + i.cantidad, 0)

  const productosFiltrados = busqueda.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : (secciones[seccionActiva] ?? [])

  const enviar = async () => {
    if (!session || !carrito.length) return
    setEnviando(true)
    setError('')

    const res = await fetch('/api/storefront/pedido-operador', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ia-session': JSON.stringify(session),
      },
      body: JSON.stringify({
        canal,
        tipo,
        cobro,
        cliente_nombre: nombre.trim() || (canal === 'mostrador' ? 'Cliente mostrador' : 'Cliente'),
        cliente_telefono: telefono.trim() || '',
        cliente_direccion: tipo === 'delivery' ? direccion.trim() : null,
        cliente_notas: notas.trim() || null,
        tiempo_recogida_min: tiempoMin,
        items: carrito.map(i => ({
          producto_id: i.producto.id,
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.producto.precio,
          notas: i.notas ?? null,
        })),
      }),
    })

    const data = await res.json()
    setEnviando(false)

    if (data.error) { setError(data.error); return }

    setResultado({ numero: data.numero, tiempo: data.tiempo_recogida_min })
    setPaso('enviado')
  }

  const resetear = () => {
    setCarrito([])
    setNombre('')
    setTelefono('')
    setDireccion('')
    setNotas('')
    setResultado(null)
    setError('')
    setPaso('canal')
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#14110E] flex items-center justify-center">
        <p className="text-[#D8CDB6]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
          Inicia sesión primero
        </p>
      </div>
    )
  }

  // ── ENVIADO ──────────────────────────────────────────────────────────────
  if (paso === 'enviado' && resultado) {
    const iconCanal = canal === 'telefono' ? '📞' : '🏪'
    const labelTipo = tipo === 'delivery' ? 'Delivery' : 'Recogida'
    return (
      <div className="min-h-screen bg-[#14110E] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-[#F6F1E7] mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
            Pedido #{resultado.numero} enviado
          </h1>
          <div className="bg-[#1E1A16] rounded-2xl p-4 mb-6 space-y-2">
            <p className="text-[#D8CDB6] text-sm">
              {iconCanal} {canal === 'telefono' ? 'Pedido por teléfono' : 'Mostrador'} · {labelTipo}
            </p>
            <p className="text-[#F6F1E7] font-bold text-lg">{nombre || 'Cliente'}</p>
            {telefono && <p className="text-[#D8CDB6] text-sm">{telefono}</p>}
            {tipo === 'delivery' && direccion && (
              <p className="text-[#D8CDB6] text-sm">{direccion}</p>
            )}
            <p className="text-[#E8A33B] font-semibold">
              ⏱ {resultado.tiempo} min · {total.toFixed(2)} €
            </p>
            <p className="text-[#9C8E7E] text-xs capitalize">Cobro: {cobro}</p>
          </div>
          <div className="space-y-3">
            <button
              onClick={resetear}
              className="w-full py-4 rounded-xl bg-[#D9442B] text-white font-semibold text-lg"
            >
              Nuevo pedido
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── PASO 1: CANAL ────────────────────────────────────────────────────────
  if (paso === 'canal') {
    return (
      <div className="min-h-screen bg-[#14110E] p-6 flex flex-col" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
        <h1 className="text-2xl font-bold text-[#F6F1E7] mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
          Nuevo pedido
        </h1>
        <p className="text-[#9C8E7E] mb-8">¿Cómo llega este pedido?</p>

        <div className="space-y-3 mb-8">
          {([
            { key: 'telefono', icon: '📞', label: 'Por teléfono', desc: 'El cliente ha llamado' },
            { key: 'mostrador', icon: '🏪', label: 'En mostrador', desc: 'El cliente está aquí' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => {
                setCanal(opt.key)
                if (opt.key === 'mostrador') {
                  setTipo('recogida')
                  setCobro('efectivo')
                  setTiempoMin(15)
                } else {
                  setTipo('delivery')
                  setCobro('contraentrega')
                  setTiempoMin(30)
                }
              }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left"
              style={{
                borderColor: canal === opt.key ? '#D9442B' : '#2A2420',
                backgroundColor: canal === opt.key ? '#D9442B15' : '#1E1A16',
              }}
            >
              <span className="text-3xl">{opt.icon}</span>
              <div>
                <p className="font-semibold text-[#F6F1E7]">{opt.label}</p>
                <p className="text-sm text-[#9C8E7E]">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Tipo delivery/recogida — solo para teléfono */}
        {canal === 'telefono' && (
          <div className="mb-8">
            <p className="text-[#D8CDB6] text-sm font-medium mb-3">¿Delivery o recogida?</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: 'delivery', label: '🛵 Delivery' },
                { key: 'recogida', label: '🏃 Recogida' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTipo(t.key)
                    setCobro(t.key === 'delivery' ? 'contraentrega' : 'efectivo')
                  }}
                  className="py-3 rounded-xl border-2 font-medium text-sm transition-all"
                  style={{
                    borderColor: tipo === t.key ? '#D9442B' : '#2A2420',
                    backgroundColor: tipo === t.key ? '#D9442B15' : '#1E1A16',
                    color: tipo === t.key ? '#D9442B' : '#9C8E7E',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setPaso('cliente')}
          className="w-full py-4 rounded-xl bg-[#D9442B] text-white font-semibold text-lg mt-auto"
        >
          Continuar →
        </button>
      </div>
    )
  }

  // ── PASO 2: DATOS CLIENTE ────────────────────────────────────────────────
  if (paso === 'cliente') {
    const esOpcional = canal === 'mostrador'
    return (
      <div className="min-h-screen bg-[#14110E] flex flex-col" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
        <div className="sticky top-0 bg-[#14110E] border-b border-[#2A2420] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setPaso('canal')} className="text-[#9C8E7E]">← Volver</button>
          <h1 className="font-bold text-[#F6F1E7]" style={{ fontFamily: 'Newsreader, serif' }}>
            {canal === 'telefono' ? 'Datos del cliente' : 'Cliente en mostrador'}
          </h1>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-32">
          {[
            { label: `Nombre${esOpcional ? ' (opcional)' : ''}`, value: nombre, set: setNombre, placeholder: canal === 'mostrador' ? 'Nombre o alias' : 'Nombre completo', type: 'text' },
            { label: `Teléfono${esOpcional ? ' (opcional)' : ''}`, value: telefono, set: setTelefono, placeholder: '600 000 000', type: 'tel' },
            ...(tipo === 'delivery'
              ? [{ label: 'Dirección de entrega', value: direccion, set: setDireccion, placeholder: 'Calle, número, piso, localidad', type: 'text' }]
              : []),
            { label: 'Notas (opcional)', value: notas, set: setNotas, placeholder: 'Sin cebolla, alérgico a...', type: 'text' },
          ].map(field => (
            <div key={field.label}>
              <label className="block text-sm font-medium text-[#D8CDB6] mb-1">{field.label}</label>
              <input
                type={field.type}
                value={field.value}
                onChange={e => field.set(e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-4 py-3 bg-[#1E1A16] border border-[#2A2420] rounded-xl text-[#F6F1E7] placeholder-[#4A3F35] focus:outline-none focus:border-[#D9442B]"
              />
            </div>
          ))}

          {/* Tiempo estimado */}
          <div>
            <label className="block text-sm font-medium text-[#D8CDB6] mb-1">
              Tiempo estimado: <span className="text-[#D9442B] font-bold">{tiempoMin} min</span>
            </label>
            <div className="flex gap-2">
              {(canal === 'mostrador'
                ? [10, 15, 20, 30]
                : tipo === 'delivery'
                ? [25, 30, 40, 50, 60]
                : [10, 15, 20, 25]
              ).map(t => (
                <button
                  key={t}
                  onClick={() => setTiempoMin(t)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition-all"
                  style={{
                    borderColor: tiempoMin === t ? '#D9442B' : '#2A2420',
                    backgroundColor: tiempoMin === t ? '#D9442B' : '#1E1A16',
                    color: tiempoMin === t ? 'white' : '#9C8E7E',
                  }}
                >
                  {t}'
                </button>
              ))}
            </div>
          </div>

          {/* Forma de cobro */}
          <div>
            <label className="block text-sm font-medium text-[#D8CDB6] mb-2">Forma de cobro</label>
            <div className="grid grid-cols-3 gap-2">
              {(tipo === 'delivery'
                ? ['contraentrega', 'efectivo', 'tarjeta'] as Cobro[]
                : ['efectivo', 'tarjeta'] as Cobro[]
              ).map(c => (
                <button
                  key={c}
                  onClick={() => setCobro(c)}
                  className="py-2 rounded-lg text-xs font-medium border transition-all capitalize"
                  style={{
                    borderColor: cobro === c ? '#D9442B' : '#2A2420',
                    backgroundColor: cobro === c ? '#D9442B' : '#1E1A16',
                    color: cobro === c ? 'white' : '#9C8E7E',
                  }}
                >
                  {c === 'contraentrega' ? 'Al entregar' : c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 p-4 bg-[#14110E] border-t border-[#2A2420]">
          <button
            onClick={() => setPaso('carta')}
            className="w-full py-4 rounded-xl bg-[#D9442B] text-white font-semibold text-lg"
          >
            Elegir productos →
          </button>
        </div>
      </div>
    )
  }

  // ── PASO 3: CARTA ────────────────────────────────────────────────────────
  if (paso === 'carta') {
    const seccionesKeys = Object.keys(secciones)
    return (
      <div className="min-h-screen bg-[#14110E] flex flex-col" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#14110E] border-b border-[#2A2420]">
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={() => setPaso('cliente')} className="text-[#9C8E7E]">← Volver</button>
            <h1 className="font-bold text-[#F6F1E7] flex-1" style={{ fontFamily: 'Newsreader, serif' }}>
              {nombre || (canal === 'mostrador' ? 'Mostrador' : 'Teléfono')}
            </h1>
            {unidades > 0 && (
              <span className="bg-[#D9442B] text-white text-xs font-bold px-2 py-1 rounded-full">
                {unidades}
              </span>
            )}
          </div>

          {/* Buscador */}
          <div className="px-4 pb-2">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full px-3 py-2 bg-[#1E1A16] border border-[#2A2420] rounded-xl text-[#F6F1E7] placeholder-[#4A3F35] focus:outline-none focus:border-[#D9442B] text-sm"
            />
          </div>

          {/* Secciones */}
          {!busqueda && (
            <div className="flex gap-1 px-4 pb-3 overflow-x-auto scrollbar-none">
              {seccionesKeys.map(sec => (
                <button
                  key={sec}
                  onClick={() => setSeccionActiva(sec)}
                  className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                  style={{
                    backgroundColor: seccionActiva === sec ? '#D9442B' : '#1E1A16',
                    color: seccionActiva === sec ? 'white' : '#9C8E7E',
                    borderColor: seccionActiva === sec ? '#D9442B' : '#2A2420',
                  }}
                >
                  {sec}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista productos */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-36">
          {productosFiltrados.map(producto => {
            const enCarrito = carrito.find(i => i.producto.id === producto.id)
            return (
              <div
                key={producto.id}
                className="flex items-center justify-between bg-[#1E1A16] rounded-xl px-4 py-3 border border-[#2A2420]"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#F6F1E7] truncate">{producto.nombre}</p>
                  <p className="text-sm font-bold text-[#D9442B]">{producto.precio.toFixed(2)} €</p>
                </div>
                <div>
                  {enCarrito ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => cambiar(producto.id, -1)}
                        className="w-8 h-8 rounded-full border border-[#3A3028] flex items-center justify-center text-[#D8CDB6] font-bold"
                      >−</button>
                      <span className="w-5 text-center font-bold text-[#F6F1E7]">{enCarrito.cantidad}</span>
                      <button
                        onClick={() => cambiar(producto.id, 1)}
                        className="w-8 h-8 rounded-full bg-[#D9442B] flex items-center justify-center text-white font-bold"
                      >+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => añadir(producto)}
                      className="w-8 h-8 rounded-full bg-[#D9442B] flex items-center justify-center text-white font-bold text-xl"
                    >+</button>
                  )}
                </div>
              </div>
            )
          })}
          {productosFiltrados.length === 0 && busqueda && (
            <p className="text-center text-[#4A3F35] py-8">Sin resultados para "{busqueda}"</p>
          )}
        </div>

        {/* Botón confirmar pedido */}
        {unidades > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#14110E] border-t border-[#2A2420]">
            <button
              onClick={() => setPaso('confirmar')}
              className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-[#D9442B] text-white font-semibold"
            >
              <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm">{unidades} items</span>
              <span>Confirmar pedido</span>
              <span className="font-bold">{total.toFixed(2)} €</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── PASO 4: CONFIRMAR ────────────────────────────────────────────────────
  const iconCanal = canal === 'telefono' ? '📞' : '🏪'
  const labelCanal = canal === 'telefono' ? 'Teléfono' : 'Mostrador'
  const labelTipo = tipo === 'delivery' ? '🛵 Delivery' : '🏃 Recogida'

  return (
    <div className="min-h-screen bg-[#14110E] flex flex-col" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="sticky top-0 bg-[#14110E] border-b border-[#2A2420] px-4 py-3 flex items-center gap-3">
        <button onClick={() => setPaso('carta')} className="text-[#9C8E7E]">← Editar</button>
        <h1 className="font-bold text-[#F6F1E7]" style={{ fontFamily: 'Newsreader, serif' }}>
          Confirmar pedido
        </h1>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-32">
        {/* Resumen cliente */}
        <div className="bg-[#1E1A16] rounded-2xl p-4 border border-[#2A2420] space-y-1">
          <p className="text-xs text-[#9C8E7E] uppercase tracking-wide">{iconCanal} {labelCanal} · {labelTipo}</p>
          <p className="font-bold text-[#F6F1E7]">{nombre || 'Cliente'}</p>
          {telefono && <p className="text-sm text-[#D8CDB6]">{telefono}</p>}
          {tipo === 'delivery' && direccion && <p className="text-sm text-[#D8CDB6]">{direccion}</p>}
          {notas && <p className="text-sm text-[#E8A33B]">Nota: {notas}</p>}
          <div className="flex gap-3 pt-1">
            <span className="text-xs bg-[#2A2420] text-[#9C8E7E] px-2 py-1 rounded-md">⏱ {tiempoMin} min</span>
            <span className="text-xs bg-[#2A2420] text-[#9C8E7E] px-2 py-1 rounded-md capitalize">💰 {cobro === 'contraentrega' ? 'Al entregar' : cobro}</span>
          </div>
        </div>

        {/* Items */}
        <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420]">
          {carrito.map((item, i) => (
            <div
              key={item.producto.id}
              className={`flex items-center justify-between px-4 py-3 ${i < carrito.length - 1 ? 'border-b border-[#2A2420]' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[#9C8E7E] font-mono text-sm w-5 text-center">{item.cantidad}×</span>
                <span className="text-[#F6F1E7]">{item.producto.nombre}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#D8CDB6] text-sm">{(item.producto.precio * item.cantidad).toFixed(2)} €</span>
                <button onClick={() => cambiar(item.producto.id, -1)} className="text-[#4A3F35] text-lg">✕</button>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 border-t border-[#2A2420] flex justify-between">
            <span className="font-bold text-[#F6F1E7]">Total</span>
            <span className="font-bold text-[#D9442B] text-lg">{total.toFixed(2)} €</span>
          </div>
        </div>

        {error && (
          <p className="text-[#D9442B] text-sm text-center bg-[#D9442B15] rounded-xl py-3 px-4">{error}</p>
        )}
      </div>

      <div className="sticky bottom-0 p-4 bg-[#14110E] border-t border-[#2A2420]">
        <button
          onClick={enviar}
          disabled={enviando}
          className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all"
          style={{ backgroundColor: enviando ? '#4A3F35' : '#D9442B' }}
        >
          {enviando ? 'Enviando a cocina...' : '🍳 Enviar a cocina'}
        </button>
      </div>
    </div>
  )
}
