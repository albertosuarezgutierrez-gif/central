import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { leerFiltros, listarPendientes } from '@/lib/firmas-panel'

/** Panel de firmas pendientes de la empresa de la sesión (paginado de 50 en 50). */
export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const r = await listarPendientes(empresa_id, leerFiltros(new URL(req.url).searchParams))
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
