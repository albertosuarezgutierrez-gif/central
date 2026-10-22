import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { leerFiltrosMaterial } from '@/lib/material'
import { listarMaterialAdmin } from '@/lib/material-repo'

/** Material de la empresa de la sesión (filtros empleado/tipo/estado; 50 + «Ver más»). */
export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    return NextResponse.json(await listarMaterialAdmin(empresa_id, leerFiltrosMaterial(new URL(req.url).searchParams)))
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
