import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cambiosCuentaAsegura, resolverCambioCuentaAsegura } from '@/lib/cambios-cuenta-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cambios-cuenta — las cuentas nuevas que piden los clientes desde el portal.
 * Reenvía al puerto de asegura con el secreto de operador y devuelve su status y json.
 *
 *   GET                              → la cola (solo máscaras)
 *   POST { id, estado: 'hecha'|'descartada' } → la cierra; el `actor` lo pone el servidor
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await cambiosCuentaAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (typeof body?.id !== 'string' || (body.estado !== 'hecha' && body.estado !== 'descartada')) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }
  const r = await resolverCambioCuentaAsegura({ id: body.id, estado: body.estado, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
