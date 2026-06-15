import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { ACTOR_GESTOR, CARPETAS } from '@/lib/carpetas'
import { listarExpediente, subirDocumento } from '@/lib/documental'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const documentos = await listarExpediente(empresa_id, id, ACTOR_GESTOR)
    return NextResponse.json({ carpetas: CARPETAS, documentos })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('no encontrado')) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const form = await req.formData()
    const file = form.get('file') as File | null
    const carpeta = String(form.get('carpeta') ?? '')
    if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    const doc = await subirDocumento(empresa_id, id, ACTOR_GESTOR, {
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
