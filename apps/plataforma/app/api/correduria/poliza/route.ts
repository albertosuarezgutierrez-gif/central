import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { modalidadRcAsegura } from '@/lib/poliza-edicion-asegura'

export const dynamic = 'force-dynamic'

// PATCH /api/correduria/poliza — anotar a mano la MODALIDAD de una RC cuando
// la compañía no manda coberturas por CIMA. Reenvía a `PATCH /api/operador/
// poliza` de asegura con `actor` = quien está en sesión, nunca del body.
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || body.id.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id de la póliza.' }, { status: 422 })
  }
  const r = await modalidadRcAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
