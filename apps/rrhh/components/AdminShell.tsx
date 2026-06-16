import Wordmark from '@/components/Wordmark'

type NavKey = 'empleados' | 'solicitudes' | 'cuenta'

/** Marco del panel del responsable: sidebar + contenido. Presentacional puro. */
export default function AdminShell({ activo, children }: { activo: NavKey; children: React.ReactNode }) {
  const item = (key: NavKey, href: string, label: string) => (
    <a
      href={href}
      className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium no-underline ${
        activo === key ? 'bg-accent text-white' : 'text-ink-2 hover:bg-paper-2'
      }`}
    >
      {label}
    </a>
  )
  return (
    <div className="min-h-screen md:grid md:grid-cols-[212px_1fr]">
      <aside className="flex flex-col gap-1 border-b border-line bg-paper-2 p-4 md:border-b-0 md:border-r">
        <Wordmark className="mx-1 mb-4 text-xl" />
        <nav className="flex flex-row gap-1 md:flex-col">
          {item('empleados', '/admin/empleados', 'Empleados')}
          {item('solicitudes', '/admin/solicitudes', 'Solicitudes')}
          {item('cuenta', '/admin/cuenta', 'Mi cuenta')}
          <a
            href="/manual.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-ink-2 no-underline hover:bg-paper-2 md:mt-auto"
          >
            📖 Manual
          </a>
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-3xl p-6">{children}</main>
    </div>
  )
}
