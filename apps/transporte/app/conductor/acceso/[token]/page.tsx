import { getConductorPorToken } from '@/lib/transporte-repo'
import ConductorApp from './ConductorApp'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ConductorAccesoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getConductorPorToken(token)
  if (!data) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: 24 }}>
        <h2>Enlace no válido</h2>
        <p className="muted">Pide a tu empresa un enlace de acceso actualizado.</p>
      </main>
    )
  }
  const portes = data.portes.map((p: any) => ({
    id: p.id,
    vehiculoNombre: p.vehiculo?.nombre ?? 'Vehículo',
    cliente: p.servicio?.clienteNombre ?? null,
    origen: p.servicio?.origen ?? null,
    destino: p.servicio?.destino ?? null,
    estado: p.estado,
  }))
  return <ConductorApp token={token} conductor={data.conductor.nombre} portes={portes} />
}
