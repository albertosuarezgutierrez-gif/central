import { PieAsegura } from '@/components/MarcaAsegura'
import CabeceraApp from '@/components/CabeceraApp'
import AdminNav from '@/components/AdminNav'

/**
 * Marco del panel del responsable: cabecera común (Herramientas · Seguros, selector de empresa) + menú lateral + contenido.
 * Presentacional puro: lo monta UNA vez `app/admin/layout.tsx`. NO es barrera de seguridad:
 * cada page sigue llamando a `getSesion()` y filtrando por su `empresa_id`.
 */
export default function AdminShell({ children, logoUrl, nombreEmpresa, tieneFichaje, urlSeguros, empresas, empresaActualId }: {
  children: React.ReactNode
  logoUrl?: string | null
  nombreEmpresa?: string | null
  tieneFichaje?: boolean
  urlSeguros: string
  empresas: { id: string; nombre: string }[]
  empresaActualId: string
}) {
  return (
    <div className="min-h-screen">
      <CabeceraApp perfil="responsable" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} urlSeguros={urlSeguros} empresas={empresas} empresaActualId={empresaActualId} />
      <div className="mx-auto w-full max-w-[1520px] md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-paper-2 p-3 md:sticky md:top-0 md:max-h-screen md:self-start md:overflow-y-auto md:border-b-0 md:border-r md:p-4">
          {/* En móvil el nav va en su propia fila a todo ancho, con scroll horizontal (min-w-0). */}
          <AdminNav tieneFichaje={tieneFichaje} />
        </aside>
        <main className="mx-auto w-full min-w-0 max-w-[1280px] p-4 md:p-6 lg:p-8">{children}<PieAsegura /></main>
      </div>
    </div>
  )
}
