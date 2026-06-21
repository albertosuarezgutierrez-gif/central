import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import SoporteClient from './SoporteClient'

export const dynamic = 'force-dynamic'

export default async function SoportePage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <SoporteClient />
}
