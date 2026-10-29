// /api/cron/sivra-facturas-salida — la factura del huésped se emite y envía SOLA el día de salida (29/10/2026).
//
// Excepción aprobada por Alberto a «nunca correo a terceros sin su OK»: SOLO la factura con datos validados, el día de
// salida (ver CLAUDE.md). Toda la lógica en `lib/sivra/facturas/salida-auto.ts` (decisión pura en `salida-decision.ts`).
// `?simular=1`: devuelve qué haría con cada solicitud SIN escribir, sin IA y sin enviar nada.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { procesarSalidas } from '@/lib/sivra/facturas/salida-auto'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const simular = req.nextUrl.searchParams.get('simular') === '1'
  const resultados = await procesarSalidas(new Date(), { simular })
  // Solo ids de reserva y acciones: ni nombres ni correos del huésped en la respuesta/logs.
  return NextResponse.json({ ok: true, simular, resultados })
}
