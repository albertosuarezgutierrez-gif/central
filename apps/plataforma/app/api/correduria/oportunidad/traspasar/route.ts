import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { traspasarOportunidadAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST { oportunidadId, nuevoClienteId } — «Pasar la oportunidad a…»: la oportunidad abierta pasa a
 * llevarla otro cliente. Gratis. El `actor` lo pone el servidor y va el ÚLTIMO.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const oportunidadId = typeof body?.oportunidadId === 'string' ? body.oportunidadId.trim() : ''
  const nuevoClienteId = typeof body?.nuevoClienteId === 'string' ? body.nuevoClienteId.trim() : ''
  if (oportunidadId === '' || nuevoClienteId === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta la oportunidad o el cliente.' }, { status: 422 })
  }
  const r = await traspasarOportunidadAsegura({ oportunidadId, nuevoClienteId, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
