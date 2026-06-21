'use client'
import CaracteristicasApartamento from '@/components/CaracteristicasApartamento'
import DocumentosPropiedad from '@/components/DocumentosPropiedad'
import { useState, useRef } from 'react'

const TIPO_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  piso_turistico: { label: 'Piso turístico', icon: '🏠', color: '#6366f1' },
  comunidad:      { label: 'Comunidad',      icon: '🏢', color: '#0ea5e9' },
  local:          { label: 'Local',          icon: '🏪', color: '#10b981' },
  oficina:        { label: 'Oficina',        icon: '💼', color: '#8b5cf6' },
  obra:           { label: 'Obra',           icon: '🏗️', color: '#f59e0b' },
  otro:           { label: 'Otro',           icon: '📋', color: '#64748b' },
}

const MODELO_CONFIG: Record<string, { label: string; icon: string; desc: string }> = {
  precio_fijo:   { label: 'Precio fijo',    icon: '💶', desc: 'Mismo precio cada limpieza' },
  por_horas:     { label: 'Por horas',      icon: '⏱️', desc: 'Tarifa × horas trabajadas' },
  por_m2:        { label: 'Por m²',         icon: '📐', desc: 'Precio por metro cuadrado' },
  mensual_fijo:  { label: 'Cuota mensual',  icon: '📅', desc: 'Precio fijo al mes' },
  mixto:         { label: 'Mixto',          icon: '🔀', desc: 'Base + extras variables' },
}

const ZONAS_COMUNIDAD = ['Portal','Escaleras','Garaje','Jardín','Piscina','Ascensor','Local social','Trasteros']

const EMPTY = {
  nombre: '', tipo: 'piso_turistico',
  // Dirección desglosada (manual) + catastro
  via: '', numero: '', piso: '', puerta: '',
  codigo_postal: '', municipio: '', provincia: '',
  referencia_catastral: '',
  // campo legacy direccion — se construye automáticamente al guardar
  direccion: '',
  m2: '', habitaciones: '', pms_propiedad_id: '',
    ical_urls: [],
  asignacion_fija: false,
  duracion_estimada_min: '120',
  flexibilidad_horaria: 'ventana',
  hora_pactada: '',
  hora_checkout_habitual: '11:00',
  hora_checkin_habitual: '15:00',
  limpiadora_principal_id: '',
  limpiadora_suplente_id: '',
  modelo_precio: 'precio_fijo',
  precio_limpieza: '', precio_hora: '', horas_estimadas: '',
  precio_m2: '', precio_mensual: '', limpiezas_mes: '',
  materiales_incluidos: true, precio_materiales: '',
  recargo_festivo: '', recargo_urgencia: '', recargo_nocturno: '',
  notas: '', zonas: [] as string[],
  num_camas_dobles: 0, num_camas_individuales: 0,
  num_camas_sofas: 0, num_camas_literas: 0,
  num_huespedes_max: 2, num_banos: 1, num_aseos: 0,
  tiene_piscina: false, tiene_terraza: false, tiene_barbacoa: false,
  tiene_jacuzzi: false, tiene_lavadora: false, tiene_secadora: false,
  tiene_cocina_completa: true, tiene_lavavajillas: false,
  tiene_parking: false, kit_bienvenida: false,
  gestion_lenceria: 'propietario', notas_material: '',
  lavanderia_proveedor: '', material_override: {} as Record<string,number>
}

interface Props {
  cliente: any
  propiedadesIniciales: any[]
  conexiones: any[]
  limpiadoras?: any[]
}

export default function PropiedadesClient({ cliente, propiedadesIniciales, conexiones, limpiadoras = [] }: Props) {
  const [props, setProps]         = useState<any[]>(propiedadesIniciales)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<any>(null)
  const [form, setForm]           = useState({ ...EMPTY })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  // CP autocompletado
  const [cpLoading, setCpLoading]   = useState(false)
  const [cpOk, setCpOk]             = useState(false)
  const [cpError, setCpError]       = useState('')
  const cpTimerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const t  = (tipo: string)   => TIPO_CONFIG[tipo]   || TIPO_CONFIG.otro
  const mp = (modelo: string) => MODELO_CONFIG[modelo] || MODELO_CONFIG.precio_fijo
  const f  = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  // ── CP → municipio/provincia ──────────────────────────────────────
  function handleCpChange(cp: string) {
    f('codigo_postal', cp)
    setCpOk(false)
    setCpError('')
    if (cpTimerRef.current) clearTimeout(cpTimerRef.current)
    if (cp.length === 5 && /^\d{5}$/.test(cp)) {
      cpTimerRef.current = setTimeout(() => lookupCP(cp), 500)
    }
  }

  async function lookupCP(cp: string) {
    setCpLoading(true)
    setCpError('')
    try {
      const res = await fetch(`/api/catastro/municipio?cp=${cp}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        setCpError(data.error || 'CP no encontrado')
        f('municipio', ''); f('provincia', '')
      } else {
        f('municipio', data.municipio)
        f('provincia', data.provincia)
        setCpOk(true)
      }
    } catch {
      setCpError('Error de conexión')
    } finally {
      setCpLoading(false)
    }
  }

  // ── Construye el campo direccion legacy al guardar ────────────────
  function buildDireccion(fm: typeof form): string {
    const parts = [
      fm.via?.trim(),
      fm.numero?.trim() ? `nº ${fm.numero.trim()}` : '',
      fm.piso?.trim(),
      fm.puerta?.trim(),
    ].filter(Boolean)
    return parts.join(', ')
  }

  function abrirNueva() {
    setEditando(null); setForm({ ...EMPTY })
    setError(''); setCpOk(false); setCpError('')
    setShowModal(true)
  }

  function abrirEditar(p: any) {
    setEditando(p)
    setForm({
      ...EMPTY,
      nombre: p.nombre || '', tipo: p.tipo || 'piso_turistico',
      direccion: p.direccion || '',
      via: p.via || '', numero: p.numero || '',
      piso: p.piso || '', puerta: p.puerta || '',
      codigo_postal: p.codigo_postal || '',
      municipio: p.municipio || '', provincia: p.provincia || '',
      referencia_catastral: p.referencia_catastral || '',
      m2: p.m2 || '', habitaciones: p.habitaciones || '',
      pms_propiedad_id: p.pms_propiedad_id || '',
      ical_urls: p.ical_urls || [],
      modelo_precio: p.modelo_precio || 'precio_fijo',
      precio_limpieza: p.precio_limpieza || '', precio_hora: p.precio_hora || '',
      horas_estimadas: p.horas_estimadas || '', precio_m2: p.precio_m2 || '',
      precio_mensual: p.precio_mensual || '', limpiezas_mes: p.limpiezas_mes || '',
      materiales_incluidos: p.materiales_incluidos !== false,
      precio_materiales: p.precio_materiales || '',
      recargo_festivo: p.recargo_festivo || '', recargo_urgencia: p.recargo_urgencia || '',
      recargo_nocturno: p.recargo_nocturno || '',
      notas: p.notas || '', zonas: p.zonas || [],
      lavanderia_proveedor: p.lavanderia_proveedor || '',
      material_override: p.material_override || {}
    })
    setCpOk(!!p.municipio); setCpError(''); setError('')
    setShowModal(true)
  }

  function toggleZona(zona: string) {
    setForm(p => ({
      ...p,
      zonas: p.zonas.includes(zona)
        ? p.zonas.filter((z: string) => z !== zona)
        : [...p.zonas, zona]
    }))
  }

  // Precio de referencia visual
  function precioLabel(p: any): string {
    switch (p.modelo_precio) {
      case 'precio_fijo':  return p.precio_limpieza   ? p.precio_limpieza + '€'    : '—'
      case 'por_horas':    return p.precio_hora        ? p.precio_hora + '€/h'     : '—'
      case 'por_m2':       return p.precio_m2          ? p.precio_m2 + '€/m²'      : '—'
      case 'mensual_fijo': return p.precio_mensual     ? p.precio_mensual + '€/mes' : '—'
      default:             return '—'
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      // Construir direccion legacy desde campos desglosados
      const direccionBuilt = buildDireccion(form)
      const body = {
        cliente_id: cliente.id, ...form,
        direccion:        direccionBuilt || form.direccion || null,
        municipio:        form.municipio || null,
        provincia:        form.provincia || null,
        referencia_catastral: form.referencia_catastral?.trim() || null,
        m2:               form.m2               ? Number(form.m2)               : null,
        habitaciones:     form.habitaciones      ? Number(form.habitaciones)      : null,
        precio_limpieza:  form.precio_limpieza   ? Number(form.precio_limpieza)   : null,
        precio_hora:      form.precio_hora       ? Number(form.precio_hora)       : null,
        horas_estimadas:  form.horas_estimadas   ? Number(form.horas_estimadas)   : null,
        precio_m2:        form.precio_m2         ? Number(form.precio_m2)         : null,
        precio_mensual:   form.precio_mensual    ? Number(form.precio_mensual)    : null,
        limpiezas_mes:    form.limpiezas_mes      ? Number(form.limpiezas_mes)     : null,
        precio_materiales:form.precio_materiales ? Number(form.precio_materiales) : null,
        recargo_festivo:  Number(form.recargo_festivo  || 0),
        recargo_urgencia: Number(form.recargo_urgencia || 0),
        recargo_nocturno: Number(form.recargo_nocturno || 0),
        zonas: form.zonas.length > 0 ? form.zonas : null,
      }
      const url    = editando ? '/api/admin/propiedades/' + editando.id : '/api/admin/propiedades'
      const method = editando ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      if (editando) {
        setProps(ps => ps.map(p => p.id === editando.id ? { ...p, ...data.propiedad } : p))
      } else {
        setProps(ps => [...ps, { ...data.propiedad, sesiones_hoy: 0, total_completadas: 0 }])
      }
      setShowModal(false)
    } catch { setError('Error de conexión') }
    finally   { setLoading(false) }
  }

  async function desactivar(p: any) {
    if (!confirm('¿Desactivar ' + p.nombre + '?')) return
    const res = await fetch('/api/admin/propiedades/' + p.id, { method: 'DELETE' })
    if (res.ok) setProps(ps => ps.map(x => x.id === p.id ? { ...x, activa: false } : x))
    else { const d = await res.json(); alert(d.error) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin/clientes" className="text-indigo-200 hover:text-white text-sm">← Clientes</a>
            <div>
              <div className="flex items-center gap-1.5">
                <span>{t(cliente.tipo).icon}</span>
                <h1 className="font-bold">{cliente.nombre}</h1>
              </div>
              <p className="text-indigo-200 text-xs">{props.length} propiedades</p>
            </div>
          </div>
          <button onClick={abrirNueva}
            className="bg-white text-indigo-600 font-semibold text-sm px-3 py-1.5 rounded-lg">
            + Añadir
          </button>
        </div>
      </header>

      <div className="p-4 space-y-3 pb-20">
        {props.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">🏠</div>
            <p className="font-medium">Sin propiedades</p>
            <button onClick={abrirNueva} className="mt-2 text-indigo-600 text-sm underline">
              Añadir primera propiedad →
            </button>
          </div>
        )}

        {props.map((p: any) => {
          const cfg = t(p.tipo)
          const mcfg = mp(p.modelo_precio)
          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              style={{ borderLeft: '4px solid ' + (p.activa ? cfg.color : '#e5e7eb') }}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{cfg.icon}</span>
                      <h3 className="font-bold text-gray-800 text-sm">{p.nombre}</h3>
                      {!p.activa && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">inactiva</span>}
                    </div>
                    <p className="text-xs mt-0.5 font-medium" style={{ color: cfg.color }}>{cfg.label}</p>
                    {p.direccion && <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {p.direccion}</p>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {mcfg.icon} {mcfg.label}
                      </span>
                      {p.materiales_incluidos === false && (
                        <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">Mat. aparte</span>
                      )}
                      {Number(p.recargo_festivo) > 0 && (
                        <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">+{p.recargo_festivo}% festivo</span>
                      )}
                    </div>
                    {p.zonas?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        {p.zonas.map((z: string) => (
                          <span key={z} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{z}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {p.m2 && <span>📐 {p.m2}m²</span>}
                      {p.habitaciones && <span>🛏 {p.habitaciones} hab</span>}
                      {p.pms_propiedad_id && <span className="font-mono">🔌 {p.pms_propiedad_id}</span>}
                      {p.limpiezas_mes && <span>📅 {p.limpiezas_mes} limpiezas/mes</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-indigo-600 text-lg">{precioLabel(p)}</p>
                    {Number(p.sesiones_hoy) > 0 && (
                      <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full block mt-1">🧹 hoy</span>
                    )}
                    {p.ultima_limpieza && (
                      <p className="text-xs text-gray-400 mt-1">{String(p.ultima_limpieza).split('T')[0]}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => abrirEditar(p)}
                    className="flex-1 text-xs border border-indigo-200 text-indigo-600 rounded-lg py-1.5 hover:bg-indigo-50">
                    Editar
                  </button>
                  {p.activa && (
                    <button onClick={() => desactivar(p)}
                      className="text-xs border border-gray-200 text-gray-400 rounded-lg px-3 py-1.5">⊘</button>
                  )}
                </div>

                {/* Documentos que el propietario ha compartido con la empresa (solo lectura) */}
                {Array.isArray(p.documentos) && p.documentos.some((d: any) => d?.compartido) && (
                  <div className="mt-3">
                    <DocumentosPropiedad propiedadId={p.id} propiedadNombre={p.nombre}
                      documentosIniciales={p.documentos} soloLectura />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editando ? 'Editar' : 'Nueva propiedad'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-2xl">✕</button>
            </div>
            <form onSubmit={guardar} className="p-5 space-y-5">

              {/* Tipo */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(TIPO_CONFIG).map(([key, val]) => (
                    <button key={key} type="button" onClick={() => f('tipo', key)}
                      className="p-2.5 rounded-xl border-2 text-center transition"
                      style={{ borderColor: form.tipo === key ? val.color : '#e5e7eb', background: form.tipo === key ? val.color + '15' : 'white' }}>
                      <div className="text-xl">{val.icon}</div>
                      <div className="text-xs font-medium mt-0.5" style={{ color: form.tipo === key ? val.color : '#374151' }}>{val.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre *</label>
                <input value={form.nombre} onChange={e => f('nombre', e.target.value)}
                  placeholder="Ej: Casa Socorro, Portal C/ Betis 12…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>

              {/* MODELO DE PRECIO */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Modelo de facturación</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(MODELO_CONFIG).map(([key, val]) => (
                      <button key={key} type="button" onClick={() => f('modelo_precio', key)}
                        className="p-3 rounded-xl border-2 text-left transition"
                        style={{ borderColor: form.modelo_precio === key ? '#6366f1' : '#e5e7eb', background: form.modelo_precio === key ? '#eef2ff' : 'white' }}>
                        <span className="text-base">{val.icon}</span>
                        <div className="text-xs font-semibold mt-1" style={{ color: form.modelo_precio === key ? '#6366f1' : '#374151' }}>{val.label}</div>
                        <div className="text-xs text-gray-400 leading-tight">{val.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campos según modelo */}
                {form.modelo_precio === 'precio_fijo' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Precio por limpieza (€) *</label>
                    <input type="number" step="0.01" value={form.precio_limpieza}
                      onChange={e => f('precio_limpieza', e.target.value)}
                      placeholder="Ej: 28.00"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                )}

                {form.modelo_precio === 'por_horas' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">€/hora *</label>
                      <input type="number" step="0.01" value={form.precio_hora}
                        onChange={e => f('precio_hora', e.target.value)} placeholder="15.00"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Horas estimadas</label>
                      <input type="number" step="0.5" value={form.horas_estimadas}
                        onChange={e => f('horas_estimadas', e.target.value)} placeholder="3"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                )}

                {form.modelo_precio === 'por_m2' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">€/m² *</label>
                    <input type="number" step="0.01" value={form.precio_m2}
                      onChange={e => f('precio_m2', e.target.value)} placeholder="1.80"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                )}

                {form.modelo_precio === 'mensual_fijo' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">€/mes *</label>
                      <input type="number" step="0.01" value={form.precio_mensual}
                        onChange={e => f('precio_mensual', e.target.value)} placeholder="300.00"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Limpiezas/mes</label>
                      <input type="number" value={form.limpiezas_mes}
                        onChange={e => f('limpiezas_mes', e.target.value)} placeholder="4"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                )}

                {/* Materiales */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.materiales_incluidos}
                      onChange={e => f('materiales_incluidos', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded" />
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Materiales incluidos</p>
                      <p className="text-xs text-gray-400">Productos de limpieza en el precio</p>
                    </div>
                  </label>
                  {!form.materiales_incluidos && (
                    <div className="mt-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Coste materiales (€)</label>
                      <input type="number" step="0.01" value={form.precio_materiales}
                        onChange={e => f('precio_materiales', e.target.value)} placeholder="10.00"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                </div>

                {/* Recargos */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Recargos (%)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'recargo_festivo',  label: '📅 Festivo'  },
                      { key: 'recargo_urgencia', label: '🔴 Urgencia' },
                      { key: 'recargo_nocturno', label: '🌙 Nocturno' },
                    ].map(r => (
                      <div key={r.key}>
                        <label className="block text-xs text-gray-500 mb-1">{r.label}</label>
                        <div className="relative">
                          <input type="number" step="5" min="0" max="100"
                            value={(form as any)[r.key]}
                            onChange={e => f(r.key, e.target.value)}
                            placeholder="0"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── LOCALIZACIÓN ── */}
              <div className="bg-indigo-50 rounded-2xl p-4 space-y-3">
                <div className="text-sm font-semibold text-indigo-700">📍 Localización</div>

                {/* CP → municipio automático */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Código postal
                    {cpLoading && <span className="ml-2 text-indigo-400 font-normal">buscando…</span>}
                    {cpOk && <span className="ml-2 text-green-600 font-normal">✓ localizado</span>}
                    {cpError && <span className="ml-2 text-red-500 font-normal">{cpError}</span>}
                  </label>
                  <input
                    value={form.codigo_postal}
                    onChange={e => handleCpChange(e.target.value.replace(/\D/g,'').slice(0,5))}
                    placeholder="41003"
                    maxLength={5}
                    inputMode="numeric"
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      cpOk ? 'border-green-400 bg-green-50' : cpError ? 'border-red-300' : 'border-gray-200'
                    }`}
                  />
                </div>

                {/* Municipio + Provincia — readonly, vienen del CP */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Municipio</label>
                    <input
                      value={form.municipio}
                      onChange={e => f('municipio', e.target.value)}
                      placeholder="Autocompletado con el CP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Provincia</label>
                    <input
                      value={form.provincia}
                      onChange={e => f('provincia', e.target.value)}
                      placeholder="Autocompletado"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                {/* Dirección manual desglosada */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vía y nombre</label>
                  <input
                    value={form.via}
                    onChange={e => f('via', e.target.value)}
                    placeholder="Ej: Calle Bustos Tavera, Avda. de la Paz…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Número</label>
                    <input
                      value={form.numero}
                      onChange={e => f('numero', e.target.value)}
                      placeholder="22"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Piso</label>
                    <input
                      value={form.piso}
                      onChange={e => f('piso', e.target.value)}
                      placeholder="3º"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Puerta</label>
                    <input
                      value={form.puerta}
                      onChange={e => f('puerta', e.target.value)}
                      placeholder="B"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Preview dirección completa */}
                {(form.via || form.numero) && (
                  <div className="bg-white rounded-lg px-3 py-2 border border-indigo-200 text-xs text-indigo-700">
                    📍 {[form.via, form.numero && `nº ${form.numero}`, form.piso, form.puerta].filter(Boolean).join(', ')}
                    {form.municipio && <span className="text-gray-400"> · {form.codigo_postal} {form.municipio}</span>}
                  </div>
                )}

                {/* Referencia catastral — opcional, la añade el dueño */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Referencia catastral <span className="font-normal text-gray-400">(opcional)</span>
                  </label>
                  <input
                    value={form.referencia_catastral}
                    onChange={e => f('referencia_catastral', e.target.value.toUpperCase().replace(/\s/g,''))}
                    placeholder="Ej: 5732032TG3453B0001PK"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    maxLength={20}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Encuéntrala en la escritura, recibo del IBI o en{' '}
                    <a href="https://www1.sedecatastro.gob.es" target="_blank" rel="noopener" className="text-indigo-500 underline">sedecatastro.gob.es</a>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">M²</label>
                  <input type="number" value={form.m2} onChange={e => f('m2', e.target.value)}
                    placeholder="90"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Habitaciones</label>
                  <input type="number" value={form.habitaciones} onChange={e => f('habitaciones', e.target.value)}
                    placeholder="3"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {form.tipo === 'piso_turistico' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    ID en PMS <span className="font-normal text-gray-400">— para sync automático</span>
                  </label>
                  <input value={form.pms_propiedad_id} onChange={e => f('pms_propiedad_id', e.target.value)}
                    placeholder="Ej: 352007 (Smoobu)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}

              {form.tipo === 'comunidad' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Zonas a limpiar</label>
                  <div className="flex flex-wrap gap-2">
                    {ZONAS_COMUNIDAD.map(zona => (
                      <button key={zona} type="button" onClick={() => toggleZona(zona)}
                        className="px-3 py-1.5 rounded-full border text-sm transition"
                        style={{
                          borderColor: form.zonas.includes(zona) ? '#0ea5e9' : '#e5e7eb',
                          background:  form.zonas.includes(zona) ? '#e0f2fe'  : 'white',
                          color:       form.zonas.includes(zona) ? '#0369a1'  : '#6b7280'
                        }}>
                        {zona}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ZONA Y TIEMPOS ── */}
              <div className="bg-blue-50 rounded-2xl p-4 space-y-4">
                <div className="text-sm font-semibold text-blue-700">📍 Zona y tiempos</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Duración estimada</label>
                    <select value={form.duracion_estimada_min} onChange={e => f('duracion_estimada_min', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="60">1h</option>
                      <option value="90">1h 30min</option>
                      <option value="120">2h</option>
                      <option value="150">2h 30min</option>
                      <option value="180">3h</option>
                      <option value="240">4h</option>
                      <option value="300">5h</option>
                      <option value="360">6h+</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Tipo de horario</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'ventana',  icon: '⏱️', label: 'Ventana',  desc: 'Entre checkout y checkin (turístico)' },
                      { id: 'fija',     icon: '🕐', label: 'Fija',     desc: 'Hora exacta (casa particular)' },
                      { id: 'flexible', icon: '🔓', label: 'Flexible', desc: 'Cualquier hora del día (comunidad)' },
                    ].map(opt => (
                      <button key={opt.id} type="button" onClick={() => f('flexibilidad_horaria', opt.id)}
                        className="p-2.5 rounded-xl border-2 text-center transition"
                        style={{
                          borderColor: form.flexibilidad_horaria === opt.id ? '#3b82f6' : '#e5e7eb',
                          background:  form.flexibilidad_horaria === opt.id ? '#eff6ff'  : 'white'
                        }}>
                        <div className="text-lg">{opt.icon}</div>
                        <div className="text-xs font-semibold mt-0.5"
                          style={{ color: form.flexibilidad_horaria === opt.id ? '#2563eb' : '#374151' }}>
                          {opt.label}
                        </div>
                        <div className="text-xs text-gray-400 leading-tight">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {form.flexibilidad_horaria === 'ventana' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Checkout habitual</label>
                      <input type="time" value={form.hora_checkout_habitual}
                        onChange={e => f('hora_checkout_habitual', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Checkin siguiente</label>
                      <input type="time" value={form.hora_checkin_habitual}
                        onChange={e => f('hora_checkin_habitual', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {form.hora_checkout_habitual && form.hora_checkin_habitual && (() => {
                      const [hO, mO] = form.hora_checkout_habitual.split(':').map(Number)
                      const [hI, mI] = form.hora_checkin_habitual.split(':').map(Number)
                      const ventana  = (hI * 60 + mI) - (hO * 60 + mO)
                      const duracion = Number(form.duracion_estimada_min)
                      const ok       = ventana >= duracion + 15
                      return (
                        <div className="col-span-2 flex items-center gap-2 text-xs">
                          <span className={ok ? 'text-green-600' : 'text-red-500'}>
                            {ok ? '✅' : '⚠️'}
                          </span>
                          <span className={ok ? 'text-green-700' : 'text-red-600'}>
                            Ventana: {ventana}min | Limpieza: {duracion}min
                            {ok ? ' — OK' : ' — ¡VENTANA AJUSTADA!'}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {form.flexibilidad_horaria === 'fija' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Hora pactada con el cliente</label>
                    <input type="time" value={form.hora_pactada}
                      onChange={e => f('hora_pactada', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>

              {/* Características del apartamento — solo para pisos turísticos y particulares */}
              {(form.tipo === 'piso_turistico' || form.tipo === 'particular') && (
                <CaracteristicasApartamento form={form} onChange={f} />
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => f('notas', e.target.value)}
                  placeholder="Acceso, instrucciones…" rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}


              {/* Calendarios iCal */}
              <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700">Calendarios iCal</label>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Pega la URL iCal de Booking, Airbnb, VRBO… Las limpiezas se crean automáticamente.
                    </p>
                  </div>
                  <button type="button"
                    onClick={() => f('ical_urls', [...(form.ical_urls || []), ''])}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100">
                    + Añadir
                  </button>
                </div>
                {(form.ical_urls || []).length === 0 && (
                  <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-1">📅</div>
                    <p className="text-xs text-gray-500 font-medium">Sin calendarios conectados</p>
                    <p className="text-xs text-gray-400 mt-0.5">Copia la URL iCal desde tu plataforma</p>
                  </div>
                )}
                {(form.ical_urls || []).map((url: string, idx: number) => (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    <input
                      value={url}
                      onChange={e => { const nv: string[] = [...(form.ical_urls || [])]; nv[idx] = e.target.value; f('ical_urls', nv) }}
                      placeholder="https://ical.booking.com/v1/export?t=..."
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 font-mono bg-gray-50"
                    />
                    <button type="button"
                      onClick={() => f('ical_urls', (form.ical_urls || []).filter((_: string, i: number) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none flex-shrink-0">
                      ×
                    </button>
                  </div>
                ))}
                {(form.ical_urls || []).some((u: string) => u.startsWith('http')) && (
                  <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex gap-2 items-center">
                    <span className="text-green-600 text-sm">✓</span>
                    <span className="text-xs text-green-700 font-medium">Sync automático cada 10 min.</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-bold">
                  {loading ? 'Guardando…' : editando ? 'Guardar' : '+ Añadir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
