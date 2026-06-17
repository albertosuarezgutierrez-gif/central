import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { generarDesdePlantilla } from '@/lib/plantillas'

/** El gestor genera un documento desde una plantilla legal versionada y lo añade al expediente. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const plantilla = String(body?.plantilla ?? '')
    const documento = await generarDesdePlantilla(empresa_id, id, plantilla)
    return NextResponse.json({ documento }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /Plantilla no encontrada|Empleado no encontrado|permiso|carpeta|obligatorio/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
