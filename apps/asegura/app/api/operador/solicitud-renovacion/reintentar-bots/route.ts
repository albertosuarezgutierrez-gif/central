import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { reintentarBotsRenovacion } from '@/lib/solicitud-renovacion'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * «🔁 Reintentar bots» (Telegram `cdr_bot:<solicitudId>`, 07/11/2026): vuelve a encolar los bots de hogar de una solicitud de
 * renovación YA contestada. Mismo camino y guardas que «Probar» (interruptor `TARIFICADOR_RPA_ACTIVO`, integración activa, sin
 * duplicar trabajos vivos). Solo precio: ni Avant2, ni emisión, ni nada al cliente. Manda su propio Telegram.
 *
 *   POST { solicitudId } → { estado:'lanzados'|'no_lanzados'|'faltan_datos'|'riesgo_no_leido', solicitudId }
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const solicitudId = typeof b?.solicitudId === 'string' ? b.solicitudId.trim() : ''
    const r = await reintentarBotsRenovacion(correduria.id, solicitudId)
    if ('motivo' in r) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/solicitud-renovacion/reintentar-bots', e) }, { status: 500 })
  }
})
