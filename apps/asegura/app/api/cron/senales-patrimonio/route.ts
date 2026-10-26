import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { ejecutarSenalesPatrimonio } from '@/lib/patrimonio-senales'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/senales-patrimonio — el motor de señales de patrimonio (P16, 26/10/2026). Diario, 06:30 UTC (`vercel.json`).
 *
 * 🚨 APAGADO por defecto: sin `PATRIMONIO_SENALES_ACTIVAS=1` responde `{estado:'apagado'}` SIN tocar la BD. Encendido
 * (interés legítimo informado), calcula para toda ficha con patrimonio salvo oposición vigente, y BORRA las señales que
 * superan el plazo de conservación (`MESES_RETENCION_SENALES`). NO envía nada (ni correo, ni Telegram).
 * Auth: `CRON_SECRET` por `Authorization: Bearer` (sin esa env no se autoriza a nadie). `?contar=1` = ensayo: cuenta lo
 * que haría y no escribe.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    const resumen = await ejecutarSenalesPatrimonio({ forzarContar })
    return NextResponse.json(resumen)
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    return NextResponse.json(
      { estado: 'error', causa: propia ?? registrarErrorCartera('cron/senales-patrimonio', e) },
      { status: 503 },
    )
  }
}
