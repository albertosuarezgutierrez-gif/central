import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { cargarCarteraCohetesUI } from '@/lib/trading/cartera-cohetes-io'
import { getCarteraReal, getTrackCartera } from '@/lib/trading/cartera-real-io'
import TradingDashboard from './TradingDashboard'

export const dynamic = 'force-dynamic'

export default async function TradingPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  // 💼 Cartera real (IBKR) SOLO aquí, con sesión y scopeada por cuenta — la vista de invitado
  // (/invitado/trading) no pasa la prop y no la ve: es el dinero real de Alberto. Un fallo de
  // BD NO se disfraza de «sin sincronizar» ni de cartera vacía: viaja como 'error' y se declara.
  const [carteraCohetes, carteraReal, trackCartera] = await Promise.all([
    cargarCarteraCohetesUI().catch(() => null),
    getCarteraReal(s.id).catch(() => 'error' as const),
    // 📈 Serie para la curva de evolución. Un fallo de lectura NO se pinta como «aún no hay
    // puntos» (sería un «no lo he mirado» disfrazado de «no hay»): viaja como 'error'.
    getTrackCartera(s.id).catch(() => 'error' as const),
  ])
  return <TradingDashboard carteraCohetes={carteraCohetes} carteraReal={carteraReal} trackCartera={trackCartera} />
}
