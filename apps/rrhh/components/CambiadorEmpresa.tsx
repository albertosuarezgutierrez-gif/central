'use client'
import { useState, useEffect } from 'react'

type Empresa = { id: string; nombre: string; logo_path: string | null }

export default function CambiadorEmpresa() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [actual, setActual] = useState('')
  const [open, setOpen] = useState(false)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    fetch('/api/admin/mis-empresas')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) { setEmpresas(j.empresas ?? []); setActual(j.empresa_actual ?? '') } })
      .catch(() => {})
  }, [])

  if (empresas.length < 2) return null

  async function cambiar(id: string) {
    if (id === actual || cargando) return
    setCargando(true)
    await fetch('/api/auth/cambiar-empresa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ empresa_id: id }),
    })
    window.location.reload()
  }

  const actualEmpresa = empresas.find(e => e.id === actual)

  return (
    <div className="relative md:mt-2 md:border-t md:border-line md:pt-2">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={cargando}
        className="w-full flex items-center gap-2 rounded-[10px] bg-transparent px-3 py-2 text-xs text-ink-3 hover:bg-paper-2 text-left"
      >
        <span className="flex-1 truncate font-medium text-ink-2">{actualEmpresa?.nombre ?? '…'}</span>
        <span className="shrink-0">{cargando ? '…' : '⇅'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 max-w-[90vw] rounded-[10px] md:left-0 md:right-auto md:top-auto md:bottom-full md:mt-0 md:mb-1 md:w-full border border-line bg-card shadow-sm z-20 overflow-hidden">
          {empresas.map(e => (
            <button
              key={e.id}
              onClick={() => { setOpen(false); cambiar(e.id) }}
              className={`w-full rounded-none bg-transparent text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-paper-2 ${e.id === actual ? 'font-semibold text-ink' : 'text-ink-2'}`}
            >
              {e.logo_path && (e.logo_path.startsWith('/') || e.logo_path.startsWith('http'))
                ? <img src={e.logo_path} alt={e.nombre} className="h-4 w-auto max-w-[56px] object-contain shrink-0" />
                : null}
              <span className="truncate">{e.nombre}</span>
              {e.id === actual && <span className="ml-auto text-[10px] text-ink-3 shrink-0">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
