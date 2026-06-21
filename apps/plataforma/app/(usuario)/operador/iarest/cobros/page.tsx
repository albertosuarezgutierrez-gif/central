import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import CobrosClient from './CobrosClient'

export const dynamic = 'force-dynamic'

export default async function CobroPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <CobrosClient />
}
