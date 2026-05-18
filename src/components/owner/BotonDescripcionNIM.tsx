'use client'
import { useState } from 'react'

interface Props {
  productoId: string
  descripcionActual?: string | null
  sh: () => Record<string, string>
  onGuardada?: (desc: string | null) => void
}

export default function BotonDescripcionNIM({ productoId, descripcionActual, sh, onGuardada }: Props) {
  const [loading, setLoading] = useState(false)
  const [desc, setDesc] = useState(descripcionActual ?? '')

  async function generar() {
    setLoading(true)
    try {
      const res = await fetch('/api/owner/carta/generar-descripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ producto_id: productoId }),
      })
      const data = await res.json()
      if (data.descripcion) { setDesc(data.descripcion); onGuardada?.(data.descripcion) }
    } finally { setLoading(false) }
  }

  async function borrar() {
    await fetch('/api/owner/carta/generar-descripcion', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ producto_id: productoId }),
    })
    setDesc(''); onGuardada?.(null)
  }

  return (
    <div style={{ marginTop: 6 }}>
      {desc && (
        <p style={{
          fontSize: 12, color: '#9A8D7C', fontStyle: 'italic',
          margin: '0 0 6px 0', padding: '5px 10px',
          background: 'rgba(232,163,59,0.08)', borderRadius: 5,
          borderLeft: '2px solid #E8A33B', lineHeight: 1.4,
        }}>
          {desc}
        </p>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={generar} disabled={loading}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 5, border: 'none',
            background: '#D9442B', color: '#F6F1E7', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1, fontFamily: "'Inter Tight',system-ui,sans-serif",
          }}
        >
          {loading ? 'Generando…' : desc ? '↺ Regenerar ✨' : '✨ Descripción IA'}
        </button>
        {desc && (
          <button onClick={borrar} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid #D8CDB6',
            background: 'transparent', color: '#9A8D7C', cursor: 'pointer',
            fontFamily: "'Inter Tight',system-ui,sans-serif",
          }}>
            Borrar
          </button>
        )}
      </div>
    </div>
  )
}
