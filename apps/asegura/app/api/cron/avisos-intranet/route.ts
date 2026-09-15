import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { avisarIntranet } from '@/lib/avisos-intranet'

/** Averías de CONFIGURACIÓN de este cron: se dicen por su nombre, no como «otro». */
const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria', 'sin_portal', 'sin_correo_configurado']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/avisos-intranet — «tienes algo esperándote en tu área de
 * clientes»: UN correo por cliente con lo que su campana tiene pendiente y
 * todavía no se le ha contado. Diario a las 08:15 UTC (`vercel.json`).
 *
 * 🚨 Va 15 minutos DESPUÉS de `avisos-vencimiento` a propósito. Los dos pueden
 * hablar del mismo vencimiento, y solapados le llegarían dos correos a la vez
 * sobre lo mismo: con este orden, cuando esta pasada mira, la obligación ya
 * tiene su `avisada_at` y aquí ni se cuenta.
 *
 * Auth: `CRON_SECRET` por `Authorization: Bearer`. Sin esa env no se autoriza a
 * nadie, tampoco en desarrollo — detrás de esta puerta se escribe a clientes
 * reales con el correo descifrado de la cartera.
 *
 * Modo cuenta por defecto: sin `ASEGURA_AVISOS_ACTIVOS=1` no sale ni un correo,
 * se cuenta y se informa. `?contar=1` fuerza el ensayo aunque estén activos.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const resumen = await avisarIntranet(correduria.id, { forzarContar })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    // 503 y no 200: «no he podido mirar» no puede leerse como «hoy no tocaba
    // nadie». Un check que se pone verde porque no miró es el fallo más caro.
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[avisos-intranet] no se puede ejecutar: ${propia}`)
    return NextResponse.json(
      { estado: 'error', causa: propia ?? registrarErrorCartera('cron/avisos-intranet', e) },
      { status: 503 },
    )
  }
}
