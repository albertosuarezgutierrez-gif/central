'use client'
import { useState, useEffect } from 'react'

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador', color: '#64748b', bg: '#f1f5f9' },
  emitida:  { label: 'Emitida',  color: '#2563eb', bg: '#eff6ff' },
  pagada:   { label: 'Pagada',   color: '#16a34a', bg: '#f0fdf4' },
  vencida:  { label: 'Vencida',  color: '#dc2626', bg: '#fef2f2' },
}

const SIGUIENTE_ESTADO: Record<string, string> = {
  borrador: 'emitida', emitida: 'pagada'
}
const ACCION_LABEL: Record<string, string> = {
  borrador: '📤 Emitir', emitida: '✓ Marcar pagada'
}

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

interface Props {
  facturas: any[]
  clientes: any[]
  resumen: any[]
}

export default function FacturasClient({ facturas: init, clientes, resumen }: Props) {
  const [facturas, setFacturas]     = useState<any[]>(init)
  const [filtroEstado, setFiltro]   = useState('')
  const [filtroCliente, setFiltroC] = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [detalle, setDetalle]       = useState<any>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // Form nueva factura
  const [form, setForm] = useState({
    cliente_id: '', periodo_desde: PRIMER_DIA_MES, periodo_hasta: HOY,
    concepto: 'Servicios de limpieza', iva_porcentaje: '21',
    auto_generar: true,
    lineas: [{ descripcion: '', cantidad: '1', precio_unitario: '', propiedad_id: '' }]
  })

  const filtered = facturas.filter(f => {
    const matchE = !filtroEstado  || f.estado     === filtroEstado
    const matchC = !filtroCliente || f.cliente_id === filtroCliente
    return matchE && matchC
  })

  const totalPendiente = facturas
    .filter(f => f.estado === 'emitida')
    .reduce((acc, f) => acc + Number(f.total || 0), 0)

  const totalCobrado = facturas
    .filter(f => f.estado === 'pagada')
    .reduce((acc, f) => acc + Number(f.total || 0), 0)

  async function verDetalle(f: any) {
    setDetalle({ ...f, loading: true })
    const res  = await fetch('/api/admin/facturas-clientes/' + f.id)
    const data = await res.json()
    setDetalle(data)
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    const res  = await fetch('/api/admin/facturas-clientes/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    })
    const data = await res.json()
    if (res.ok) {
      setFacturas(fs => fs.map(f => f.id === id ? { ...f, ...data.factura } : f))
      if (detalle?.factura?.id === id) setDetalle((d: any) => ({ ...d, factura: data.factura }))
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este borrador?')) return
    const res = await fetch('/api/admin/facturas-clientes/' + id, { method: 'DELETE' })
    if (res.ok) {
      setFacturas(fs => fs.filter(f => f.id !== id))
      setDetalle(null)
    }
  }

  async function crearFactura(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const body = {
        cliente_id:      form.cliente_id,
        periodo_desde:   form.periodo_desde,
        periodo_hasta:   form.periodo_hasta,
        concepto:        form.concepto,
        iva_porcentaje:  Number(form.iva_porcentaje),
        auto_generar:    form.auto_generar,
        lineas: form.auto_generar ? [] : form.lineas
          .filter(l => l.descripcion)
          .map(l => ({ ...l, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario), propiedad_id: l.propiedad_id || null }))
      }
      const res  = await fetch('/api/admin/facturas-clientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      const clienteNombre = clientes.find(c => c.id === form.cliente_id)?.nombre || ''
      setFacturas(fs => [{ ...data.factura, cliente_nombre: clienteNombre }, ...fs])
      setShowModal(false)
    } catch { setError('Error de conexión') }
    finally   { setLoading(false) }
  }

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  // Pisos del cliente seleccionado (para imputar cada línea a su piso)
  const [propsCliente, setPropsCliente] = useState<any[]>([])
  useEffect(() => {
    if (!form.cliente_id) { setPropsCliente([]); return }
    let cancel = false
    fetch('/api/admin/propiedades?cliente_id=' + form.cliente_id)
      .then(r => r.json())
      .then(d => { if (!cancel) setPropsCliente(d?.propiedades || []) })
      .catch(() => { if (!cancel) setPropsCliente([]) })
    return () => { cancel = true }
  }, [form.cliente_id])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-indigo-200 hover:text-white text-sm">← Dashboard</a>
          <h1 className="font-bold text-lg">Facturación</h1>
        </div>
        <button onClick={() => { setShowModal(true); setError('') }}
          className="bg-white text-indigo-600 font-semibold text-sm px-3 py-1.5 rounded-lg">
          + Nueva
        </button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Pendiente de cobro</p>
          <p className="text-2xl font-bold text-blue-600">{totalPendiente.toFixed(2)} €</p>
          <p className="text-xs text-gray-400 mt-0.5">{facturas.filter(f=>f.estado==='emitida').length} facturas emitidas</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Cobrado este año</p>
          <p className="text-2xl font-bold text-green-600">{totalCobrado.toFixed(2)} €</p>
          <p className="text-xs text-gray-400 mt-0.5">{facturas.filter(f=>f.estado==='pagada').length} facturas pagadas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-4 space-y-2 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['', 'borrador', 'emitida', 'pagada', 'vencida'].map(e => {
            const cfg = e ? ESTADO_CONFIG[e] : null
            return (
              <button key={e} onClick={() => setFiltro(e)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                style={{
                  borderColor: filtroEstado === e ? (cfg?.color || '#6366f1') : '#e5e7eb',
                  background:  filtroEstado === e ? (cfg?.bg || '#eef2ff')    : 'white',
                  color:       filtroEstado === e ? (cfg?.color || '#6366f1') : '#6b7280'
                }}>
                {e ? cfg?.label : 'Todas'}
              </button>
            )
          })}
        </div>
        <select value={filtroCliente} onChange={e => setFiltroC(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">— Todos los clientes —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="px-4 space-y-3 pb-24">
        {filtered.length === 0 && (
          <div className="text-center py-14 text-gray-400">
            <div className="text-4xl mb-2">🧾</div>
            <p>Sin facturas</p>
            <button onClick={() => setShowModal(true)} className="mt-2 text-indigo-600 text-sm underline">
              Crear primera factura →
            </button>
          </div>
        )}
        {filtered.map(f => {
          const cfg = ESTADO_CONFIG[f.estado] || ESTADO_CONFIG.borrador
          return (
            <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800 text-sm">{f.numero_factura}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 truncate">👥 {f.cliente_nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {f.periodo_desde} → {f.periodo_hasta}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-800">{Number(f.total || 0).toFixed(2)} €</p>
                  <p className="text-xs text-gray-400">+IVA {f.iva_porcentaje}%</p>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button onClick={() => verDetalle(f)}
                  className="flex-1 text-xs border border-gray-200 rounded-lg py-1.5 text-gray-600 hover:bg-gray-50">
                  Ver detalle
                </button>
                {SIGUIENTE_ESTADO[f.estado] && (
                  <button onClick={() => cambiarEstado(f.id, SIGUIENTE_ESTADO[f.estado])}
                    className="flex-1 text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-medium hover:bg-indigo-700">
                    {ACCION_LABEL[f.estado]}
                  </button>
                )}
                {f.estado === 'borrador' && (
                  <button onClick={() => eliminar(f.id)}
                    className="text-xs border border-red-200 text-red-400 rounded-lg px-3 py-1.5 hover:bg-red-50">
                    🗑
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal crear factura */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Nueva factura</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-2xl">✕</button>
            </div>
            <form onSubmit={crearFactura} className="p-5 space-y-4">

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Cliente *</label>
                <select value={form.cliente_id} onChange={e => f('cliente_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required>
                  <option value="">— Seleccionar cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Desde *</label>
                  <input type="date" value={form.periodo_desde}
                    onChange={e => f('periodo_desde', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Hasta *</label>
                  <input type="date" value={form.periodo_hasta}
                    onChange={e => f('periodo_hasta', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Concepto</label>
                <input value={form.concepto} onChange={e => f('concepto', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">IVA %</label>
                <select value={form.iva_porcentaje} onChange={e => f('iva_porcentaje', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="21">21% (general)</option>
                  <option value="10">10% (reducido)</option>
                  <option value="0">0% (exento)</option>
                </select>
              </div>

              {/* Modo de líneas */}
              <div className="bg-gray-50 rounded-xl p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.auto_generar}
                    onChange={e => f('auto_generar', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded" />
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Auto-generar líneas</p>
                    <p className="text-xs text-gray-400">Desde las sesiones completadas del período</p>
                  </div>
                </label>
              </div>

              {!form.auto_generar && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Líneas</label>
                  {form.lineas.map((linea, i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                      <input value={linea.descripcion}
                        onChange={e => { const l = [...form.lineas]; l[i].descripcion = e.target.value; f('lineas', l) }}
                        placeholder="Descripción"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <select value={linea.propiedad_id || ''}
                        onChange={e => { const l = [...form.lineas]; l[i].propiedad_id = e.target.value; f('lineas', l) }}
                        className="w-32 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">— piso —</option>
                        {propsCliente.map((p:any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <input type="number" value={linea.cantidad}
                        onChange={e => { const l = [...form.lineas]; l[i].cantidad = e.target.value; f('lineas', l) }}
                        placeholder="Ud"
                        className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <input type="number" value={linea.precio_unitario}
                        onChange={e => { const l = [...form.lineas]; l[i].precio_unitario = e.target.value; f('lineas', l) }}
                        placeholder="€"
                        className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      {form.lineas.length > 1 && (
                        <button type="button" onClick={() => f('lineas', form.lineas.filter((_, j) => j !== i))}
                          className="text-red-400 text-lg">×</button>
                      )}
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => f('lineas', [...form.lineas, { descripcion: '', cantidad: '1', precio_unitario: '', propiedad_id: '' }])}
                    className="text-indigo-600 text-sm underline">+ Añadir línea</button>
                </div>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                  {loading ? 'Creando…' : '🧾 Crear factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">{detalle.factura?.numero_factura}</h2>
                <p className="text-xs text-gray-400">{detalle.factura?.cliente_nombre}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 text-2xl">✕</button>
            </div>
            {detalle.loading ? (
              <div className="p-8 text-center text-gray-400">Cargando…</div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Período</span>
                    <span className="font-medium">{detalle.factura?.periodo_desde} → {detalle.factura?.periodo_hasta}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Base imponible</span>
                    <span className="font-medium">{Number(detalle.factura?.base_imponible||0).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">IVA {detalle.factura?.iva_porcentaje}%</span>
                    <span className="font-medium">{Number(detalle.factura?.iva_importe||0).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-bold text-gray-700">Total</span>
                    <span className="font-bold text-xl text-indigo-600">{Number(detalle.factura?.total||0).toFixed(2)} €</span>
                  </div>
                </div>

                {detalle.lineas?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Líneas</p>
                    <div className="space-y-1.5">
                      {detalle.lineas.map((l: any) => (
                        <div key={l.id} className="flex justify-between text-sm">
                          <span className="text-gray-600 flex-1 pr-2">{l.descripcion}</span>
                          <span className="text-gray-400 text-xs">{l.cantidad}×{Number(l.precio_unitario).toFixed(2)}</span>
                          <span className="font-medium text-gray-700 ml-2 w-20 text-right">{Number(l.importe).toFixed(2)} €</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {SIGUIENTE_ESTADO[detalle.factura?.estado] && (
                    <button
                      onClick={() => cambiarEstado(detalle.factura.id, SIGUIENTE_ESTADO[detalle.factura.estado])}
                      className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold">
                      {ACCION_LABEL[detalle.factura?.estado]}
                    </button>
                  )}
                  {detalle.factura?.estado === 'borrador' && (
                    <button onClick={() => eliminar(detalle.factura.id)}
                      className="border border-red-200 text-red-400 px-4 py-2.5 rounded-xl text-sm">
                      Eliminar
                    </button>
                  )}
                  <button onClick={() => setDetalle(null)}
                    className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm">
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
