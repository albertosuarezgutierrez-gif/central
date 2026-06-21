import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import FinanzasClient from './FinanzasClient'

export const dynamic = 'force-dynamic'

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const year = parseInt(params.year || '') || new Date().getFullYear()
  const quarter = parseInt(params.quarter || '0') || 0

  let data = null
  try {
    data = await getResumenFinanciero(session.id, year, quarter)
  } catch (e) {
    console.error('[finanzas/page]', e)
  }

  return <FinanzasClient initialData={data} year={year} quarter={quarter} />
}
