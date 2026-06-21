import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { getEmpleadosRrhh } from '@/lib/rrhh-operador'
import EmpleadosRrhhClient from './EmpleadosRrhhClient'

export const dynamic = 'force-dynamic'

export default async function OperadorRrhhEmpleadosPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  const empleados = await getEmpleadosRrhh()
  return <EmpleadosRrhhClient empleados={empleados} />
}
