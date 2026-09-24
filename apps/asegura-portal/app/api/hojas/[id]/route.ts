import { NextResponse } from 'next/server'

import { anularHojaDeSesion } from '@/lib/hojas'

export const runtime = 'nodejs'

/**
 * Anular una hoja: el «borrar el QR» de Alberto.
 *
 * 🚨 NO borra la fila —el rol ni siquiera tiene DELETE— y eso es lo que permite
 * que quien tenga el papel viejo lea «esto ya no vale» en vez de «esto no
 * existe». Ver el punto 4 de `packages/module-seguros-portal/src/hoja-qr.ts`.
 *
 * 404 y nunca 403 cuando no es suya: un 403 confirmaría que esa hoja existe.
 * Y anular dos veces devuelve 404 la segunda, no un error distinto: la fecha
 * que consta sigue siendo la de la primera, que es la que importa.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const anulada = await anularHojaDeSesion(id)
  if (anulada === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  if (!anulada) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
