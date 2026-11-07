import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import EmpresasClient from './EmpresasClient'

export const dynamic = 'force-dynamic'

// «Mi empresa» (empresa.grupoasegura.es) desde el panel: herramientas por empresa, dueño que firma, accesos y contrato de encargo.
export default async function OperadorEmpresasPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <EmpresasClient operador={admin.email} />
}
