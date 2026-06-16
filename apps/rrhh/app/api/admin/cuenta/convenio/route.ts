import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { actualizarConvenio } from '@/lib/empresa'

/** El gestor actualiza el convenio colectivo de su empresa. */
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => ({}))
    const convenio = await actualizarConvenio(empresa_id, body?.codigo ?? null, body?.nombre ?? null)
    return NextResponse.json({ convenio })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
