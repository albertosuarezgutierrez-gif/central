import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import ClientesClient from './ClientesClient'

export const dynamic = 'force-dynamic'

export default async function OperadorClientesPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  return <ClientesClient operador={admin.email} />
}
