'use client'
import { useState, type ReactNode } from 'react'

/**
 * Un bloque secundario de la ficha de póliza, cerrado por defecto.
 *
 * El contenido NO se monta hasta que se abre: un `<details>` cerrado crea su
 * DOM igualmente (regla de rendimiento UI del repo), y aquí dentro hay piezas
 * que piden datos al montarse. Una vez abierto se queda montado.
 */
export default function Plegable({ titulo, resumen, children }: {
  titulo: string
  /** Una línea que dice qué hay dentro sin abrirlo. */
  resumen?: string
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <details
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setAbierto(true) }}
      style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '4px 16px' }}
    >
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 700, fontSize: 14 }}>
        {titulo}
        {resumen && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>{resumen}</span>}
      </summary>
      {abierto && <div style={{ padding: '4px 0 14px' }}>{children}</div>}
    </details>
  )
}
