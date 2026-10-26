import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import AdminShell from '@/components/AdminShell'
import AvisosAdminBanner from '@/components/AvisosAdminBanner'
import { listarAvisosAdmin } from '@/lib/avisos-admin'
import { datosCabeceraResponsable } from '@/lib/empresas-usuario'
import { urlPortalAsegura } from '@/lib/marca-asegura'

// Marco común del panel: logo de la empresa ACTIVA de la sesión, leído en servidor una vez. La marca es SIEMPRE Grupo
// ASegura (no cambia al cambiar de empresa: solo cambia el logo del cliente).
// 🚨 Esto NO es la barrera de seguridad: un layout no se re-ejecuta en cada navegación cliente y
// los route handlers (/api/admin/*) no pasan por él. Cada page sigue llamando a getSesion() y
// filtrando por SU empresa_id. El cambio de empresa (CabeceraApp) recarga la página entera,
// así que el branding se vuelve a leer con la empresa nueva.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let s: Awaited<ReturnType<typeof getSesion>>
  try { s = await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const [branding, avisos, usuario] = await Promise.all([
    getBranding(s.empresa_id), listarAvisosAdmin(s.empresa_id), datosCabeceraResponsable(s.usuario_id),
  ])
  return (
    <AdminShell logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} tieneFichaje={branding.tiene_fichaje}
      urlSeguros={urlPortalAsegura(usuario.email, process.env.ASEGURA_PORTAL_URL)} empresas={usuario.empresas} empresaActualId={s.empresa_id}>
      <AvisosAdminBanner avisos={avisos} />
      {children}
    </AdminShell>
  )
}
