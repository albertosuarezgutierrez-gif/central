import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { listFlotaHolding } from '@/lib/flota-holding'
import MapaHolding from './MapaHolding'

export const dynamic = 'force-dynamic'

export default async function FlotaMapaPage() {
  let admin: Awaited<ReturnType<typeof getAdmin>> = null
  try {
    admin = await getAdmin()
  } catch {
    admin = null
  }
  if (!admin) redirect('/dashboard')

  const posiciones = await listFlotaHolding()

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '2px' }}>🛰️ Flota del holding</h1>
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
          Posición en vivo de los vehículos de todas las sociedades del grupo
        </div>
      </div>
      <MapaHolding posicionesIniciales={posiciones} />
    </main>
  )
}
