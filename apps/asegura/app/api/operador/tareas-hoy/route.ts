import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { tareasDeHoy } from '@/lib/oportunidad-seguimiento'

export const dynamic = 'force-dynamic'

/**
 * GET — las tareas de seguimiento que vencen hoy o ya vencieron, para el
 * cockpit «Hoy» de plataforma. Lista vacía con `ok` = no hay; `error` = no se
 * ha podido mirar (nunca se degrada a lista vacía).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await tareasDeHoy(correduria.id)
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tareas-hoy', e) }, { status: 500 })
  }
}
