'use client'
import { useState } from 'react'

export function ElegirEmpresa({ empresas, actual }: { empresas: { id: string; nombre: string; rol: string }[]; actual: string | null }) {
  const [error, setError] = useState('')
  async function elegir(id: string) {
    setError('')
    const r = await fetch('/api/auth/elegir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ empresaId: id }) })
    if (!r.ok) { setError('No tienes acceso a esa empresa.'); return }
    window.location.href = '/'
  }
  return (
    <div className="lista">
      {empresas.map((e) => (
        <button key={e.id} type="button" className={e.id === actual ? 'btn' : 'btn btn-sec'} onClick={() => elegir(e.id)}>
          {e.nombre} · {e.rol === 'dueno' ? 'dueño' : 'gestor'}
        </button>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
