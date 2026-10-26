import Wordmark from '@/components/Wordmark'
import { estiloMarca } from '@/lib/branding'
import { CoMarca, PieAsegura } from '@/components/MarcaAsegura'
import { estiloMarcaEmpresa } from '@/lib/marca-asegura'
import CambiadorEmpresa from '@/components/CambiadorEmpresa'
import AdminNav from '@/components/AdminNav'

/**
 * Marco del panel del responsable: sidebar + contenido. Presentacional puro: lo monta UNA vez
 * `app/admin/layout.tsx` con el branding de la empresa de la sesión. NO es barrera de seguridad:
 * cada page sigue llamando a `getSesion()` y filtrando por su `empresa_id`.
 */
export default function AdminShell({ children, logoUrl, nombreEmpresa, colorPrimario, tieneFichaje, marcaAsegura = false }: { marcaAsegura?: boolean; children: React.ReactNode; logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  return (
    <div className={`min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)]${marcaAsegura ? ' marca-asegura' : ''}`} style={(marcaAsegura ? estiloMarcaEmpresa(true, colorPrimario) : estiloMarca(colorPrimario)) as React.CSSProperties}>
      <aside className="border-b border-line bg-paper-2 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex flex-wrap items-center gap-3 p-4 md:min-h-full md:flex-col md:flex-nowrap md:items-start">
          {marcaAsegura
            ? <CoMarca logoUrl={logoUrl} nombre={nombreEmpresa} alto={22} className="shrink-0 md:mb-2 md:items-start" />
            : logoUrl
            ? <img src={logoUrl} alt={nombreEmpresa ?? 'Logo'} className="max-h-16 w-auto max-w-[180px] shrink-0 object-contain md:mb-3" />
            : <Wordmark className="shrink-0 text-xl md:mb-2" />}
          {/* En móvil el nav va en su propia fila a todo ancho (order-last + basis-full):
              compartiendo fila con el cambiador de empresa, este se comía el hueco y el nav
              quedaba a 0 px — sin menú. min-w-0 deja actuar al overflow-x-auto. */}
          <AdminNav tieneFichaje={tieneFichaje} />
          <div className="ml-auto min-w-0 max-w-[60%] md:ml-0 md:mt-auto md:w-full md:max-w-none"><CambiadorEmpresa /></div>
        </div>
      </aside>
      <main className="mx-auto w-full min-w-0 max-w-[1280px] p-4 md:p-6 lg:p-8">{children}{marcaAsegura && <PieAsegura />}</main>
    </div>
  )
}
