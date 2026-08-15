import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { getResumenActividad } from '@/lib/actividad-ialimp'
import ActividadClient from './ActividadClient'

export const dynamic = 'force-dynamic'

export default async function OperadorActividadPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  const data = await getResumenActividad()
  return <ActividadClient {...data} />
}
