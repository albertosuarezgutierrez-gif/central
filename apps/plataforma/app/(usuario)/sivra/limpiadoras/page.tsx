import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import LimpiadoresClient from './LimpiadoresClient'

export const dynamic = 'force-dynamic'

export default async function LimpiadoresPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <LimpiadoresClient />
}
