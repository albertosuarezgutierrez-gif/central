import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { crearSolicitud, misSolicitudes, tipoEtiqueta } from '@/lib/solicitudes'
import { avisarResponsables, nombreEmpleado } from '@/lib/notificar'
import { pushResponsables } from '@/lib/push'

export async function GET() {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    return NextResponse.json({ solicitudes: await misSolicitudes(empresa_id, empleado_id) })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const body = await req.json().catch(() => ({}))
    const solicitud = await crearSolicitud(empresa_id, empleado_id, body)
    const nombre = await nombreEmpleado(empleado_id)
    await avisarResponsables(empresa_id, `Nueva solicitud de ${nombre}`, `${nombre} ha enviado una solicitud: ${tipoEtiqueta(solicitud.tipo)}.`)
    await pushResponsables(empresa_id, `Nueva solicitud de ${nombre}`, tipoEtiqueta(solicitud.tipo), '/admin/solicitudes')
    return NextResponse.json({ solicitud }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /válido|anterior|encontrado/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
