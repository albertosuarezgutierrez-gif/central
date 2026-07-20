// Página de acceso INVITADO (amigos ven el «Laboratorio de inversión» sin cuenta, solo lectura). Fuera
// del grupo (usuario) → sin sidebar ni guard de sesión. El acceso se valida por token (tabla
// trading_acceso_token), vía cookie httpOnly. Mismo patrón que /invitado/empresas.
import { redirect } from 'next/navigation'
import { accesoTrading } from '@/lib/trading-acceso'
import TradingDashboard from '@/app/(usuario)/trading/TradingDashboard'

export const dynamic = 'force-dynamic'

export default async function InvitadoTradingPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams
  // Si llega ?token=, lo canjeamos por la cookie en la entrada (/api/trading/invitado) y volvemos limpio.
  if (sp.token) redirect(`/api/trading/invitado?token=${encodeURIComponent(sp.token)}`)

  const modo = await accesoTrading()
  if (modo !== 'invitado' && modo !== 'sesion') {
    return (
      <div style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center', color: 'var(--text)' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: 20 }}>Acceso no válido</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Este enlace de acceso no es correcto o ha caducado. Pide a Alberto el enlace actualizado.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 16px', color: 'var(--muted)', fontSize: 13 }}>
        📈 Laboratorio de inversión · <strong style={{ color: 'var(--text)' }}>acceso de invitado (solo lectura)</strong>
      </div>
      <TradingDashboard />
    </div>
  )
}
