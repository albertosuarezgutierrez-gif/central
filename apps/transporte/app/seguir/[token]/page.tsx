import { getSeguimiento } from '@/lib/transporte-repo'
import SeguirCliente from './SeguirCliente'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function SeguirPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getSeguimiento(token)
  if (!data) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
        <h2>Enlace de seguimiento no válido</h2>
      </main>
    )
  }
  const ruta = data.servicio.portes
    .flatMap((p: any) => p.paradas)
    .filter((pa: any) => pa.lat != null && pa.lng != null)
    .map((pa: any) => ({ lat: Number(pa.lat), lng: Number(pa.lng), nombre: pa.direccion, tipo: pa.tipo }))
  const posicionesIniciales = data.posiciones.map((p) => ({
    vehiculoId: p.vehiculoId,
    nombre: 'Tu pedido',
    lat: p.lat,
    lng: p.lng,
    velocidadKmh: p.velocidadKmh,
    capturadoAt: p.capturadoAt,
  }))
  return (
    <SeguirCliente
      token={token}
      cliente={data.servicio.clienteNombre ?? null}
      destino={data.servicio.destino ?? null}
      ruta={ruta}
      posicionesIniciales={posicionesIniciales}
    />
  )
}
