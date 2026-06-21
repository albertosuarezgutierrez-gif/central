import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import CrmClient from './CrmClient'

export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <CrmClient />
}
