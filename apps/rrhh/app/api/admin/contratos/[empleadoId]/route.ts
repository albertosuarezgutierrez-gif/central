import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { contratoActivoDeEmpleado, crearContrato, historialContratos, parsearDatosContrato } from '@/lib/contratos'

export async function GET(_req: Request, { params }: { params: Promise<{ empleadoId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { empleadoId } = await params
    const contrato = await contratoActivoDeEmpleado(empresa_id, empleadoId)
    const historial = await historialContratos(empresa_id, empleadoId)
    return NextResponse.json({ contrato, historial })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ empleadoId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { empleadoId } = await params
    const body = await req.json().catch(() => ({}))
    const datos = parsearDatosContrato(body)
    await crearContrato(empresa_id, empleadoId, datos)
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.match(/inválid|debe|fecha/i)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
