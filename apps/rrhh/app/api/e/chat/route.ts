import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { listarHilo, enviarMensaje } from '@/lib/chat'
import { avisarResponsables, nombreEmpleado } from '@/lib/notificar'
import { pushResponsables } from '@/lib/push'

export async function GET() {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    return NextResponse.json({ mensajes: await listarHilo(empresa_id, empleado_id, 'titular') })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const { texto } = await req.json().catch(() => ({}))
    const mensaje = await enviarMensaje(empresa_id, empleado_id, 'titular', String(texto ?? ''))
    const nombre = await nombreEmpleado(empleado_id)
    await avisarResponsables(empresa_id, `Nuevo mensaje de ${nombre}`, `${nombre} te ha escrito por el chat de la intranet.`)
    await pushResponsables(empresa_id, `Nuevo mensaje de ${nombre}`, mensaje.texto.slice(0, 80))
    return NextResponse.json({ mensaje }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /vac|supera|no encontrado/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
