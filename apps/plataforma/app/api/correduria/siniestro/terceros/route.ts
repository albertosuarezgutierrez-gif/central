import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { anadirTerceroAsegura, quitarTerceroAsegura } from '@/lib/siniestros-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/siniestro/terceros — terceros y testigos de un siniestro.
 * Reenvía al puerto de asegura (`/api/operador/siniestro/terceros`) con el
 * secreto de operador; mismo contrato que `/api/correduria/siniestro`.
 *
 *   POST   { siniestroId, tipo, esConductor?, nombre?, telefono?, matricula?,
 *            marcaModelo?, companiaNombre?, numeroPoliza? }
 *   DELETE { siniestroId, intervinienteId }
 */
export async function POST(req: NextRequest) {
  return reenviar(req, anadirTerceroAsegura, 'Falta el id del siniestro.')
}

export async function DELETE(req: NextRequest) {
  return reenviar(req, quitarTerceroAsegura, 'Falta el id del siniestro.')
}

async function reenviar(
  req: NextRequest,
  llamada: (body: Record<string, unknown>) => Promise<{ status: number; json: unknown }>,
  motivoFalta: string,
) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const session = guarda.session
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.siniestroId !== 'string' || body.siniestroId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: motivoFalta }, { status: 422 })
  }
  const r = await llamada({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
