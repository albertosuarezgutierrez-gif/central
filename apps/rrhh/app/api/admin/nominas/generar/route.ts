import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { generarBorradores, modoNominasEmpresa, periodoActual, parsePeriodo } from '@/lib/nominas'

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => ({}))
    const periodo: string = body.periodo ?? periodoActual()

    try { parsePeriodo(periodo) } catch {
      return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
    }

    // Sin el módulo en modo cálculo, los borradores salen en «simulación» (marcados con sus cifras pendientes; no confirmables).
    const modo = await modoNominasEmpresa(empresa_id)
    const resultado = await generarBorradores(empresa_id, periodo, modo)
    return NextResponse.json({ ...resultado, modo }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
