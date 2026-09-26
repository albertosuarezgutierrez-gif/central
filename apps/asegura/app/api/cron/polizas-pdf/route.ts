import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { enviarPolizasPendientes } from '@/lib/poliza-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/polizas-pdf — cada hora: trae de Codeoscopic el PDF de las pólizas emitidas en los
 * últimos 14 días que aún no lo tienen y, cuando llega, se lo manda al cliente adjunto. Solo a quien ya
 * recibió el correo de la emisión (el OK de Alberto) y una vez por póliza. `CRON_SECRET` por Bearer.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const resumen = await enviarPolizasPendientes(correduria.id)
    if ('apagado' in resumen) return NextResponse.json({ estado: 'apagado', motivo: resumen.apagado })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/polizas-pdf', e) }, { status: 503 })
  }
}
