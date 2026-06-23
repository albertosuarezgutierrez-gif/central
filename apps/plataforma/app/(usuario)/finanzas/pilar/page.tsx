import { requireSession } from '@/lib/session'
import { getResumenPilar } from '@/lib/finanzas'
import PilarClient from './PilarClient'

export const dynamic = 'force-dynamic'

export default async function PilarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>
}) {
  const session = await requireSession()
  const sp = await searchParams
  const year = parseInt(sp.year ?? '') || new Date().getFullYear()
  const quarter = parseInt(sp.q ?? '') || 0

  const resumen = await getResumenPilar(session.id, year, quarter).catch(() => null)

  return <PilarClient initialData={resumen} year={year} quarter={quarter} />
}
