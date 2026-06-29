import { NextResponse } from 'next/server'
import { getSeguimiento } from '@/lib/transporte-repo'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getSeguimiento(token)
  if (!data) return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  const posiciones = data.posiciones.map((p) => ({
    vehiculoId: p.vehiculoId,
    nombre: 'Tu pedido',
    lat: p.lat,
    lng: p.lng,
    velocidadKmh: p.velocidadKmh,
    capturadoAt: p.capturadoAt,
  }))
  return NextResponse.json({ posiciones })
}
