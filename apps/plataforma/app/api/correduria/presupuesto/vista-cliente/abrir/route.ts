import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { vistaPresupuestoAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET ?presupuestoId= — el ENLACE «👁 Ver como el cliente» del Telegram de revisión de una renovación (04/11/2026).
 *
 * El Telegram no puede llevar la vista de corredor ya hecha (es de UN uso y caduca a los 10 min): lleva esto, que al
 * abrirlo con la sesión de plataforma pide a asegura una vista nueva (la de siempre, `vista-cliente`) y redirige a ella.
 * No envía nada a nadie ni marca nada como visto. Sin sesión de la correduría: 401 (el enlace solo no abre nada).
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const presupuestoId = (req.nextUrl.searchParams.get('presupuestoId') ?? '').trim()
  if (!UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del presupuesto.' }, { status: 422 })
  const r = await vistaPresupuestoAsegura({ presupuestoId, actor: guarda.session.email })
  const j = r.json as { estado?: unknown; url?: unknown; motivo?: unknown } | null
  if (r.status === 200 && j?.estado === 'ok' && typeof j.url === 'string' && /^https:\/\//.test(j.url)) {
    return NextResponse.redirect(j.url, 303)
  }
  return NextResponse.json({ estado: typeof j?.estado === 'string' ? j.estado : 'error', motivo: typeof j?.motivo === 'string' ? j.motivo : `No se ha podido abrir la vista previa (HTTP ${r.status}).` }, { status: r.status >= 400 ? r.status : 502 })
}
