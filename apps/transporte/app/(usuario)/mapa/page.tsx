import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listPosicionesUltimas, listPortesDeServicios } from '@/lib/transporte-repo'
import MapaOperador from './MapaOperador'

export const dynamic = 'force-dynamic'

export default async function MapaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [posiciones, portes] = await Promise.all([
    listPosicionesUltimas(session.id),
    listPortesDeServicios(session.id),
  ])

  // Ruta = paradas con coordenadas (para dibujar y para el modo simulación).
  const ruta = portes
    .flatMap((p) => p.paradas)
    .filter((pa) => pa.lat != null && pa.lng != null)
    .map((pa) => ({ lat: pa.lat as number, lng: pa.lng as number, nombre: pa.direccion, tipo: pa.tipo }))

  return <MapaOperador posicionesIniciales={posiciones} ruta={ruta} />
}
