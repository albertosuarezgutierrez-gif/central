import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { UUID_RE, validarCambioEstado } from '@/lib/material'
import { cambiarEstadoMaterial } from '@/lib/material-repo'

/** RRHH pone el estado (revisado / falta_roto / devuelto) con nota opcional. Solo su empresa. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const v = validarCambioEstado(body ?? {})
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const fila = await cambiarEstadoMaterial(empresa_id, usuario_id, id, v.estado, v.nota)
    if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ material: fila })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
