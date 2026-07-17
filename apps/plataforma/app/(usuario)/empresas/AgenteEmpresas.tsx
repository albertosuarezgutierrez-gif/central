'use client'
import { useState } from 'react'

interface Turno {
  rol: 'user' | 'bot'
  texto: string
}

export default function AgenteEmpresas({ provincia }: { provincia: string }) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar() {
    const pregunta = q.trim()
    if (!pregunta || cargando) return
    setTurnos((t) => [...t, { rol: 'user', texto: pregunta }])
    setQ('')
    setCargando(true)
    try {
      const r = await fetch('/api/empresas/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, provincia: provincia || undefined }),
      })
      const j = await r.json()
      setTurnos((t) => [...t, { rol: 'bot', texto: j.text || j.error || 'Sin respuesta.' }])
    } catch {
      setTurnos((t) => [...t, { rol: 'bot', texto: 'No se pudo conectar.' }])
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, background: 'var(--surface)', marginTop: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>🤖 Pregúntale al agente</div>
      <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 8 }}>
        {turnos.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Ej.: «las de Alicante en concurso», «las 5 más graves», «¿cuántas disoluciones hay?». (Sector y facturación llegan con el enriquecimiento.)
          </div>
        )}
        {turnos.map((t, i) => (
          <div
            key={i}
            style={{
              justifySelf: t.rol === 'user' ? 'end' : 'start',
              maxWidth: '85%',
              background: t.rol === 'user' ? 'var(--primary-light)' : 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '8px 11px',
              fontSize: 14,
              whiteSpace: 'pre-wrap',
            }}
          >
            {t.texto}
          </div>
        ))}
        {cargando && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Pensando…</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar()
          }}
          placeholder="Escribe tu pregunta…"
          style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button
          onClick={enviar}
          disabled={cargando}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: cargando ? 'default' : 'pointer' }}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
