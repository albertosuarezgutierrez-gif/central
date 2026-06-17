import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { consolidarPersonas } from '@/lib/personas'
import PersonasClient from './PersonasClient'

export const dynamic = 'force-dynamic'

export default async function OperadorPersonasPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  const data = await consolidarPersonas()
  return <PersonasClient {...data} />
}
