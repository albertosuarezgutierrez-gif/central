import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { ACTOR_TITULAR, CARPETAS } from '@/lib/carpetas'
import { carpetasVisibles } from '@central/module-documental'
import { listarExpediente, subirDocumento } from '@/lib/documental'

export async function GET() {
  try {
    const { empleado_id, empresa_id } = await getSesionEmpleado()
    const documentos = await listarExpediente(empresa_id, empleado_id, ACTOR_TITULAR)
    return NextResponse.json({ carpetas: carpetasVisibles(CARPETAS, ACTOR_TITULAR), documentos })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empleado_id, empresa_id } = await getSesionEmpleado()
    const form = await req.formData()
    const file = form.get('file') as File | null
    const carpeta = String(form.get('carpeta') ?? '')
    if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    const doc = await subirDocumento(empresa_id, empleado_id, ACTOR_TITULAR, {
      carpeta, nombre: file.name, tipo: file.type, tamano: file.size, bytes: await file.arrayBuffer(),
    })
    return NextResponse.json({ documento: doc }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /permiso|obligatorio|máximo|desconocida|no encontrado/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
