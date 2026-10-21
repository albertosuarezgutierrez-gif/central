import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import AdminShell from '@/components/AdminShell'

// Marco común del panel: branding de la empresa ACTIVA de la sesión, leído en servidor una vez.
// 🚨 Esto NO es la barrera de seguridad: un layout no se re-ejecuta en cada navegación cliente y
// los route handlers (/api/admin/*) no pasan por él. Cada page sigue llamando a getSesion() y
// filtrando por SU empresa_id. El cambio de empresa (CambiadorEmpresa) recarga la página entera,
// así que el branding se vuelve a leer con la empresa nueva.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const branding = await getBranding(empresa_id)
  return (
    <AdminShell logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje}>
      {children}
    </AdminShell>
  )
}
