import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import CrecimientoClient from './CrecimientoClient'

export const dynamic = 'force-dynamic'

export default async function CrecimientoPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <CrecimientoClient />
}
