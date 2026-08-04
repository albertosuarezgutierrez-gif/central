import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { cargarCarteraCohetesUI } from '@/lib/trading/cartera-cohetes-io'
import TradingDashboard from './TradingDashboard'

export const dynamic = 'force-dynamic'

export default async function TradingPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const carteraCohetes = await cargarCarteraCohetesUI().catch(() => null)
  return <TradingDashboard carteraCohetes={carteraCohetes} />
}
