import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { avisoActivo } from '@/lib/whatsapp/aviso-vencimiento-reglas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/whatsapp-aviso-vencimiento — laborables (`vercel.json`). Manda UNA plantilla de utilidad de Meta a los clientes
 * cuya póliza (u oportunidad abierta) vence en ≤60 días, con ficha única, móvil válido, sin baja y con conversación previa
 * iniciada por Alberto. Idempotente (clave única por póliza+vencimiento) y con tope diario.
 *
 * APAGADO por defecto: sin `ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO=1` responde 200 `apagado` y no hace nada.
 * `?contar=1` = ensayo (cuenta, no envía ni avisa). Auth: `CRON_SECRET` por `Authorization: Bearer`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!avisoActivo()) return NextResponse.json({ estado: 'apagado' })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const { ejecutarAvisoVencimiento } = await import('@/lib/whatsapp/aviso-vencimiento')
    const r = await ejecutarAvisoVencimiento(correduria.id, { forzarContar })
    // 503 en lo que impide trabajar (no es «hoy no tocaba nadie»).
    return NextResponse.json(r, { status: r.estado === 'ok' || r.estado === 'apagado' ? 200 : 503 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/whatsapp-aviso-vencimiento', e) }, { status: 500 })
  }
}
