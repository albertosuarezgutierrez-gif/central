import { NextResponse } from 'next/server'

import { borrarContactoPropio, hacerPrincipalPropio } from '@/lib/contactos-propios'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

function statusDe(estado: string): number {
  if (estado === 'ok') return 200
  if (estado === 'invalido') return 422
  if (estado === 'sin_puente') return 503
  if (estado === 'error') return 502
  if (estado === 'no_encontrado') return 404
  return 409 // conflicto · sin_ficha · varias_fichas
}

/**
 * PATCH /api/mis-datos/contactos/[id] — lo marca como PRINCIPAL. Es el único
 * cambio que se ofrece: re-etiquetar es cosa del corredor y el VALOR se
 * cambia por `/api/mis-datos` (sustituye el principal).
 *
 * DELETE /api/mis-datos/contactos/[id] — lo quita de la lista.
 *
 * 🚨 La identidad sale de la COOKIE (`requireIdentidad`), nunca del cuerpo ni
 * de la URL: misma regla que `/api/mis-datos` y `/api/peticiones`. `[id]` es
 * de OTRA persona → el puerto de asegura ya lo filtra por `clienteId` de la
 * ficha vinculada a ESTA identidad, así que un id ajeno vuelve `no_encontrado`.
 */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const r = await hacerPrincipalPropio(identidad.id, id)
  return NextResponse.json(r, { status: statusDe(r.estado) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const r = await borrarContactoPropio(identidad.id, id)
  return NextResponse.json(r, { status: statusDe(r.estado) })
}
