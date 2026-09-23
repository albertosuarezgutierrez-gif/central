import { NextResponse } from 'next/server'
import { decisionValida } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { aprobacionesPendientes, decidirAprobacion, enviosInciertos } from '@/lib/aprobaciones'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cola única de aprobaciones: lo que el sistema propone y solo se hace con OK.
 *
 *   GET   → { estado:'ok', pendientes, inciertos }
 *   PATCH { id, decision:'aprobar', asunto, texto } | { id, decision:'rechazar' }, actor
 *         → { estado:'ejecutada'|'rechazada' } · 404 no existe · 409 ya decidida ·
 *           422 sin_email · 503 sin_correo_configurado · 502 fallida
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const [pendientes, inciertos] = await Promise.all([aprobacionesPendientes(correduria.id), enviosInciertos(correduria.id)])
    return NextResponse.json({ estado: 'ok', pendientes, inciertos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/aprobaciones', e) }, { status: 500 })
  }
}

const STATUS: Record<string, number> = { ejecutada: 200, rechazada: 200, no_encontrada: 404, ya_decidida: 409, sin_email: 422, sin_correo_configurado: 503, fallida: 502 }

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : ''
  const actor = typeof cuerpo?.actor === 'string' && cuerpo.actor.trim() ? cuerpo.actor.trim() : 'corredor'
  const d = decisionValida(cuerpo)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !d) return NextResponse.json({ estado: 'invalida', motivo: 'decisión no válida (asunto y texto no pueden ir vacíos)' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await decidirAprobacion(correduria.id, id, d, actor)
    return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/aprobaciones', e) }, { status: 500 })
  }
})
