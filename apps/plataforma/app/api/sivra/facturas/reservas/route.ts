import { NextRequest, NextResponse } from 'next/server'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { buscarReservas } from '@/lib/sivra/facturas/listado'

export const dynamic = 'force-dynamic'

// GET /api/sivra/facturas/reservas?q= → reservas de los pisos de la cuenta (por id o nombre del huésped), para el alta manual.
export async function GET(req: NextRequest) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  return NextResponse.json({ reservas: await buscarReservas(g.cuentaId, req.nextUrl.searchParams.get('q') ?? '') }, { headers: { 'cache-control': 'no-store' } })
}
