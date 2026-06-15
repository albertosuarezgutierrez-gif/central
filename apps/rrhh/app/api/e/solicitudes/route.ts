import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { crearSolicitud, misSolicitudes } from '@/lib/solicitudes'

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
    return NextResponse.json({ solicitud }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /válido|anterior|encontrado/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
