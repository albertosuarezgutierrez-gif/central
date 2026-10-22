import { NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/cron-auth'
import { generarGastosPropuestos } from '@/lib/patrimonio/generar-gastos'
import { puertosGenerador } from '@/lib/patrimonio/generar-gastos-bd'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/patrimonio-gastos — genera los gastos `propuesto` de las plantillas de gasto fijo y de las cuotas de
 * derrama que ya tocan. Idempotente por `clave` (índice único en BD; P2002 tolerado): correrlo dos veces no duplica.
 * Autenticado con `CRON_SECRET` por `lib/cron-auth.ts` (tiempo constante, sin secreto no autoriza a nadie).
 * Lo generado NO cuenta hasta que la persona lo confirma (paso 7).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const hoy = new Date().toISOString().slice(0, 10)
  try {
    const r = await generarGastosPropuestos(puertosGenerador(), hoy)
    return NextResponse.json({ estado: r.errores > 0 ? 'parcial' : 'ok', ...r }, { status: r.errores > 0 ? 500 : 200 })
  } catch (e) {
    console.error('[asegura-portal/cron patrimonio-gastos]', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }
}
