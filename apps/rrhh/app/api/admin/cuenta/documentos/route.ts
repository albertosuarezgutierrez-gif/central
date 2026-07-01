import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarDocumentosEmpresa, subirDocumentoEmpresa, urlDocumentoEmpresa } from '@/lib/empresa-documental'

export async function GET() {
  try {
    const { empresa_id } = await getSesion()
    const docs = await listarDocumentosEmpresa(empresa_id)
    // Adjuntar URL firmada a cada documento
    const conUrls = await Promise.all(docs.map(async d => ({ ...d, url: await urlDocumentoEmpresa(d.storage_path) })))
    return NextResponse.json({ documentos: conUrls })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    const categoria = String(fd.get('categoria') ?? 'otro')
    const nombre = String(fd.get('nombre') || file.name)
    const anio = fd.get('anio') ? parseInt(String(fd.get('anio'))) : undefined
    const mes = fd.get('mes') ? parseInt(String(fd.get('mes'))) : undefined
    const bytes = await file.arrayBuffer()
    const ext = file.name.split('.').pop() ?? 'bin'
    const doc = await subirDocumentoEmpresa(empresa_id, usuario_id, { categoria, nombre, anio, mes }, { bytes, contentType: file.type || 'application/octet-stream', ext })
    return NextResponse.json({ documento: doc }, { status: 201 })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
