import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { aprobarFichajesDeLaNomina } from '@/lib/fichajes-nomina'

// N2: el responsable aprueba los fichajes cerrados del empleado y mes de ESTA nómina. empresa_id de la sesión; sin ids del cliente.
export async function POST(_req: Request, { params }: { params: Promise<{ nominaId: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { nominaId } = await params
    const n = await aprobarFichajesDeLaNomina(empresa_id, nominaId, usuario_id ?? 'responsable')
    if (n === null) return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, aprobados: n })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
