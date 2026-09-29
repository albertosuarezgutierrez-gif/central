import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { ibanCambioCuentaAsegura } from '@/lib/cambios-cuenta-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/cambios-cuenta/iban { id } — el IBAN completo de una solicitud pendiente,
 * para teclearlo en la compañía. POST y sin caché: cada consulta queda en la auditoría de asegura.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (typeof body?.id !== 'string') return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await ibanCambioCuentaAsegura(body.id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status, headers: { 'cache-control': 'no-store' } })
}
