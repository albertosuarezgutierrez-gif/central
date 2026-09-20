import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { modalidadRcAsegura } from '@/lib/poliza-edicion-asegura'

export const dynamic = 'force-dynamic'

// PATCH /api/correduria/poliza — anotar a mano lo que la compañía no manda por
// CIMA: la MODALIDAD de una RC (sin `campo`) o la DIRECCIÓN DEL RIESGO de un
// inmueble (`campo: 'direccion_riesgo'`). Reenvía el body tal cual a `PATCH
// /api/operador/poliza` de asegura con `actor` = quien está en sesión, nunca
// del body; quién decide qué campo es y qué vale es el puerto.
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const session = guarda.session
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || body.id.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id de la póliza.' }, { status: 422 })
  }
  const r = await modalidadRcAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
