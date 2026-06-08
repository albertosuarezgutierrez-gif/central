'use client'
import { useState, useMemo } from 'react'

const EMPTY_FORM = {
  nombre: '',
  contacto_nombre: '', contacto_tel: '', contacto_email: '',
  direccion: '', notas: ''
}

export default function ClientesClient({ clientesIniciales }: { clientesIniciales: any[] }) {
  const [clientes, setClientes]     = useState<any[]>(clientesIniciales)
  const [search, setSearch]         = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState<any>(null)
  const [form, setForm]             = useState({ ...EMPTY_FORM })
  const [detalle, setDetalle]       = useState<any>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const filtered = useMemo(() => clientes.filter(c => {
    const matchSearch = !search ||
      c.nombre?.toLowerCase().includes(search.toLowerCase()) ||
      c.contacto_nombre?.toLowerCase().includes(search.toLowerCase()) ||
      c.direccion?.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  }), [clientes, search])

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...EMPTY_FORM })
    setError('')
    setShowModal(true)
  }

  function abrirEditar(c: any) {
    setEditando(c)
    setForm({
      nombre: c.nombre || '',
      contacto_nombre: c.contacto_nombre || '', contacto_tel: c.contacto_tel || '',
      contacto_email: c.contacto_email || '', direccion: c.direccion || '',
      notas: c.notas || ''
    })
    setError('')
    setShowModal(true)
  }

  async function verDetalle(c: any) {
    setDetalle({ ...c, loading: true })
    const res = await fetch('/api/admin/clientes/' + c.id)
    const data = await res.json()
    setDetalle(data)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const url = editando ? '/api/admin/clientes/' + editando.id : '/api/admin/clientes'
      const method = editando ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar el cliente'); return }
      if (editando) {
        setClientes(cs => cs.map(c => c.id === editando.id ? { ...c, ...data.cliente } : c))
      } else {
        setClientes(cs => [{ ...data.cliente, pms_count: 0, sesiones_hoy: 0, sesiones_pendientes: 0 }, ...cs])
      }
      setShowModal(false)
    } catch {
      setError('Error de red al guardar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const [enviandoAcceso, setEnviandoAcceso] = useState<string | null>(null)

  async function enviarAcceso(c: any) {
    const emailConocido = c.notif_email || c.contacto_email || ''
    const destino = prompt(
      `Enviar a ${c.nombre} un email con el enlace de acceso a su intranet.\n\nEmail destinatario:`,
      emailConocido
    )
    if (destino === null) return
    setEnviandoAcceso(c.id)
    try {
      const res = await fetch('/api/admin/clientes/' + c.id + '/enviar-acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: destino.trim() || undefined })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'No se pudo enviar'); return }
      alert('✅ Acceso enviado a ' + data.destinatario)
    } catch {
      alert('Error de red al enviar el acceso')
    } finally {
      setEnviandoAcceso(null)
    }
  }

  async function toggleActivo(c: any) {
    if (c.activo) {
      if (!confirm('¿Desactivar cliente ' + c.nombre + '?')) return
      const res = await fetch('/api/admin/clientes/' + c.id, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
    } else {
      await fetch('/api/admin/clientes/' + c.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: true })
      })
    }
    setClientes(cs => cs.map(x => x.id === c.id ? { ...x, activo: !c.activo } : x))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-indigo-200 hover:text-white text-sm">← Dashboard</a>
          <h1 className="font-bold text-lg">Clientes</h1>
          <span className="bg-indigo-500 text-indigo-100 text-xs px-2 py-0.5 rounded-full">{clientes.length}</span>
        </div>
        <button onClick={abrirNuevo}
          className="bg-white text-indigo-600 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition">
          + Nuevo cliente
        </button>
      </header>

      {/* Filtros */}
      <div className="p-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, contacto, dirección…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      {/* Lista */}
      <div className="px-4 space-y-3 pb-8">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">👥</div>
            <p className="font-medium">Sin clientes</p>
            <button onClick={abrirNuevo} className="mt-3 text-indigo-600 text-sm underline">
              Añadir primer cliente →
            </button>
          </div>
        )}

        {filtered.map(c => {
          return (
            <div key={c.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              style={{ borderLeft: '4px solid #6366f1' }}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">🏠</span>
                      <h3 className="font-bold text-gray-800 text-base truncate">{c.nombre}</h3>
                      {!c.activo && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">inactivo</span>
                      )}
                    </div>
                    {c.contacto_nombre && (
                      <p className="text-sm text-gray-500 mt-1">👤 {c.contacto_nombre}</p>
                    )}
                    {c.direccion && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {c.direccion}</p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {Number(c.pms_count) > 0 && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                        🔌 {c.pms_count} PMS
                      </span>
                    )}
                    {Number(c.sesiones_hoy) > 0 && (
                      <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full font-medium">
                        🧹 {c.sesiones_hoy} hoy
                      </span>
                    )}
                    {Number(c.sesiones_pendientes) > 0 && (
                      <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full font-medium">
                        ⏳ {c.sesiones_pendientes} pend.
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="mt-3 space-y-2">
                  {/* Ver detalle: siempre fijo, a ancho completo */}
                  <button onClick={() => verDetalle(c)}
                    className="w-full text-sm border border-gray-200 rounded-lg py-2 text-gray-700 font-medium hover:bg-gray-50 transition">
                    Ver detalle
                  </button>
                  {/* Ficha completa: datos fiscales, contactos y facturación */}
                  <a href={'/admin/clientes/' + c.id}
                    className="block w-full text-center text-sm border border-indigo-200 bg-indigo-50 rounded-lg py-2 text-indigo-700 font-medium hover:bg-indigo-100 transition">
                    🧾 Ficha y facturación
                  </a>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => abrirEditar(c)}
                      className="flex-1 min-w-[90px] text-xs border border-indigo-200 rounded-lg py-1.5 text-indigo-600 hover:bg-indigo-50 transition">
                      Editar
                    </button>
                    <a href={'/admin/clientes/' + c.id + '/propiedades'}
                      className="flex-1 min-w-[110px] text-xs bg-indigo-600 text-white rounded-lg py-1.5 text-center hover:bg-indigo-700 transition">
                      🏠 Propiedades
                    </a>
                    <button onClick={() => toggleActivo(c)}
                      className="flex-shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-400 hover:bg-gray-50 transition">
                      {c.activo ? '⊘' : '✓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editando ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={guardar} className="p-5 space-y-4">

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: AlohaSevilla, Comunidad C/ Resolana…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required />
              </div>

              {/* Contacto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
                  <input value={form.contacto_nombre} onChange={e => setForm(f => ({ ...f, contacto_nombre: e.target.value }))}
                    placeholder="Nombre contacto"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                  <input value={form.contacto_tel} onChange={e => setForm(f => ({ ...f, contacto_tel: e.target.value }))}
                    placeholder="6xx xxx xxx"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={form.contacto_email}
                  onChange={e => setForm(f => ({ ...f, contacto_email: e.target.value }))}
                  placeholder="cliente@ejemplo.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                  placeholder="C/ Ejemplo 12, Sevilla"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Acceso por portero automático, horario 10-14h…"
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                  {loading ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cliente'}
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
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 truncate pr-4">
                🏠 {detalle.cliente?.nombre}
              </h2>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 text-xl flex-shrink-0">✕</button>
            </div>

            {detalle.loading ? (
              <div className="p-8 text-center text-gray-400">Cargando…</div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Info contacto */}
                <div className="space-y-2">
                  {detalle.cliente?.contacto_nombre && <p className="text-sm text-gray-600">👤 {detalle.cliente.contacto_nombre}</p>}
                  {detalle.cliente?.contacto_tel && (
                    <a href={'tel:' + detalle.cliente.contacto_tel} className="text-sm text-indigo-600 block">📞 {detalle.cliente.contacto_tel}</a>
                  )}
                  {detalle.cliente?.contacto_email && (
                    <a href={'mailto:' + detalle.cliente.contacto_email} className="text-sm text-indigo-600 block">✉️ {detalle.cliente.contacto_email}</a>
                  )}
                  {detalle.cliente?.direccion && <p className="text-sm text-gray-500">📍 {detalle.cliente.direccion}</p>}
                  {detalle.cliente?.notas && (
                    <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">{detalle.cliente.notas}</p>
                  )}
                </div>

                {/* Conexiones PMS */}
                {detalle.conexiones?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Conexiones PMS</h3>
                    <div className="space-y-2">
                      {detalle.conexiones.map((c: any) => (
                        <div key={c.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-700">{c.cliente_nombre}</p>
                            <p className="text-xs text-gray-400 uppercase">{c.pms_tipo}</p>
                          </div>
                          <span className={c.activa ? 'text-xs text-green-600' : 'text-xs text-gray-400'}>
                            {c.activa ? '● Activo' : '○ Inactivo'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sesiones recientes */}
                {detalle.sesiones?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Últimas limpiezas</h3>
                    <div className="space-y-1.5">
                      {detalle.sesiones.slice(0, 5).map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{s.property_name || s.property_id}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{s.session_date}</span>
                            <span className={s.completed_at ? 'text-green-500' : s.started_at ? 'text-blue-500' : 'text-yellow-500'}>
                              {s.completed_at ? '✓' : s.started_at ? '⟳' : '○'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Facturas */}
                {detalle.facturas?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Últimas facturas</h3>
                    <div className="space-y-2">
                      {detalle.facturas.map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 font-medium">{f.numero_factura}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{Number(f.total).toFixed(2)} €</span>
                            <span className={
                              f.estado === 'pagada' ? 'text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full' :
                              f.estado === 'emitida' ? 'text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full' :
                              f.estado === 'vencida' ? 'text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full' :
                              'text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full'
                            }>{f.estado}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Acceso a la intranet del cliente */}
                <div className="bg-indigo-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">🔑 Acceso a su intranet</p>
                  <p className="text-xs text-indigo-400 mb-2">
                    Envía al cliente por email el enlace a su zona privada (estado de limpiezas, fotos, facturas).
                  </p>
                  <button onClick={() => enviarAcceso(detalle.cliente)} disabled={enviandoAcceso === detalle.cliente?.id}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                    {enviandoAcceso === detalle.cliente?.id ? 'Enviando…' : '✉️ Enviar acceso a la intranet'}
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setDetalle(null); abrirEditar(detalle.cliente) }}
                    className="flex-1 border border-indigo-200 text-indigo-600 py-2.5 rounded-xl text-sm font-medium">
                    Editar
                  </button>
                  <button onClick={() => setDetalle(null)}
                    className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium">
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

