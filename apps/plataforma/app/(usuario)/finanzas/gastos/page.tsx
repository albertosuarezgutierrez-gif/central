import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import GastosPageClient from './GastosPageClient'

export const dynamic = 'force-dynamic'

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; desde?: string; hasta?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const year = parseInt(params.year || '') || new Date().getFullYear()
  const quarter = parseInt(params.quarter || '0') || 0
  const desde = params.desde || ''
  const hasta = params.hasta || ''

  return <GastosPageClient year={year} quarter={quarter} desde={desde} hasta={hasta} />
}
