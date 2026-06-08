'use client'
import { useState, useEffect } from 'react'

export default function AlertasBadge() {
  const [alertas, setAlertas]   = useState<any[]>([])
  const [count, setCount]       = useState(0)
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  async function cargar() {
    try {
      const res  = await fetch('/api/admin/alertas')
      const data = await res.json()
      setAlertas(data.alertas || [])
      setCount(data.no_leidas || 0)
    } catch {}
  }

  async function marcarTodas() {
    setLoading(true)
    await fetch('/api/admin/alertas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todas: true })
    })
    setAlertas(a => a.map(x => ({ ...x, leida: true })))
    setCount(0)
    setLoading(false)
  }

  async function marcarUna(id: string) {
    await fetch('/api/admin/alertas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] })
    })
    setAlertas(a => a.map(x => x.id === id ? { ...x, leida: true } : x))
    setCount(c => Math.max(0, c - 1))
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-indigo-200 hover:text-white transition"
      >
        🔔
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel — fixed, full-width on mobile */}
          <div
            className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{
              top: '56px',
              left: '8px',
              right: '8px',
              maxWidth: '400px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Alertas</h3>
                {count > 0 && <p className="text-xs text-red-500">{count} sin leer</p>}
              </div>
              <div className="flex items-center gap-3">
                {count > 0 && (
                  <button
                    onClick={marcarTodas}
                    disabled={loading}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Leer todas
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {alertas.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <div className="text-2xl mb-1">✅</div>
                  Sin alertas pendientes
                </div>
              ) : (
                alertas.map(a => (
                  <div
                    key={a.id}
                    className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition"
                    style={{ opacity: a.leida ? 0.5 : 1 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 leading-tight">{a.titulo}</p>
                        {a.descripcion && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{a.descripcion}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(a.creada_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                      {!a.leida && (
                        <button
                          onClick={() => marcarUna(a.id)}
                          className="text-gray-300 hover:text-gray-500 text-lg flex-shrink-0"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
