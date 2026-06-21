import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { solicitudesEmpresa } from '@/lib/solicitudes'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const soloPend = new URL(req.url).searchParams.get('pendientes') === '1'
    return NextResponse.json({ solicitudes: await solicitudesEmpresa(empresa_id, soloPend) })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
