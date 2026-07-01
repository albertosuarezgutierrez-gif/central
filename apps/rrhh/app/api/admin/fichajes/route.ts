import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarFichajes } from '@/lib/fichajes'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const url = new URL(req.url)
    const mes = url.searchParams.get('mes') ?? undefined
    const empleadoId = url.searchParams.get('empleado_id') ?? undefined
    const fichajes = await listarFichajes(empresa_id, { mes, empleadoId })
    return NextResponse.json({ fichajes })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
