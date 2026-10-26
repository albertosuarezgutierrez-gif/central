/** Solicitudes y Calendario son dos vistas de lo mismo: una sola entrada de menú con dos pestañas. */
export default function PestanasSolicitudes({ activa }: { activa: 'lista' | 'calendario' }) {
  const base = 'inline-flex min-h-[44px] items-center rounded-[12px] px-4 text-sm font-bold no-underline'
  return (
    <nav aria-label="Vista de solicitudes" className="mb-4 flex flex-wrap gap-2">
      <a href="/admin/solicitudes" aria-current={activa === 'lista' ? 'page' : undefined}
        className={`${base} ${activa === 'lista' ? 'bg-accent text-card' : 'bg-paper-2 text-ink-2 hover:bg-line'}`}>Lista</a>
      <a href="/admin/calendario" aria-current={activa === 'calendario' ? 'page' : undefined}
        className={`${base} ${activa === 'calendario' ? 'bg-accent text-card' : 'bg-paper-2 text-ink-2 hover:bg-line'}`}>Calendario</a>
    </nav>
  )
}
