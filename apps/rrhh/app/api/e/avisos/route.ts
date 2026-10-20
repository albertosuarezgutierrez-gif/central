import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { listarAvisosEmpleado } from '@/lib/avisos'

/** Avisos del empleado de la sesión (solo los suyos). */
export async function GET() {
  try {
    const { empleado_id, empresa_id } = await getSesionEmpleado()
    return NextResponse.json(await listarAvisosEmpleado(empresa_id, empleado_id))
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
