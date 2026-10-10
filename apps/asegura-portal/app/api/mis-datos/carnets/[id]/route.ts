import { NextResponse } from 'next/server'

import { leerEscrituraCarnet } from '@/lib/carnets-escritura'
import { requireIdentidad } from '@/lib/session'

import { escribirYResponder } from '@/lib/carnets-api'

export const runtime = 'nodejs'

/**
 * PATCH  /api/mis-datos/carnets/[id] — corrige tipo y/o fecha de expedición. `{ fichaId, tipo, fecha }`.
 * DELETE /api/mis-datos/carnets/[id] — lo quita. `{ fichaId }`.
 *
 * 🚨 La identidad sale de la COOKIE, nunca del cuerpo ni de la URL. Un `[id]` de otra persona (o de otra
 * ficha suya distinta de `fichaId`) vuelve `no_encontrado`: lo decide `apps/asegura` leyendo el dueño del
 * carné en BD. Vista de corredor → 403 en el `middleware`.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const op = leerEscrituraCarnet('cambio', await req.json().catch(() => null), id)
  if (!op) return NextResponse.json({ estado: 'invalido', motivo: 'Faltan el titular, el tipo o la fecha del carné.' }, { status: 400 })
  return escribirYResponder(identidad.id, op)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const op = leerEscrituraCarnet('baja', await req.json().catch(() => null), id)
  if (!op) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el titular del carné.' }, { status: 400 })
  return escribirYResponder(identidad.id, op)
}
