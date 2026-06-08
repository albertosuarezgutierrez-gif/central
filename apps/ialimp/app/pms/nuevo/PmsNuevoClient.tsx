'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TIPOS = {
  apartamentos_turisticos: { label: 'Pisos turísticos', icon: '🏨', color: '#6366f1' },
  comunidad:               { label: 'Comunidad',        icon: '🏢', color: '#0ea5e9' },
  final_obra:              { label: 'Final de obra',    icon: '🏗️', color: '#f59e0b' },
  oficinas:                { label: 'Oficinas',         icon: '💼', color: '#10b981' },
  otro:                    { label: 'Otro',             icon: '📋', color: '#64748b' },
}

const PMS_TIPOS = [
  { id: 'smoobu',   label: 'Smoobu',        icon: '🏠' },
  { id: 'octorate', label: 'Octorate',       icon: '🐙' },
  { id: 'icnea',    label: 'Icnea',          icon: '📋' },
  { id: 'hostify',  label: 'Hostify',        icon: '⚡' },
  { id: 'kross',    label: 'Kross Booking',  icon: '🔑' },
  { id: 'airbnb',   label: 'Airbnb (iCal)',  icon: '🏡' },
  { id: 'booking',  label: 'Booking (iCal)', icon: '🌐' },
  { id: 'ical',     label: 'Otro iCal',      icon: '📅' },
]

interface Props {
  clientes: any[]
  clientePreseleccionado: any | null
}

export default function PmsNuevoClient({ clientes, clientePreseleccionado }: Props) {
  const router = useRouter()

  // Si viene preseleccionado, empezamos en step 2 directamente
  const stepInicial = clientePreseleccionado ? 2 : 1

  const [step, setStep]       = useState(stepInicial)
  const [cliente, setCliente] = useState<any>(clientePreseleccionado)
  const [form, setForm]       = useState({ conexion_nombre: '', pms_tipo: '', ical_url: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const totalSteps = clientePreseleccionado ? 3 : 4
  const stepLabel  = clientePreseleccionado
    ? ['Nombre conexión', 'Tipo de PMS', 'URL iCal']
    : ['Cliente', 'Nombre conexión', 'Tipo de PMS', 'URL iCal']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/pms/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:       cliente?.id || null,
          cliente_nombre:   form.conexion_nombre,
          pms_tipo:         form.pms_tipo,
          ical_url:         form.ical_url || null,
        })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      router.push(cliente ? '/admin/clientes' : '/dashboard')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const stepActual = clientePreseleccionado ? step - 1 : step

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => step > stepInicial ? setStep(s => s - 1) : router.back()}
          className="text-indigo-200 hover:text-white">←</button>
        <h1 className="font-bold">Conectar PMS</h1>
      </header>

      {/* Barra de progreso */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-1">
              <div className="h-1.5 flex-1 rounded-full transition-all"
                style={{ background: stepActual > i + 1 ? '#6366f1' : stepActual === i + 1 ? '#818cf8' : '#e5e7eb' }} />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Paso {stepActual} de {totalSteps} — {stepLabel[stepActual - 1]}
        </p>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── STEP 1: Seleccionar cliente ── */}
          {step === 1 && !clientePreseleccionado && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-800 mb-1">¿A qué cliente pertenece?</h2>
              <p className="text-sm text-gray-400 mb-4">Selecciona el propietario o gestor de estos pisos</p>

              {clientes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-3xl mb-2">👥</div>
                  <p className="text-sm">Sin clientes aún</p>
                  <a href="/admin/clientes" className="text-indigo-600 text-sm underline mt-2 block">
                    Crear primer cliente →
                  </a>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {clientes.map((c: any) => {
                    const t = (TIPOS as any)[c.tipo] || TIPOS.otro
                    const sel = cliente?.id === c.id
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setCliente(c)}
                        className="w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition"
                        style={{
                          borderColor: sel ? t.color : '#e5e7eb',
                          background:  sel ? t.color + '12' : 'white'
                        }}>
                        <span className="text-xl">{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{c.nombre}</p>
                          <p className="text-xs mt-0.5" style={{ color: t.color }}>{t.label}</p>
                        </div>
                        {sel && <span style={{ color: t.color }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="mt-4 space-y-2">
                <button type="button"
                  onClick={() => { if (cliente) setStep(2) }}
                  disabled={!cliente}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40 transition">
                  Siguiente →
                </button>
                <p className="text-center text-xs text-gray-400">
                  ¿Cliente nuevo?{' '}
                  <a href="/admin/clientes" className="text-indigo-500 underline">Créalo primero</a>
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 2: Nombre de la conexión ── */}
          {step === 2 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              {cliente && (
                <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-gray-50">
                  <span className="text-lg">{(TIPOS as any)[cliente.tipo]?.icon}</span>
                  <div>
                    <p className="text-xs text-gray-400">Cliente seleccionado</p>
                    <p className="font-semibold text-gray-700 text-sm">{cliente.nombre}</p>
                  </div>
                </div>
              )}
              <h2 className="font-bold text-gray-800 mb-1">Nombre de esta conexión</h2>
              <p className="text-sm text-gray-400 mb-4">
                Identifica este conjunto de propiedades (ej: "Pisos Triana", "Portal A", "Suite Centro")
              </p>
              <input
                type="text"
                value={form.conexion_nombre}
                onChange={e => setForm(f => ({ ...f, conexion_nombre: e.target.value }))}
                placeholder="Ej: Apartamentos Resolana, Pisos Triana…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button type="button"
                onClick={() => form.conexion_nombre.trim() && setStep(3)}
                className="w-full mt-4 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm">
                Siguiente →
              </button>
            </div>
          )}

          {/* ── STEP 3: Tipo de PMS ── */}
          {step === 3 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-800 mb-1">¿Qué programa usa el cliente?</h2>
              <p className="text-sm text-gray-400 mb-4">Sistema de gestión de reservas</p>
              <div className="grid grid-cols-2 gap-2.5">
                {PMS_TIPOS.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => { setForm(f => ({ ...f, pms_tipo: p.id })); setStep(4) }}
                    className="p-3.5 rounded-xl border-2 text-left transition active:scale-95"
                    style={{
                      borderColor: form.pms_tipo === p.id ? '#6366f1' : '#e5e7eb',
                      background:  form.pms_tipo === p.id ? '#eef2ff' : 'white'
                    }}>
                    <div className="text-2xl mb-1">{p.icon}</div>
                    <div className="text-sm font-medium text-gray-700">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: URL iCal ── */}
          {step === 4 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              {/* Resumen */}
              <div className="bg-indigo-50 rounded-xl p-3 mb-5 space-y-1.5">
                {cliente && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cliente</span>
                    <span className="font-medium text-gray-700">{cliente.nombre}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Conexión</span>
                  <span className="font-medium text-gray-700">{form.conexion_nombre}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">PMS</span>
                  <span className="font-medium text-indigo-600 uppercase text-xs">{form.pms_tipo}</span>
                </div>
              </div>

              <h2 className="font-bold text-gray-800 mb-1">URL del calendario iCal</h2>
              <p className="text-sm text-gray-400 mb-1">
                En el PMS del cliente: Ajustes → Sincronización → Exportar calendario
              </p>
              <p className="text-xs text-gray-300 mb-4">
                También puedes dejarlo en blanco y añadirlo después
              </p>
              <textarea
                value={form.ical_url}
                onChange={e => setForm(f => ({ ...f, ical_url: e.target.value }))}
                placeholder="https://app.smoobu.com/ical/..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />

              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setStep(3)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm">
                  ← Atrás
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                  {loading ? 'Conectando…' : '✓ Conectar'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
