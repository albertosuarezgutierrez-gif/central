import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { borrarDocumentoEmpresa } from '@/lib/empresa-documental'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    await borrarDocumentoEmpresa(empresa_id, id)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
