'use client'
import { useState } from 'react'

// <details> con MONTAJE PEREZOSO: el contenido solo se renderiza al abrir. Un <details> cerrado
// normal igualmente crea todo su DOM (regla de rendimiento del monorepo) — aquí los hijos no se
// montan hasta el primer toggle, así que un client component hijo (fetch de precios, Recharts…)
// no paga nada mientras nadie lo mire.
export default function DetallePerezoso({ resumen, children, style }: {
  resumen: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <details style={style} onToggle={e => setAbierto((e.target as HTMLDetailsElement).open)}>
      <summary style={{ fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{resumen}</summary>
      {abierto ? children : null}
    </details>
  )
}
