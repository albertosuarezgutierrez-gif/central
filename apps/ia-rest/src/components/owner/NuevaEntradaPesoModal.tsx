'use client'
import { useState, useEffect } from 'react'
import { C, SN, SM } from '@/lib/colors'

interface Producto { id: string; nombre: string; precio_por_kg: number | null; venta_por_peso: boolean }

interface Props {
  restauranteId: string
  onClose: () => void
  onGuardado: () => void
}

export default function NuevaEntradaPesoModal({ restauranteId, onClose, onGuardado }: Props) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Formulario
  const [tipoEntrada, setTipoEntrada] = useState<'spot'|'pedido'>('spot')
  const [modoCantidad, setModoCantidad] = useState<'unidades'|'peso_kg'>('peso_kg')
  const [busqueda, setBusqueda] = useState('')
  const [productoId, setProductoId] = useState('')
  const [nombreLibre, setNombreLibre] = useState('')
  const [usoProducto, setUsoProducto] = useState<'venta_directa'|'ingrediente'|'dual'>('venta_directa')
  const [cantidadKg, setCantidadKg] = useState('')
  const [numPiezas, setNumPiezas] = useState('')
  const [precioCompraKg, setPrecioCompraKg] = useState('')
  const [precioVentaKg, setPrecioVentaKg] = useState('')
  const [proveedorLibre, setProveedorLibre] = useState('')
  const [lote, setLote] = useState('')
  const [fechaCaducidad, setFechaCaducidad] = useState('')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    fetch('/api/carta')
      .then(r => r.json())
      .then(d => setProductos((d.productos ?? []).filter((p: { nombre: string }) => p.nombre)))
      .catch(() => {})
  }, [])

  const margen = precioCompraKg && precioVentaKg
    ? (((Number(precioVentaKg) - Number(precioCompraKg)) / Number(precioVentaKg)) * 100).toFixed(1)
    : null

  const stockTras = productoId
    ? null // Se calcularía con v_stock_actual, simplificamos
    : null

  const productosFiltrados = busqueda.length > 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : []

  const seleccionarProducto = (p: Producto) => {
    setProductoId(p.id)
    setBusqueda(p.nombre)
    setNombreLibre('')
    if (p.precio_por_kg) setPrecioVentaKg(String(p.precio_por_kg))
    if (p.venta_por_peso) setModoCantidad('peso_kg')
  }

  const guardar = async () => {
    if (!cantidadKg || Number(cantidadKg) <= 0) { setErr('Introduce el peso recibido'); return }
    if (!productoId && !nombreLibre) { setErr('Indica el producto'); return }
    setLoading(true)
    setErr('')
    try {
      // Si hay producto nuevo con uso → actualizar uso_producto
      if (productoId && usoProducto !== 'venta_directa') {
        await fetch(`/api/carta/producto/${productoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uso_producto: usoProducto }),
        }).catch(() => {})
      }

      const res = await fetch('/api/almacen/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_entrada: tipoEntrada,
          modo_cantidad: modoCantidad,
          producto_id: productoId || undefined,
          nombre_libre: !productoId ? (busqueda || nombreLibre) : undefined,
          cantidad_kg: modoCantidad === 'peso_kg' ? Number(cantidadKg) : undefined,
          num_piezas: numPiezas ? Number(numPiezas) : undefined,
          precio_compra_kg: precioCompraKg ? Number(precioCompraKg) : undefined,
          precio_venta_kg: precioVentaKg ? Number(precioVentaKg) : undefined,
          proveedor_libre: proveedorLibre || undefined,
          lote: lote || undefined,
          fecha_caducidad: fechaCaducidad || undefined,
          notas: notas || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      onGuardado()
    } catch(e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const sh = (extra?: object) => ({
    padding: '10px 12px', borderRadius: 6, background: C.paper2,
    border: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 13, color: C.ink,
    width: '100%', outline: 'none', boxSizing: 'border-box' as const,
    ...extra,
  })

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:C.paper, borderRadius:12, width:'100%', maxWidth:460, maxHeight:'90vh', overflowY:'auto', border:`1px solid ${C.rule}` }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.rule}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:SM, fontWeight:700, fontSize:15, color:C.ink }}>Nueva entrada de mercancía</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:C.ink3, fontSize:20 }}>×</button>
        </div>

        <div style={{ padding:'20px' }}>
          {/* Tipo entrada */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Tipo de entrada</label>
            <div style={{ display:'flex', gap:8 }}>
              {(['spot','pedido'] as const).map(t => (
                <button key={t} onClick={() => setTipoEntrada(t)} style={{
                  flex:1, padding:'8px', borderRadius:6, fontFamily:SM, fontSize:12, fontWeight:700,
                  background: tipoEntrada===t ? C.red : C.paper2,
                  border: `1px solid ${tipoEntrada===t ? C.red : C.rule}`,
                  color: tipoEntrada===t ? '#fff' : C.ink3, cursor:'pointer',
                }}>
                  {t === 'spot' ? '🐟 Spot (sin pedido)' : '📋 Desde pedido'}
                </button>
              ))}
            </div>
          </div>

          {/* Producto */}
          <div style={{ marginBottom:16, position:'relative' }}>
            <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Producto</label>
            <input
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setProductoId('') }}
              placeholder="Buscar en carta o nombre libre..."
              style={sh()}
            />
            {productosFiltrados.length > 0 && !productoId && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:C.paper, border:`1px solid ${C.rule}`, borderRadius:6, zIndex:10, maxHeight:160, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,.1)' }}>
                {productosFiltrados.map(p => (
                  <div key={p.id} onClick={() => seleccionarProducto(p)}
                    style={{ padding:'10px 12px', cursor:'pointer', fontFamily:SN, fontSize:13, color:C.ink, borderBottom:`1px solid ${C.rule}` }}>
                    {p.nombre}
                    {p.venta_por_peso && <span style={{ marginLeft:6, fontSize:10, color:C.red, fontWeight:700 }}>⚖ KG</span>}
                  </div>
                ))}
              </div>
            )}
            {productoId && (
              <div style={{ marginTop:8 }}>
                <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Uso del producto</label>
                <div style={{ display:'flex', gap:6 }}>
                  {([['venta_directa','Venta directa'],['ingrediente','Ingrediente'],['dual','Dual']] as const).map(([v,l]) => (
                    <button key={v} onClick={() => setUsoProducto(v)} style={{
                      flex:1, padding:'6px 4px', borderRadius:4, fontFamily:SM, fontSize:10, fontWeight:700,
                      background: usoProducto===v ? C.red : C.paper2,
                      border: `1px solid ${usoProducto===v ? C.red : C.rule}`,
                      color: usoProducto===v ? '#fff' : C.ink3, cursor:'pointer',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modo cantidad */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Tipo de medida</label>
            <div style={{ display:'flex', gap:8 }}>
              {([['unidades','📦 Unidades'],['peso_kg','⚖ Por peso (kg)']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setModoCantidad(v)} style={{
                  flex:1, padding:'8px', borderRadius:6, fontFamily:SM, fontSize:12, fontWeight:700,
                  background: modoCantidad===v ? C.red : C.paper2,
                  border: `1px solid ${modoCantidad===v ? C.red : C.rule}`,
                  color: modoCantidad===v ? '#fff' : C.ink3, cursor:'pointer',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Cantidad / peso */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div>
              <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>
                {modoCantidad === 'peso_kg' ? 'Peso recibido (kg)' : 'Cantidad (unidades)'}
              </label>
              <input type="number" step="0.001" min="0"
                value={cantidadKg} onChange={e => setCantidadKg(e.target.value)}
                placeholder={modoCantidad === 'peso_kg' ? '4.600' : '12'}
                style={sh()}
              />
            </div>
            {modoCantidad === 'peso_kg' && (
              <div>
                <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Nº piezas (opcional)</label>
                <input type="number" min="1"
                  value={numPiezas} onChange={e => setNumPiezas(e.target.value)}
                  placeholder="2"
                  style={sh()}
                />
              </div>
            )}
          </div>

          {/* Precios */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:8 }}>
            <div>
              <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>
                Precio compra ({modoCantidad === 'peso_kg' ? '€/kg' : '€/ud'})
              </label>
              <input type="number" step="0.01" min="0"
                value={precioCompraKg} onChange={e => setPrecioCompraKg(e.target.value)}
                placeholder="13.00"
                style={sh()}
              />
            </div>
            <div>
              <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>
                Precio venta ({modoCantidad === 'peso_kg' ? '€/kg' : '€/ud'})
              </label>
              <input type="number" step="0.01" min="0"
                value={precioVentaKg} onChange={e => setPrecioVentaKg(e.target.value)}
                placeholder="15.00"
                style={sh()}
              />
            </div>
          </div>

          {/* Margen calculado */}
          {margen && (
            <div style={{ marginBottom:16, padding:'8px 12px', background: Number(margen) > 20 ? 'rgba(63,125,68,.1)' : 'rgba(232,163,59,.1)', borderRadius:6, border:`1px solid ${Number(margen) > 20 ? 'rgba(63,125,68,.3)' : 'rgba(232,163,59,.3)'}` }}>
              <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, color: Number(margen) > 20 ? '#3F7D44' : '#E8A33B' }}>
                Margen: {margen}%
                {cantidadKg && precioCompraKg && precioVentaKg && (
                  <span style={{ fontWeight:400, marginLeft:8, color:C.ink3 }}>
                    · Coste total: {(Number(cantidadKg) * Number(precioCompraKg)).toFixed(2)} €
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Proveedor + lote */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Proveedor</label>
            <input value={proveedorLibre} onChange={e => setProveedorLibre(e.target.value)}
              placeholder="Juan el pescadero, Mercamadrid..."
              style={sh()}
            />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Lote</label>
              <input value={lote} onChange={e => setLote(e.target.value)} placeholder="L2405-22" style={sh()} />
            </div>
            <div>
              <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Caduca</label>
              <input type="date" value={fechaCaducidad} onChange={e => setFechaCaducidad(e.target.value)} style={sh()} />
            </div>
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 }}>Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="2 lubinas frescas, buen estado..." style={sh()} />
          </div>

          {err && <div style={{ marginBottom:12, padding:'8px 12px', background:'rgba(217,68,43,.1)', border:'1px solid rgba(217,68,43,.3)', borderRadius:6, fontFamily:SN, fontSize:12, color:C.red }}>{err}</div>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
            <button onClick={onClose} style={{ padding:'12px', borderRadius:8, fontFamily:SM, fontSize:13, fontWeight:700, background:'transparent', border:`1px solid ${C.rule}`, color:C.ink3, cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={loading} style={{ padding:'12px', borderRadius:8, fontFamily:SM, fontSize:14, fontWeight:700, background:C.red, border:'none', color:'#fff', cursor:'pointer', opacity:loading?.6:1 }}>
              {loading ? 'Guardando…' : 'Guardar entrada'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
