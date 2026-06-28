import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarNominas, listarPeriodosConNominas, periodoActual, parsePeriodo } from '@/lib/nominas'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const { searchParams } = new URL(req.url)
    const periodoParam = searchParams.get('periodo')

    if (!periodoParam) {
      const periodos = await listarPeriodosConNominas(empresa_id)
      return NextResponse.json({ periodos })
    }

    try { parsePeriodo(periodoParam) } catch {
      return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
    }

    const nominas = await listarNominas(empresa_id, periodoParam)
    return NextResponse.json({ nominas, periodo: periodoParam })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
