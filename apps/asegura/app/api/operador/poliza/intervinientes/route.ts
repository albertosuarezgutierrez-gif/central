import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { quitarInterviniente } from '@/lib/cartera-intervinientes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/operador/poliza/intervinientes — quitar a una persona de UNA póliza.
 *
 *   DELETE { intervinienteId, actor, motivo? }
 *
 * El hueco que tapa: hasta el 03/09/2026 el puerto no tenía forma de quitar un
 * interviniente, y por eso los 77 comodines del volcado hubo que sacarlos con un
 * lote SQL. Reglas y guardas en `lib/cartera-intervinientes.ts`; la que más
 * importa es que **una línea de CIMA devuelve 409** en vez de borrarse: el
 * siguiente pull la recrearía.
 *
 * `intervinienteId` es la FILA, no el cliente: la misma persona puede intervenir
 * en varias pólizas y aquí solo se quita de la que se está mirando.
 */
export async function DELETE(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const intervinienteId = typeof body?.intervinienteId === 'string' ? body.intervinienteId.trim() : ''
    if (intervinienteId === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'falta intervinienteId' }, { status: 422 })
    }
    const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : 'plataforma'
    const motivo = typeof body?.motivo === 'string' && body.motivo.trim() !== '' ? body.motivo.trim() : undefined

    const r = await quitarInterviniente(correduria.id, intervinienteId, { actor, motivo })
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('operador/poliza/intervinientes', e) },
      { status: 500 },
    )
  }
}
