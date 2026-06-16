import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { firmarDocumento } from '@/lib/firma'
import { pushResponsables } from '@/lib/push'
import { nombreEmpleado } from '@/lib/notificar'

// POST { nombre_confirmado } — el empleado firma un documento pendiente.
export async function POST(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const { docId } = await params
    const { nombre_confirmado, codigo } = await req.json().catch(() => ({}))
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const user_agent = req.headers.get('user-agent')
    const evidencia = await firmarDocumento(empresa_id, empleado_id, docId, {
      ip, user_agent, nombre_confirmado: String(nombre_confirmado ?? ''),
      codigo: codigo != null ? String(codigo) : null,
    })
    const nombre = await nombreEmpleado(empleado_id)
    await pushResponsables(empresa_id, 'Documento firmado', `${nombre} ha firmado un documento.`)
    return NextResponse.json({ ok: true, sello_tiempo: evidencia.sello_tiempo })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no encontrado|firmado|no requiere|no coincide|código|caducado|intentos|Falta/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
