import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { solicitudesEmpresa } from '@/lib/solicitudes'
import { getBranding } from '@/lib/empresa'
import SolicitudesClient from './SolicitudesClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const [solicitudes, branding] = await Promise.all([solicitudesEmpresa(empresa_id), getBranding(empresa_id)])
  return <SolicitudesClient inicial={JSON.parse(JSON.stringify(solicitudes))} logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje} />
}
