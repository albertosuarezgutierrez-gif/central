import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { anularFirmas } from '@/lib/firmas-panel'
import { validarIdsAnular } from '@/lib/anular-firmas'

/** «Quitar de pendientes»: anula (borrado lógico) las solicitudes de firma. No borra documentos ni ficheros. */
export async function POST(req: Request) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const v = validarIdsAnular(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const anuladas = await anularFirmas(empresa_id, usuario_id, v.ids)
    return NextResponse.json({ ok: true, anuladas })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
