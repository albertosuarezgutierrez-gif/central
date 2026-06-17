import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import SistemaClient from './SistemaClient'

export const dynamic = 'force-dynamic'

export default async function SistemaPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <SistemaClient />
}
