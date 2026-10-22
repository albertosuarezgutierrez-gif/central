import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { UUID_RE } from '@/lib/material'
import { borrarMaterialEmpleado } from '@/lib/material-repo'

/** Borrado lógico de un material PROPIO mientras siga pendiente de revisar. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    const ok = await borrarMaterialEmpleado(empresa_id, empleado_id, id)
    // Mismo 409 para «no es tuyo», «no existe» y «ya revisado»: no se revela material ajeno.
    if (!ok) return NextResponse.json({ error: 'No se puede borrar: ya lo ha revisado RRHH o no existe' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
