import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { getSolicitudesRrhh } from '@/lib/rrhh-operador'
import SolicitudesRrhhClient from './SolicitudesRrhhClient'

export const dynamic = 'force-dynamic'

export default async function OperadorRrhhSolicitudesPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  const solicitudes = await getSolicitudesRrhh()
  return <SolicitudesRrhhClient solicitudes={solicitudes} />
}
