import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { ausenciasCalendario } from '@/lib/solicitudes'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const url = new URL(req.url)
    const mes = url.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
    const [anio, m] = mes.split('-').map(Number)
    const desde = `${anio}-${String(m).padStart(2, '0')}-01`
    const ultimoDia = new Date(anio, m, 0).getDate()
    const hasta = `${anio}-${String(m).padStart(2, '0')}-${ultimoDia}`
    const ausencias = await ausenciasCalendario(empresa_id, desde, hasta)
    return NextResponse.json({ ausencias, mes, desde, hasta })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
