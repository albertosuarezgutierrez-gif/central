import { redirect } from 'next/navigation'
import { Satellite } from 'lucide-react'
import { PageHeader } from '@/components/ui'
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
      <PageHeader
        titulo="Flota del holding"
        sub="Posición en vivo de los vehículos de todas las sociedades del grupo"
        icono={<Satellite size={20} strokeWidth={1.75} />}
      />
      <MapaHolding posicionesIniciales={posiciones} />
    </main>
  )
}
