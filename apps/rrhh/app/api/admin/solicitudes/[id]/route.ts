import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { resolverSolicitud, editarSolicitud, borrarSolicitud } from '@/lib/solicitudes'
import { avisarEmpleado } from '@/lib/notificar'
import { borrarObjeto } from '@/lib/storage'

function error(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
  if (e instanceof Error && e.message.includes('no encontrada')) return NextResponse.json({ error: e.message }, { status: 404 })
  throw e
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { id } = await params
    const { aprobar } = await req.json().catch(() => ({}))
    const r = await resolverSolicitud(empresa_id, usuario_id, id, !!aprobar)
    // Notificar al empleado (best-effort, no bloquea la respuesta)
    avisarEmpleado(r.empleado_email, r.tipo, r.estado as 'aprobada' | 'rechazada').catch(() => {})
    return NextResponse.json({ estado: r.estado, aviso: r.aviso })
  } catch (e) { return error(e) }
}

/** El gestor edita la solicitud (cualquier estado). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    let r
    try { r = await editarSolicitud(empresa_id, usuario_id, id, body) }
    catch (e) {
      if (e instanceof Error && !e.message.includes('no encontrada')) return NextResponse.json({ error: e.message }, { status: 422 })
      throw e
    }
    // Si el estado final cambia a aprobada/rechazada, el empleado se entera como al resolver.
    if (r.estado !== r.estado_anterior && r.estado !== 'solicitada') {
      avisarEmpleado(r.empleado_email, r.tipo, r.estado as 'aprobada' | 'rechazada').catch(() => {})
    }
    return NextResponse.json({ estado: r.estado })
  } catch (e) { return error(e) }
}

/** El gestor borra la solicitud (y su justificante del storage, best-effort). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const { justificante_path } = await borrarSolicitud(empresa_id, id)
    if (justificante_path) await borrarObjeto(justificante_path).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) { return error(e) }
}
