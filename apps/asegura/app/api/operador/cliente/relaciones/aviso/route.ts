import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { avisarAccesoPendiente } from '@/lib/aviso-acceso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Avisar por correo de una autorización PENDIENTE (plataforma → asegura, Bearer).
 *
 *   POST { clienteId, relacionadoId, actor } → escribe a `relacionadoId`
 *
 * `clienteId` es quien CEDE y `relacionadoId` quien recibe el acceso, igual que
 * en el PATCH de `../route.ts`: el correo sale desde la ficha de quien autoriza,
 * que es donde Alberto lo pulsa.
 *
 * 🚨 Esto **no acepta nada**. La autorización sigue pendiente después del envío:
 * lo único que hace este puerto es que la persona se entere de que la tiene.
 * Las razones por las que puede no salir el correo van cada una con su código
 * —`sin_pendiente` 409, `sin_email` 422, `sin_portal` 503, `error_envio` 502—
 * porque son cosas distintas y se arreglan de forma distinta; colapsarlas en un
 * «no se pudo» deja a Alberto sin saber si falta un correo o falla el proveedor.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.clienteId !== 'string' || typeof body.relacionadoId !== 'string') {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan clienteId y relacionadoId' }, { status: 422 })
    }
    const actor = typeof body.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim().slice(0, 120) : 'plataforma'

    const r = await avisarAccesoPendiente(correduria.id, {
      otorganteId: body.clienteId.trim(),
      autorizadoId: body.relacionadoId.trim(),
      actor,
    })
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', caducaEn: r.caducaEn.toISOString() })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/relaciones/aviso', e) }, { status: 500 })
  }
}
