import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { diasRetencion } from '@/lib/whatsapp/config'
import { purgarPorRetencion } from '@/lib/whatsapp/retencion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/whatsapp-retencion — diario (`vercel.json`). Borra el TEXTO de los mensajes de
 * WhatsApp con más de WHATSAPP_RETENCION_DIAS (730 por defecto; queda que hubo mensaje y cuándo) y
 * minimiza el crudo de Meta de más de 30 días. Corre aunque el canal esté apagado: lo guardado
 * antes de apagarlo también caduca. Un WHATSAPP_RETENCION_DIAS mal escrito NO purga (ni «0 = todo»
 * ni «sin límite»): 500 con el motivo, para que se vea.
 *
 * Auth: `CRON_SECRET` por `Authorization: Bearer`. Idempotente; por lotes de 5.000.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const dias = diasRetencion()
  if (dias === null) return NextResponse.json({ estado: 'error', motivo: 'WHATSAPP_RETENCION_DIAS no válido (entero ≥ 30)' }, { status: 500 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await purgarPorRetencion(correduria.id, dias)
    return NextResponse.json({ estado: 'ok', dias, ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/whatsapp-retencion', e) }, { status: 500 })
  }
}
