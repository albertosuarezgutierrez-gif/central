import { getSesion, AuthError } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/empresa'
import CalendarioClient from './CalendarioClient'

export default async function CalendarioPage() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const branding = await getBranding(empresa_id)
  return <CalendarioClient logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje} />
}
