import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Iconos de la correduría: lucide fino, nunca emojis (28/09/2026, Alberto:
 * «barre todos los emojis de la correduría»). Mismo trazo que la pestaña
 * Contactos y los botones de llamar/escribir: 14px junto a texto, 16px en
 * botones, trazo 1,75.
 */
export function Ico({ i: I, size = 14, color }: { i: LucideIcon; size?: number; color?: string }) {
  return <I size={size} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto', color }} />
}

/** Icono + texto en línea, alineados al centro. */
export const FILA: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5 }

export function ConIcono({ i, children, style, title, color }: {
  i: LucideIcon; children: ReactNode; style?: CSSProperties; title?: string; color?: string
}) {
  return <span style={{ ...FILA, ...(color ? { color } : {}), ...style }} title={title}><Ico i={i} />{children}</span>
}
