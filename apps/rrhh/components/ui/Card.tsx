import type { HTMLAttributes } from 'react'

/** Tarjeta base del panel (borde + fondo + padding). `className` se añade, no sustituye. */
export default function Card({ as: Tag = 'div', className = '', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' }) {
  return <Tag className={`rounded-card border border-line bg-card p-4 ${className}`.trim()} {...rest} />
}
