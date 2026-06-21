'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
}

interface Producto {
  id: string
  nombre: string
  categoria: string
  unidad: string
  stock_actual: number
  precio_unitario: number | null
}

interface ConsumoLinea {
  producto_id: string
  cantidad: number
  notas?: string
}

interface Props {
  sessionId: string
  limpadoraId?: string
  onGuardado?: () => void
  onSaltar?: () => void
}

// Cantidades sugeridas por defecto (limpiadora puede ajustar)
const SUGERIDOS: Record<string, number> = {
  'Papel higiénico': 2,
  'Jabón de manos': 1,
  'Champú': 1,
  'Gel de ducha': 1,
  'Bolsas de basura': 2,
}

export default function ConsumoProductos({ sessionId, limpadoraId, onGuardado, onSaltar }: Props) {
  const [productos, setProductos]   = useState<Producto[]>([])
  const [lineas, setLineas]         = useState<Record<string, number>>({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [guardado, setGuardado]     = useState(false)

  useEffect(() => {
    fetch(`/api/l/consumo?session_id=${sessionId}`)
      .then(r => r.json())
      .then(d => {
        setProductos(d.productos || [])
        // Precargar consumos ya guardados
        const inicial: Record<string, number> = {}
        if (d.consumos?.length) {
          for (const c of d.consumos) {
            inicial[c.producto_id] = Number(c.cantidad)
          }
        }
        // Sugeridos por nombre si no hay datos previos
        if (!d.consumos?.length) {
          for (const p of (d.productos || [])) {
            const sug = SUGERIDOS[p.nombre]
            if (sug) inicial[p.id] = sug
          }
        }
        setLineas(inicial)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sessionId])

  function setQty(productoId: string, qty: number) {
    setLineas(prev => ({ ...prev, [productoId]: Math.max(0, qty) }))
  }

  async function guardar() {
    setSaving(true)
    const lineasArr: ConsumoLinea[] = Object.entries(lineas)
      .filter(([, qty]) => qty > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))

    await fetch('/api/l/consumo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, lineas: lineasArr, limpiadora_id: limpadoraId })
    })

    setGuardado(true)
    setSaving(false)
    onGuardado?.()
  }

  const hayProductosUsados = Object.values(lineas).some(v => v > 0)
  const categorias = [...new Set(productos.map(p => p.categoria))]

  if (loading) {
    return (
      <div style={{ padding: '20px 16px', textAlign: 'center', color: C.muted }}>
        Cargando productos...
      </div>
    )
  }

  if (guardado) {
    return (
      <div style={{ padding: '20px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.ok }}>Consumo registrado</div>
      </div>
    )
  }

  if (!productos.length) {
    return (
      <div style={{ padding: '16px', background: C.light, borderRadius: 12, margin: '0 16px' }}>
        <div style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>
          No hay productos en el stock. El administrador debe añadirlos en <strong>Stock y materiales</strong>.
        </div>
        <button onClick={onSaltar} style={{ marginTop: 12, width: '100%', padding: '10px', background: C.border, border: 'none', borderRadius: 8, fontSize: 13, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
          Omitir este paso
        </button>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.light, borderRadius: 12, padding: '14px 16px', margin: '0 16px 16px', border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 4 }}>
          🧴 Productos usados en esta limpieza
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          Ajusta las cantidades a lo que realmente has utilizado. Puedes poner 0 si no lo usaste.
        </div>
      </div>

      {/* Productos por categoría */}
      {categorias.map(cat => {
        const prods = productos.filter(p => p.categoria === cat)
        return (
          <div key={cat} style={{ margin: '0 16px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {cat === 'limpieza' ? '🧴 Limpieza' : cat === 'consumible' ? '🧻 Consumibles' : cat === 'lenceria' ? '🛏️ Lencería' : cat}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {prods.map(p => {
                const qty = lineas[p.id] ?? 0
                return (
                  <div key={p.id} style={{
                    background: 'white', borderRadius: 10, padding: '12px 14px',
                    border: `1px solid ${qty > 0 ? C.brand : C.border}`,
                    borderLeft: `3px solid ${qty > 0 ? C.brand : C.border}`,
                    display: 'flex', alignItems: 'center', gap: 12
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        Unidad: {p.unidad}
                        {p.stock_actual !== undefined ? ` · Stock: ${p.stock_actual}` : ''}
                      </div>
                    </div>
                    {/* Stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setQty(p.id, qty - 1)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: 'inherit' }}
                      >−</button>
                      <span style={{ width: 28, textAlign: 'center', fontWeight: 700, fontSize: 16, color: qty > 0 ? C.primary : C.muted }}>
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(p.id, qty + 1)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.brand}`, background: C.light, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontFamily: 'inherit' }}
                      >+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Acciones */}
      <div style={{ padding: '0 16px 24px', display: 'flex', gap: 10 }}>
        <button
          onClick={onSaltar}
          style={{ flex: 1, padding: '12px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
        >
          Omitir
        </button>
        <button
          onClick={guardar}
          disabled={saving || !hayProductosUsados}
          style={{
            flex: 2, padding: '12px', background: hayProductosUsados ? C.primary : C.border,
            border: 'none', borderRadius: 10, fontSize: 14, color: hayProductosUsados ? 'white' : C.muted,
            cursor: hayProductosUsados ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 700
          }}
        >
          {saving ? 'Guardando...' : '✔ Guardar consumo'}
        </button>
      </div>
    </div>
  )
}
