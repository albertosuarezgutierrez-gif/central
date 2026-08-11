import Wordmark from '@/components/Wordmark'
import { estiloMarca } from '@/lib/branding'
import CambiadorEmpresa from '@/components/CambiadorEmpresa'

type NavKey = 'empleados' | 'solicitudes' | 'cuenta' | 'nominas' | 'calendario' | 'fichajes' | 'obras' | 'empresa' | 'prl'

/** Marco del panel del responsable: sidebar + contenido. Presentacional puro. */
export default function AdminShell({ activo, children, logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { activo: NavKey; children: React.ReactNode; logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const item = (key: NavKey, href: string, label: string) => (
    <a
      href={href}
      className={`flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium no-underline whitespace-nowrap ${
        activo === key ? 'bg-accent text-white' : 'text-ink-2 hover:bg-paper-2'
      }`}
    >
      {label}
    </a>
  )
  return (
    <div className="min-h-screen md:grid md:grid-cols-[212px_1fr]" style={estiloMarca(colorPrimario) as React.CSSProperties}>
      <aside className="border-b border-line bg-paper-2 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 p-4 md:flex-col md:items-start">
          {logoUrl
            ? <img src={logoUrl} alt={nombreEmpresa ?? 'Logo'} className="max-h-16 w-auto max-w-[180px] shrink-0 object-contain md:mb-3" />
            : <Wordmark className="shrink-0 text-xl md:mb-2" />}
          {/* min-w-0: sin él, el ancho mínimo automático del flex item lo fija la suma
              de los enlaces (whitespace-nowrap) → el overflow-x-auto no llega a activarse
              y era la PÁGINA entera la que se ensanchaba (~90 px de scroll lateral a 320 px). */}
          <nav className="flex min-w-0 flex-1 flex-row gap-1 overflow-x-auto md:w-full md:flex-col">
            {item('empleados', '/admin/empleados', 'Empleados')}
            {item('solicitudes', '/admin/solicitudes', 'Solicitudes')}
            {item('calendario', '/admin/calendario', 'Calendario')}
            {item('nominas', '/admin/nominas', 'Nóminas')}
            {item('prl', '/admin/prl', 'PRL')}
            {tieneFichaje && item('fichajes', '/admin/fichajes', 'Fichajes')}
            {tieneFichaje && item('obras', '/admin/obras', 'Obras')}
            {item('empresa', '/admin/empresa', 'Empresa')}
            <a href="/admin/cuenta"
              className={`flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium no-underline whitespace-nowrap ${
                activo === 'cuenta' ? 'bg-accent text-white' : 'text-ink-2 hover:bg-paper-2'
              }`}
            >
              Mi cuenta
            </a>
            <a
              href="/manual.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-ink-2 no-underline whitespace-nowrap hover:bg-paper-2"
            >
              📖 Manual
            </a>
          </nav>
          <CambiadorEmpresa />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-3xl p-4 md:p-6">{children}</main>
    </div>
  )
}
