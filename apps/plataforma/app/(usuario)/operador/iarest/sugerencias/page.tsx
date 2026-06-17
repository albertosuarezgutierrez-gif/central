import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import SugerenciasClient from './SugerenciasClient'

export const dynamic = 'force-dynamic'

export default async function SugerenciasPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <SugerenciasClient />
}
