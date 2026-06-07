'use client'
// ============================================================
// /tienda — TPV de tienda (vertical retail). Buscar/escanear EAN → carrito → cobrar.
// Reutiliza CobrarSheet (cobro/VeriFactu/caja/ticket del núcleo).
// ============================================================
import { useAuth } from '@/hooks/useAuth'
import { C, SN, SM, SE } from '@/lib/colors'
import { useCallback, useEffect, useRef, useState } from 'react'
import CobrarSheet from '@/components/edge/CobrarSheet'

interface Producto {
  id: string
  nombre: string
  precio: number | null
  categoria: string | null
  ean_codigo: string | null
  venta_por_peso: boolean | null
  precio_por_kg: number | null
  stock_actual: number | null
}
interface LineaCarrito {
  key: string
  producto_id: string | null
  nombre: string
  precio_unitario: number
  cantidad: number
}

export default function TiendaPage() {
  const { session, checking } = useAuth(['tienda'])
  const [catalogo, setCatalogo] = useState<Producto[]>([])
  const [resultados, setResultados] = useState<Producto[] | null>(null)
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cobro, setCobro] = useState<{ comandaId: string; total: number } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const sh = useCallback(
    (): Record<string, string> => ({
      'Content-Type': 'application/json',
      'x-ia-session': session ? JSON.stringify(session) : '',
    }),
    [session]
  )

  // Catálogo inicial
  useEffect(() => {
    if (!session) return
    fetch('/api/tienda/buscar', { headers: sh() })
      .then(r => r.json())
      .then(d => setCatalogo(d.productos ?? []))
      .catch(() => {})
  }, [session, sh])

  // Mantener el input enfocado (captura lector USB)
  useEffect(() => {
    if (!cobro) inputRef.current?.focus()
  }, [cobro, resultados, carrito])

  const addProducto = (p: Producto) => {
    if (p.venta_por_peso && p.precio_por_kg) {
      const kgStr = window.prompt(`Peso en kg de "${p.nombre}" (${p.precio_por_kg} €/kg):`, '1')
      if (!kgStr) return
      const kg = parseFloat(kgStr.replace(',', '.'))
      if (!kg || kg <= 0) return
      const precio = Math.round(p.precio_por_kg * kg * 100) / 100
      setCarrito(c => [
        ...c,
        { key: `${p.id}-${Date.now()}`, producto_id: p.id, nombre: `${p.nombre} · ${kg} kg`, precio_unitario: precio, cantidad: 1 },
      ])
    } else {
      const precio = Number(p.precio ?? 0)
      setCarrito(c => {
        const i = c.findIndex(l => l.producto_id === p.id && !l.nombre.includes(' · '))
        if (i >= 0) {
          const copy = [...c]; copy[i] = { ...copy[i], cantidad: copy[i].cantidad + 1 }; return copy
        }
        return [...c, { key: `${p.id}-${Date.now()}`, producto_id: p.id, nombre: p.nombre, precio_unitario: precio, cantidad: 1 }]
      })
    }
    setResultados(null); setBusqueda('')
  }

  const buscar = async () => {
    const term = busqueda.trim()
    if (!term) { setResultados(null); return }
    const esEan = /^\d{6,}$/.test(term)
    const url = esEan ? `/api/tienda/buscar?ean=${encodeURIComponent(term)}` : `/api/tienda/buscar?q=${encodeURIComponent(term)}`
    const d = await fetch(url, { headers: sh() }).then(r => r.json()).catch(() => ({ productos: [] }))
    const prods: Producto[] = d.productos ?? []
    if (esEan && prods.length === 1) { addProducto(prods[0]); return }
    if (prods.length === 0) { setAviso(`Sin resultados para "${term}"`); setTimeout(() => setAviso(null), 2000); return }
    setResultados(prods)
  }

  const incLinea = (key: string, delta: number) =>
    setCarrito(c => c.flatMap(l => {
      if (l.key !== key) return [l]
      const n = l.cantidad + delta
      return n <= 0 ? [] : [{ ...l, cantidad: n }]
    }))
  const quitarLinea = (key: string) => setCarrito(c => c.filter(l => l.key !== key))

  const total = Math.round(carrito.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0) * 100) / 100

  const cobrar = async () => {
    if (carrito.length === 0 || cargando) return
    setCargando(true)
    try {
      const d = await fetch('/api/tienda/venta', {
        method: 'POST', headers: sh(),
        body: JSON.stringify({ items: carrito.map(l => ({ producto_id: l.producto_id, nombre: l.nombre, cantidad: l.cantidad, precio_unitario: l.precio_unitario })) }),
      }).then(r => r.json())
      if (d.error || !d.comanda_id) { setAviso(d.error ?? 'Error creando la venta'); setTimeout(() => setAviso(null), 3000); return }
      setCobro({ comandaId: d.comanda_id, total: d.total ?? total })
    } finally {
      setCargando(false)
    }
  }

  if (checking || !session) {
    return <div style={{ minHeight: '100vh', background: C.dark, color: C.darkFg3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SN }}>Cargando…</div>
  }

  const grid = resultados ?? catalogo

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.darkFg, fontFamily: SN, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '14px 20px', borderBottom: `1px solid ${C.darkRule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 600 }}>Tienda <span style={{ color: C.darkFg3, fontSize: 14 }}>· {session.restaurante_nombre}</span></div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.darkFg3 }}>{session.nombre}</div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 0 }}>
        {/* Columna catálogo / búsqueda */}
        <div style={{ flex: '1 1 360px', padding: 16, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              ref={inputRef}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscar() }}
              placeholder="Escanear código de barras o buscar producto…"
              style={{ flex: 1, background: C.dark1, border: `1px solid ${C.darkRule}`, borderRadius: 10, padding: '12px 14px', color: C.darkFg, fontFamily: SN, fontSize: 15, outline: 'none' }}
            />
            <button onClick={buscar} style={{ background: C.dark2, border: 'none', borderRadius: 10, color: C.darkFg, padding: '0 18px', cursor: 'pointer', fontFamily: SN, fontWeight: 600 }}>Buscar</button>
            {resultados && <button onClick={() => { setResultados(null); setBusqueda('') }} style={{ background: 'transparent', border: `1px solid ${C.darkRule}`, borderRadius: 10, color: C.darkFg3, padding: '0 14px', cursor: 'pointer' }}>✕</button>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, overflowY: 'auto', alignContent: 'start' }}>
            {grid.map(p => (
              <button key={p.id} onClick={() => addProducto(p)}
                style={{ background: C.dark1, border: `1px solid ${C.darkRule}`, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer', color: C.darkFg, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 84 }}>
                <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{p.nombre}</span>
                <span style={{ fontFamily: SM, fontSize: 15, color: C.green, marginTop: 'auto' }}>
                  {p.venta_por_peso && p.precio_por_kg ? `${p.precio_por_kg.toFixed(2).replace('.', ',')} €/kg` : `${Number(p.precio ?? 0).toFixed(2).replace('.', ',')} €`}
                </span>
                {p.stock_actual != null && <span style={{ fontFamily: SN, fontSize: 11, color: p.stock_actual <= 0 ? C.red : C.darkFg3 }}>stock {p.stock_actual}</span>}
              </button>
            ))}
            {grid.length === 0 && <div style={{ color: C.darkFg3, fontFamily: SN, padding: 20 }}>Sin productos. Añádelos en la carta del propietario.</div>}
          </div>
        </div>

        {/* Columna carrito */}
        <div style={{ flex: '1 1 300px', maxWidth: 420, borderLeft: `1px solid ${C.darkRule}`, padding: 16, display: 'flex', flexDirection: 'column', background: C.dark1 }}>
          <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.darkFg3, marginBottom: 10 }}>Carrito</div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {carrito.length === 0 && <div style={{ color: C.darkFg3, fontFamily: SN, marginTop: 8 }}>Vacío — escanea o toca un producto.</div>}
            {carrito.map(l => (
              <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.dark2, borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nombre}</div>
                  <div style={{ fontFamily: SM, fontSize: 12, color: C.darkFg3 }}>{l.precio_unitario.toFixed(2).replace('.', ',')} € · {(l.precio_unitario * l.cantidad).toFixed(2).replace('.', ',')} €</div>
                </div>
                <button onClick={() => incLinea(l.key, -1)} style={btnQty}>−</button>
                <span style={{ fontFamily: SM, fontSize: 15, minWidth: 22, textAlign: 'center' }}>{l.cantidad}</span>
                <button onClick={() => incLinea(l.key, 1)} style={btnQty}>+</button>
                <button onClick={() => quitarLinea(l.key)} style={{ ...btnQty, color: C.red }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${C.darkRule}`, marginTop: 10, paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <span style={{ fontFamily: SN, fontSize: 13, color: C.darkFg3 }}>TOTAL</span>
              <span style={{ fontFamily: SM, fontSize: 30, fontWeight: 700 }}>{total.toFixed(2).replace('.', ',')} €</span>
            </div>
            <button onClick={cobrar} disabled={carrito.length === 0 || cargando}
              style={{ width: '100%', background: carrito.length === 0 ? C.dark2 : C.green, color: C.darkFg, border: 'none', borderRadius: 12, padding: '16px 0', fontFamily: SN, fontSize: 17, fontWeight: 700, cursor: carrito.length === 0 ? 'default' : 'pointer', opacity: cargando ? 0.6 : 1 }}>
              {cargando ? 'Creando…' : 'COBRAR'}
            </button>
          </div>
        </div>
      </div>

      {aviso && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.red, color: C.paper, padding: '10px 18px', borderRadius: 10, fontFamily: SN, fontSize: 14, zIndex: 50 }}>{aviso}</div>}

      {cobro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 520 }}>
            <CobrarSheet
              comandaId={cobro.comandaId}
              mesaLabel="Tienda"
              total={cobro.total}
              session={{ id: session.id, nombre: session.nombre, rol: session.rol }}
              onCerrado={() => { setCobro(null); setCarrito([]); setAviso('✓ Venta cobrada'); setTimeout(() => setAviso(null), 2000) }}
              onCancel={() => setCobro(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const btnQty: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${C.darkRule}`, borderRadius: 8,
  color: C.darkFg, width: 30, height: 30, cursor: 'pointer', fontFamily: SM, fontSize: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
