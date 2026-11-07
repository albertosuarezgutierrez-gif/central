'use client'
import { useState } from 'react'

/** Elige la empresa (revalidada en BD por /api/auth/elegir) y abre su bandeja de pendientes. */
export function AbrirEmpresa({ empresaId, destino = '/gestoria/pendientes', texto = 'Abrir pendientes' }: { empresaId: string; destino?: string; texto?: string }) {
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  async function abrir() {
    setError(''); setCargando(true)
    const r = await fetch('/api/auth/elegir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ empresaId }) }).catch(() => null)
    setCargando(false)
    if (!r || !r.ok) { setError('No tienes acceso a esa empresa.'); return }
    window.location.href = destino
  }
  return (
    <div>
      <button type="button" className="btn" onClick={abrir} disabled={cargando}>{cargando ? 'Abriendo…' : texto}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
