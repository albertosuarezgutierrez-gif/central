import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import SuscripcionesClient from './SuscripcionesClient'

export const dynamic = 'force-dynamic'

export default async function SuscripcionesPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <SuscripcionesClient />
}
