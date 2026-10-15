import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { puerto } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/estadisticas — estado de los bots (7/30 días por compañía × ramo × versión): trabajos,
 * % con precio, % atascado/humano/error, tiempo medio y top de claves de atasco. Solo agregados; sin datos personales.
 * Lo sirve el puerto de operador de asegura. Solo lectura.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await puerto('estadisticas', { method: 'GET' }, 30_000)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
