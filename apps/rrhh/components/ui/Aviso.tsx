import type { ReactNode } from 'react'

export type TonoAviso = 'info' | 'ok' | 'aviso' | 'alerta'

const TONO: Record<TonoAviso, string> = {
  info: 'border-accent/30 bg-accent-soft text-ink',
  ok: 'border-ok/30 bg-ok/10 text-ink',
  aviso: 'border-warn/40 bg-warn/10 text-ink',
  alerta: 'border-alert/40 bg-alert/10 text-ink',
}
const MARCA: Record<TonoAviso, string> = { info: 'text-accent', ok: 'text-ok', aviso: 'text-warn', alerta: 'text-alert' }
// Icono SVG (no emoji): el mismo trazo en todos los sistemas operativos.
const ICONO: Record<TonoAviso, string> = {
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  ok: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  aviso: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0M12 9v4M12 17h.01',
  alerta: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M15 9l-6 6M9 9l6 6',
}

/** Aviso en línea (info / ok / aviso / alerta) con tokens del tema: ni `amber-*` ni `red-*` crudos, ni emojis. */
export default function Aviso({ tono = 'info', titulo, role, className = '', children }: {
  tono?: TonoAviso; titulo?: ReactNode; role?: 'alert' | 'status'; className?: string; children?: ReactNode
}) {
  return (
    <section role={role ?? (tono === 'alerta' || tono === 'aviso' ? 'alert' : 'status')}
      className={`flex gap-3 rounded-[12px] border p-3 text-sm ${TONO[tono]} ${className}`.trim()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${MARCA[tono]}`}><path d={ICONO[tono]} /></svg>
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-bold">{titulo}</p>}
        {children}
      </div>
    </section>
  )
}
