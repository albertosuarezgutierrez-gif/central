import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { ejecutarAvisosVencimiento } from '@/lib/avisos-vencimiento'

/** Averías de CONFIGURACIÓN de este cron: se dicen por su nombre, no como 'otro'. */
const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_proveedor_email']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/**
 * 🚨 Sin esto la función se queda en el techo por defecto de la plataforma, y
 * cada candidata puede ser hasta tres consultas y un `sendMail`: la pasada moría
 * a media lista, con correos ya enviados y sellados y SIN respuesta que lo
 * contara — indistinguible de «hoy no tocaba nadie». El presupuesto de envío
 * (`PRESUPUESTO_MS`) va por debajo, para que la respuesta salga siempre.
 */
export const maxDuration = 300

/**
 * GET /api/cron/avisos-vencimiento — un aviso por obligación a punto de dejar
 * de ser accionable. Diario a las 08:00 UTC (`vercel.json`).
 *
 * Auth: `CRON_SECRET` por cabecera `Authorization: Bearer`. Sin esa env NO se
 * autoriza a nadie,
 * tampoco en desarrollo: detrás de esta puerta se mandan correos a clientes
 * reales con el email descifrado de la cartera.
 *
 * Modo cuenta por defecto: sin `ASEGURA_AVISOS_ACTIVOS=1` no sale ni un correo.
 * `?contar=1` fuerza el ensayo aunque estén activos.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    const resumen = await ejecutarAvisosVencimiento({ forzarContar })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    // 503 y no 200: «no he podido» no puede leerse igual que «hoy no tocaba nadie».
    // Las averías de configuración propias se nombran tal cual; el resto pasa por
    // el clasificador de la cartera, que distingue credenciales de permisos.
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[avisos] no se puede ejecutar: ${propia}`)
    return NextResponse.json(
      { estado: 'error', causa: propia ?? registrarErrorCartera('cron/avisos-vencimiento', e) },
      { status: 503 },
    )
  }
}
