import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { resolverSolicitud } from '@/lib/solicitudes'
import { avisarEmpleado } from '@/lib/notificar'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { id } = await params
    const { aprobar } = await req.json().catch(() => ({}))
    const r = await resolverSolicitud(empresa_id, usuario_id, id, !!aprobar)
    // Notificar al empleado (best-effort, no bloquea la respuesta)
    avisarEmpleado(r.empleado_email, r.tipo, r.estado as 'aprobada' | 'rechazada').catch(() => {})
    return NextResponse.json({ estado: r.estado, aviso: r.aviso })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('no encontrada')) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}
