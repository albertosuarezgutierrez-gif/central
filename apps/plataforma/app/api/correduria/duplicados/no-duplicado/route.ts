import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerCuerpoNoDuplicado, marcarNoDuplicadoAsegura } from '@/lib/duplicados-asegura'

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
  // Cuerpo no-objeto (JSON `null`, lista, ilegible) → 400; >20 fichas → 400
  // `demasiadas_polizas`. Nunca se recorta la lista: o va entera o no va.
  const cuerpo = leerCuerpoNoDuplicado(await req.json().catch(() => null))
  if (!cuerpo.ok) return NextResponse.json({ estado: 'error', motivo: cuerpo.motivo }, { status: 400 })
  const { ids, motivo } = cuerpo
  const r = await marcarNoDuplicadoAsegura(ids, motivo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
