import type { ReactNode } from 'react'

export type TonoChip = 'ok' | 'aviso' | 'alerta' | 'neutro' | 'marca'

const TONO: Record<TonoChip, string> = {
  ok: 'bg-ok/15 text-ok',
  aviso: 'bg-warn/15 text-warn',
  alerta: 'bg-alert/10 text-alert',
  neutro: 'bg-paper-2 text-ink-2',
  marca: 'bg-accent-soft text-accent-ink',
}

/** Etiqueta de estado (pastilla). Sustituye a los `rounded-full bg-…/10` hechos a mano en cada pantalla. */
export default function Chip({ tono = 'neutro', className = '', children }: { tono?: TonoChip; className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO[tono]} ${className}`.trim()}>{children}</span>
}
