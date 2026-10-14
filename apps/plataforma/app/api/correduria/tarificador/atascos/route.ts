import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { puertoRobustez } from '@/lib/tarificador-atascos-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/atascos — «Bots atascados» (F2, 14/10/2026): trabajos del bot que esperan que Alberto
 * elija un elemento numerado, y compañías/ramos en PAUSA tras varios fallos. Lo sirve el puerto de operador de asegura (sin
 * selectores ni datos personales; sin captura: va aparte, por atasco). Solo lectura.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await puertoRobustez('atascos', { method: 'GET' })
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
