import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import TradingDashboard from './TradingDashboard'

export const dynamic = 'force-dynamic'

export default async function TradingPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  return <TradingDashboard />
}
