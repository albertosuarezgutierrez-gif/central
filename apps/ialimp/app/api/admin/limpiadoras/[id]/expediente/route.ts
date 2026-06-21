import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'
import { carpetasVisibles } from '@central/module-documental'
import { ACTOR_GESTOR, CARPETAS } from '@/lib/carpetas-limpiadora'
import { listarExpediente, subirDocumento } from '@/lib/expediente-limpiadora'

// GET — el gestor ve el expediente completo de una limpiadora.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const documentos = await listarExpediente(empresa_id, id, ACTOR_GESTOR)
    return NextResponse.json(serialize({ carpetas: carpetasVisibles(CARPETAS, ACTOR_GESTOR), documentos }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST (multipart) — el gestor sube un documento al expediente de la limpiadora.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const form = await req.formData()
    const file = form.get('file') as File | null
    const carpeta = String(form.get('carpeta') ?? '')
    if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    const doc = await subirDocumento(empresa_id, id, ACTOR_GESTOR, {
      carpeta, nombre: file.name, tipo: file.type, tamano: file.size, bytes: await file.arrayBuffer(),
    })
    return NextResponse.json({ documento: doc }, { status: 201 })
  } catch (e: any) {
    if (/permiso|obligatorio|máximo|desconocida|no encontrada|no existe/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
