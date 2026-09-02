'use client'
import { useState } from 'react'
import { fechaHoraEs, type AnotacionHistorial } from '@/lib/ficha-asegura'

/**
 * 🕘 Historial de la ficha (edición, alta, relaciones, documentos…), al final
 * de la página, PLEGADO y con montaje perezoso: un `<details>` cerrado crea
 * igualmente todo su DOM, así que el contenido solo se renderiza al abrir.
 *
 * Tres estados, no dos: `null` = no se ha podido leer (asegura no lo manda o
 * su consulta falló) · `[]` = se miró y no hay anotaciones · con filas = el
 * historial. El primero NUNCA se pinta como «sin anotaciones».
 */
export default function Historial({ historial }: { historial: AnotacionHistorial[] | null }) {
  const [abierto, setAbierto] = useState(false)
  const resumen =
    historial === null ? 'no se ha podido leer'
      : historial.length === 0 ? 'sin anotaciones'
        : `${historial.length}${historial.length >= 50 ? ' últimas' : ''}`

  return (
    <div style={{ border: `1px ${historial === null ? 'dashed' : 'solid'} var(--border)`, borderRadius: 12, padding: 14 }}>
      <details onToggle={(e) => setAbierto((e.currentTarget as HTMLDetailsElement).open)}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, minHeight: 24 }}>
          🕘 Historial <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· {resumen}</span>
        </summary>
        {abierto && <Contenido historial={historial} />}
      </details>
    </div>
  )
}

function Contenido({ historial }: { historial: AnotacionHistorial[] | null }) {
  if (historial === null) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
        No se ha podido leer el historial: asegura no lo manda (versión anterior) o su consulta ha
        fallado. No lo leas como «no ha pasado nada en esta ficha».
      </p>
    )
  }
  if (historial.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
        Sin anotaciones todavía (el historial empezó el 02/09/2026).
      </p>
    )
  }
  return (
    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
      {historial.map((h) => (
        <li key={h.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fechaHoraEs(h.fecha)}</span>
          <span
            style={{
              fontSize: 11, padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
              background: 'var(--primary-light)', color: 'var(--primary)',
            }}
          >
            {h.tipo.replace(/_/g, ' ')}
          </span>
          <span style={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{h.texto}</span>
        </li>
      ))}
    </ul>
  )
}
