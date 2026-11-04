import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { puerto } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/estado — estado del tarificador por compañía × ramo (último precio y canal, ok/error del
 * bot en 7 y 30 días, último error REDACTADO, estado del bot) y gasto Avant2 del mes. Solo agregados; sin datos personales.
 * Lo sirve el puerto de operador de asegura. Solo lectura.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await puerto('estado', { method: 'GET' }, 30_000)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
