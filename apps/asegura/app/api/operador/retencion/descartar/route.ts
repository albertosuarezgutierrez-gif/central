import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { descartarRetencion } from '@/lib/cartera-impagados'

export const dynamic = 'force-dynamic'

// POST /api/operador/retencion/descartar — quita una póliza de "Hay que
// llamar" un número de días (por defecto 10, tope 30). NO la marca como
// resuelta: si el recibo sigue sin cobrar al caducar el plazo, vuelve a
// salir sola. Ver la cabecera de `lib/cartera-impagados.ts`.
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const polizaId = typeof body?.polizaId === 'string' ? body.polizaId : null
    const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : null
    if (!polizaId || !actor) {
      return NextResponse.json({ estado: 'error', motivo: 'faltan_datos' }, { status: 400 })
    }
    const motivo = typeof body?.motivo === 'string' ? body.motivo : null
    const dias = typeof body?.dias === 'number' && Number.isFinite(body.dias) ? body.dias : undefined

    const r = await descartarRetencion(correduria.id, polizaId, actor, motivo, dias)
    if (!r.ok) {
      const status = r.motivo === 'no_encontrada' ? 404 : 500
      return NextResponse.json({ estado: 'error', motivo: r.motivo }, { status })
    }
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/retencion/descartar', e) }, { status: 500 })
  }
}
