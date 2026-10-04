import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { marcarNoDuplicadoAsegura } from '@/lib/duplicados-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/duplicados/no-duplicado `{ ids: string[], motivo }` —
 * «No es duplicado» desde la pantalla «Duplicadas». Reenvía al puerto de
 * asegura (`/api/operador/duplicados/no-duplicado`) con el secreto de operador
 * y `x-actor` = la sesión (quién lo decide lo pone el puerto, nunca el cuerpo),
 * y devuelve el MISMO status y json. Sesión de la correduría obligatoria, como
 * el resto de escrituras de `/api/correduria/**`.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
  const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.slice(0, 500) : ''
  const r = await marcarNoDuplicadoAsegura(ids, motivo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
