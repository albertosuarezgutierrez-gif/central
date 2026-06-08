'use client'
import { useState, useEffect, useRef } from 'react'

const TIPOS_SERVICIO_DEFAULT = [
  { id: 'rotacion',      label: 'Rotación',      emoji: '🔄', icon: '🔄', desc: 'Entre huéspedes' },
  { id: 'profunda',      label: 'Profunda',       emoji: '🧽', icon: '🧽', desc: 'Limpieza a fondo' },
  { id: 'comunidad',     label: 'Comunidad',      emoji: '🏢', icon: '🏢', desc: 'Zonas comunes' },
  { id: 'obra',          label: 'Final obra',     emoji: '🏗️', icon: '🏗️', desc: 'Post-construcción' },
  { id: 'mantenimiento', label: 'Mantenimiento',  emoji: '🔧', icon: '🔧', desc: 'Revisión y orden' },
]

interface Props {
  clientes: any[]
  limpiadoras: any[]
  onCreada: (sesion: any) => void
  onClose: () => void
}

type Paso = 1 | 2 | 3

export default function NuevaLimpiezaModal({ clientes, limpiadoras, onCreada, onClose }: Props) {
  const hoy = new Date().toISOString().split('T')[0]

  // ── Stepper state ──
  const [tiposServicio, setTiposServicio] = useState(TIPOS_SERVICIO_DEFAULT)

  useEffect(() => {
    fetch('/api/admin/catalogos')
      .then(r => r.json())
      .then(d => {
        const tipos = d.catalogos?.tipos_servicio_op?.filter((t: any) => t.activo !== false)
        if (tipos?.length) {
          const mapped = tipos.map((t: any) => ({ ...t, icon: t.emoji || t.icon || '🔄' }))
          setTiposServicio(mapped)
          // Actualizar tipo_servicio al primer tipo disponible si el actual no existe
          setForm(prev => ({
            ...prev,
            tipo_servicio: mapped.find((t: any) => t.id === prev.tipo_servicio)
              ? prev.tipo_servicio
              : mapped[0]?.id || prev.tipo_servicio
          }))
        }
      }).catch(() => {})
  }, [])

  const [paso, setPaso] = useState<Paso>(1)

  // ── Paso 1: Cliente ──
  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const clientesFiltrados = clientes.filter(c =>
    !buscaCliente || c.nombre?.toLowerCase().includes(buscaCliente.toLowerCase()))

  // ── Paso 2: Propiedad ──
  const [propiedades, setPropiedades]       = useState<any[]>([])
  const [propiedadId, setPropiedadId]       = useState('')
  const [loadingProps, setLoadingProps]     = useState(false)

  // ── Paso 3: Trabajo ──
  const [form, setForm] = useState({
    tipo_servicio:           'rotacion',
    session_date:            hoy,
    hora_inicio:             '',
    limpiadora_id:           '',
    hora_checkout:           '',
    hora_checkin_siguiente:  '',
    num_huespedes:           '',
    notas:                   '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Cargar propiedades cuando cambia el cliente
  useEffect(() => {
    if (!clienteId) { setPropiedades([]); setPropiedadId(''); return }
    setLoadingProps(true)
    fetch(`/api/admin/propiedades?cliente_id=${clienteId}`)
      .then(r => r.json())
      .then(d => { setPropiedades(d.propiedades || []); setPropiedadId('') })
      .finally(() => setLoadingProps(false))
  }, [clienteId])

  // ── Submit final ──
  async function submit() {
    setLoading(true); setError('')
    const propiedad = propiedades.find(p => p.id === propiedadId)
    try {
      const res = await fetch('/api/admin/sesiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:    clienteId,
          propiedad_id:  propiedadId,
          property_name: propiedad?.nombre || '',
          session_date:  form.session_date,
          hora_inicio:   form.hora_inicio   || null,
          limpiadora_id: form.limpiadora_id || null,
          tipo_servicio: form.tipo_servicio,
          hora_checkout:          form.hora_checkout || null,
          hora_checkin_siguiente: form.hora_checkin_siguiente || null,
          num_huespedes: form.num_huespedes ? Number(form.num_huespedes) : null,
          notas:         form.notas || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      onCreada(data.sesion)
      onClose()
    } catch { setError('Error de conexión') }
    finally  { setLoading(false) }
  }

  // ── Helpers stepper ──
  const clienteNombre   = clientes.find(c => c.id === clienteId)?.nombre || ''
  const propiedadNombre = propiedades.find(p => p.id === propiedadId)?.nombre || ''

  const ventanaMin = (() => {
    if (!form.hora_checkout || !form.hora_checkin_siguiente) return null
    const [hO, mO] = form.hora_checkout.split(':').map(Number)
    const [hI, mI] = form.hora_checkin_siguiente.split(':').map(Number)
    return (hI * 60 + mI) - (hO * 60 + mO)
  })()

  // ── Stepper indicator ──
  function Stepper() {
    const pasos = [
      { n: 1, label: 'Cliente',   done: !!clienteId },
      { n: 2, label: 'Propiedad', done: !!propiedadId },
      { n: 3, label: 'Trabajo',   done: false },
    ]
    return (
      <div className="flex items-center gap-0 px-5 py-3 border-b border-gray-100">
        {pasos.map((p, i) => (
          <div key={p.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: paso === p.n ? 'var(--brand-primary)' : p.done ? 'var(--brand-secondary)' : '#e5e7eb',
                  color:      paso === p.n || p.done ? 'white' : '#9ca3af',
                }}>
                {p.done && paso !== p.n ? '✓' : p.n}
              </div>
              <span className="text-xs mt-0.5 font-medium"
                style={{ color: paso === p.n ? 'var(--brand-primary)' : p.done ? 'var(--brand-secondary)' : '#9ca3af' }}>
                {p.label}
              </span>
            </div>
            {i < pasos.length - 1 && (
              <div className="h-0.5 flex-1 mb-4 mx-1 transition-all"
                style={{ background: p.done ? 'var(--brand-secondary)' : '#e5e7eb' }} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Nueva limpieza</h2>
            <p className="text-xs text-gray-400 mt-0.5">Paso {paso} de 3</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        {/* Stepper */}
        <Stepper />

        <div className="p-5 space-y-5">

          {/* ═══ PASO 1: CLIENTE ═══ */}
          {paso === 1 && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Selecciona el cliente <span className="text-red-400">*</span>
                </label>
                {clientes.length > 6 && (
                  <input
                    value={buscaCliente}
                    onChange={e => setBuscaCliente(e.target.value)}
                    placeholder="🔍 Buscar cliente por nombre…"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
                <div className="space-y-2">
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button"
                      onClick={() => setClienteId(c.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition"
                      style={{
                        borderColor: clienteId === c.id ? 'var(--brand-primary)' : '#e5e7eb',
                        background:  clienteId === c.id ? 'var(--brand-light)' : 'white',
                      }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: 'var(--brand-light)', color: 'var(--brand-primary)' }}>
                        {c.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{c.nombre}</div>
                        {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                      </div>
                      {clienteId === c.id && (
                        <div className="ml-auto text-indigo-600 font-bold">✓</div>
                      )}
                    </button>
                  ))}
                </div>
                {clientes.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No hay clientes creados aún</p>
                )}
                {clientes.length > 0 && clientesFiltrados.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Ningún cliente coincide con «{buscaCliente}»</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium">
                  Cancelar
                </button>
                <button type="button"
                  disabled={!clienteId}
                  onClick={() => setPaso(2)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition disabled:opacity-40"
                  style={{ background: 'var(--brand-primary)', color: 'white' }}>
                  Siguiente →
                </button>
              </div>
            </>
          )}

          {/* ═══ PASO 2: PROPIEDAD ═══ */}
          {paso === 2 && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <span className="text-indigo-600 font-bold text-sm">👤</span>
                <span className="text-sm font-medium text-indigo-800">{clienteNombre}</span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Selecciona la propiedad <span className="text-red-400">*</span>
                </label>

                {loadingProps ? (
                  <p className="text-sm text-gray-400 text-center py-4">Cargando propiedades…</p>
                ) : propiedades.length === 0 ? (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-sm text-gray-400">Este cliente no tiene propiedades creadas</p>
                    <a href="/admin/clientes"
                      className="inline-block text-sm font-semibold px-4 py-2 rounded-xl transition"
                      style={{ background: 'var(--brand-primary)', color: 'white' }}>
                      + Crear propiedad
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {propiedades.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => setPropiedadId(p.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition"
                        style={{
                          borderColor: propiedadId === p.id ? 'var(--brand-primary)' : '#e5e7eb',
                          background:  propiedadId === p.id ? 'var(--brand-light)' : 'white',
                        }}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                          style={{ background: 'var(--brand-light)' }}>
                          🏠
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">{p.nombre}</div>
                          {p.direccion && <div className="text-xs text-gray-400">{p.direccion}</div>}
                        </div>
                        {propiedadId === p.id && (
                          <div className="ml-auto text-indigo-600 font-bold">✓</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPaso(1)}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium">
                  ← Atrás
                </button>
                <button type="button"
                  disabled={!propiedadId}
                  onClick={() => setPaso(3)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition disabled:opacity-40"
                  style={{ background: 'var(--brand-primary)', color: 'white' }}>
                  Siguiente →
                </button>
              </div>
            </>
          )}

          {/* ═══ PASO 3: TRABAJO ═══ */}
          {paso === 3 && (
            <>
              {/* Resumen cliente + propiedad */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                  <span className="text-xs">👤</span>
                  <span className="text-xs font-medium text-indigo-800 truncate">{clienteNombre}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                  <span className="text-xs">🏠</span>
                  <span className="text-xs font-medium text-indigo-800 truncate">{propiedadNombre}</span>
                </div>
              </div>

              {/* Tipo de servicio */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de servicio</label>
                <div className="grid grid-cols-3 gap-2">
                  {tiposServicio.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => f('tipo_servicio', t.id)}
                      className="p-2.5 rounded-xl border-2 text-center transition"
                      style={{
                        borderColor: form.tipo_servicio === t.id ? 'var(--brand-secondary)' : '#e5e7eb',
                        background:  form.tipo_servicio === t.id ? 'var(--brand-light)' : 'white',
                      }}>
                      <div className="text-xl mb-0.5">{t.icon}</div>
                      <div className="text-xs font-semibold"
                        style={{ color: form.tipo_servicio === t.id ? 'var(--brand-secondary)' : '#374151' }}>
                        {t.label}
                      </div>
                      <div className="text-xs text-gray-400 leading-tight">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha y hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Fecha <span className="text-red-400">*</span>
                  </label>
                  <input type="date" value={form.session_date}
                    onChange={e => f('session_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hora aprox.</label>
                  <input type="time" value={form.hora_inicio}
                    onChange={e => f('hora_inicio', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Limpiadora */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Limpiadora</label>
                <select value={form.limpiadora_id} onChange={e => f('limpiadora_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">— Sin asignar —</option>
                  {limpiadoras.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Nº huéspedes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nº huéspedes
                  <span className="font-normal text-gray-400 ml-1">— para calcular toallas</span>
                </label>
                <input type="number" min="1" max="20"
                  value={form.num_huespedes}
                  onChange={e => f('num_huespedes', e.target.value)}
                  placeholder="2"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* Ventana horaria */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Checkout</label>
                  <input type="time" value={form.hora_checkout}
                    onChange={e => f('hora_checkout', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Próximo checkin</label>
                  <input type="time" value={form.hora_checkin_siguiente}
                    onChange={e => f('hora_checkin_siguiente', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                {ventanaMin !== null && (
                  <div className="col-span-2 text-xs">
                    <span className={ventanaMin >= 120 ? 'text-green-600' : 'text-red-500'}>
                      {ventanaMin >= 120 ? '✅' : '⚠️'} Ventana disponible: {ventanaMin} min ({(ventanaMin / 60).toFixed(1)}h)
                    </span>
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Notas
                  <span className="font-normal text-gray-400 ml-1">(lo que dijo por WhatsApp)</span>
                </label>
                <textarea value={form.notas} onChange={e => f('notas', e.target.value)}
                  placeholder="Ej: Cambiar sábanas cama grande, llave bajo felpudo, entrada 15h…"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPaso(2)}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium">
                  ← Atrás
                </button>
                <button type="button"
                  disabled={loading || !form.session_date}
                  onClick={submit}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50"
                  style={{ background: 'var(--brand-primary)', color: 'white' }}>
                  {loading ? 'Guardando…' : '✓ Crear limpieza'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
