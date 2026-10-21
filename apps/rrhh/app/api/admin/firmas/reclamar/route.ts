import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { reclamarFirma } from '@/lib/firmas-panel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** «Reclamar»: reenvía email + push al empleado y lo deja registrado en rrhh.avisos. */
export async function POST(req: Request) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { documento_id } = await req.json().catch(() => ({}))
    if (typeof documento_id !== 'string' || !UUID.test(documento_id)) {
      return NextResponse.json({ error: 'Documento no válido' }, { status: 400 })
    }
    const aviso = await reclamarFirma(empresa_id, usuario_id, documento_id, new URL(req.url).origin)
    return NextResponse.json({ ok: true, aviso })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no encontrado/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 404 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
