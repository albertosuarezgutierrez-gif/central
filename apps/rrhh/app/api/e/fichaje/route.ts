import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { fichajeActivo, ficharEntrada, ficharSalida, listarFichajes } from '@/lib/fichajes'

export async function GET() {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const activo = await fichajeActivo(empresa_id, empleado_id)
    const mes = new Date().toISOString().slice(0, 7)
    const historial = await listarFichajes(empresa_id, { mes, empleadoId: empleado_id })
    return NextResponse.json({ activo, historial })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const { lat, lng } = await req.json().catch(() => ({}))
    const latN = typeof lat === 'number' ? lat : null
    const lngN = typeof lng === 'number' ? lng : null
    const activo = await fichajeActivo(empresa_id, empleado_id)
    const fichaje = activo
      ? await ficharSalida(empresa_id, empleado_id, latN, lngN)
      : await ficharEntrada(empresa_id, empleado_id, latN, lngN)
    return NextResponse.json({ fichaje, accion: activo ? 'salida' : 'entrada' })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
