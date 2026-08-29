import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import PendientesClient from './PendientesClient'

export const dynamic = 'force-dynamic'

// /expenses/pendientes — la bandeja de revisión del agente de facturas.
//
// Esta ruta es la que el aviso de Telegram enlaza desde el día uno (`lib/agente-facturas/
// avisos.ts`), y hasta el 29/08/2026 era un 404: nunca se construyó. Si se mueve, hay que mover
// también ese enlace — lo vigila `lib/agente-facturas/avisos-enlace.test.ts`.
export default async function PendientesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🧾 Facturas por revisar</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0 20px' }}>
        Lo que el agente leyó del correo pero no supo imputar solo. Al confirmar, <b>aprende la
        regla</b> del proveedor: a la segunda confirmación las siguientes entran solas.
      </p>
      <PendientesClient />
    </div>
  )
}
