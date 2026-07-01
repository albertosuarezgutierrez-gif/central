import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import ProyeccionClient from './ProyeccionClient'

export const dynamic = 'force-dynamic'

export default async function ProyeccionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const year = parseInt(params.year || '') || new Date().getFullYear()

  return <ProyeccionClient year={year} />
}
