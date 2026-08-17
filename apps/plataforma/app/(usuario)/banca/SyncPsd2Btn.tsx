'use client'

import { useState } from 'react'

// Botón «Sincronizar ahora» del panel del feed PSD2: dispara POST /api/banca/psd2/sync y
// muestra el desenlace REAL (insertados + avisos del banco), no un «hecho» genérico.
export default function SyncPsd2Btn() {
  const [estado, setEstado] = useState<'idle' | 'corriendo' | 'hecho' | 'error'>('idle')
  const [detalle, setDetalle] = useState('')

  async function sincronizar() {
    setEstado('corriendo')
    setDetalle('')
    try {
      const res = await fetch('/api/banca/psd2/sync', { method: 'POST' })
      const j = await res.json().catch(() => null) as { insertados?: number; avisos?: string[]; error?: string } | null
      if (!res.ok || !j) {
        setEstado('error')
        setDetalle(j?.error ?? `HTTP ${res.status}`)
        return
      }
      setEstado('hecho')
      const partes = [`${j.insertados ?? 0} movimiento(s) nuevo(s)`]
      if (j.avisos && j.avisos.length > 0) partes.push(...j.avisos)
      setDetalle(partes.join(' · '))
      if ((j.insertados ?? 0) > 0) setTimeout(() => window.location.reload(), 1500)
    } catch {
      setEstado('error')
      setDetalle('No se pudo lanzar el sync')
    }
  }

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        onClick={sincronizar}
        disabled={estado === 'corriendo'}
        style={{
          fontSize: '12px', padding: '6px 10px', minHeight: '32px', cursor: 'pointer',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', color: 'var(--text)',
        }}
      >
        {estado === 'corriendo' ? '⏳ Sincronizando…' : '🔄 Sincronizar ahora'}
      </button>
      {detalle && (
        <div style={{ marginTop: '4px', fontSize: '12px', color: estado === 'error' ? 'var(--negative, #b91c1c)' : 'var(--muted)' }}>
          {estado === 'error' ? '❌ ' : ''}{detalle}
        </div>
      )}
    </div>
  )
}
