import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { addIncidencia } from '@/lib/nominas'
import type { TipoIncidencia } from '@central/module-nominas'

const TIPOS_VALIDOS: TipoIncidencia[] = ['horas_extra', 'ausencia_injustificada', 'plus_puntual', 'descuento', 'baja_it', 'vacaciones']

export async function POST(req: Request, { params }: { params: Promise<{ nominaId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { nominaId } = await params
    const body = await req.json().catch(() => ({}))

    const tipo = body.tipo as TipoIncidencia
    if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: 'Tipo de incidencia inválido' }, { status: 400 })
    const concepto = (body.concepto ?? '').trim()
    if (!concepto) return NextResponse.json({ error: 'concepto requerido' }, { status: 400 })

    const inc = await addIncidencia(empresa_id, nominaId, {
      tipo,
      concepto,
      importe: body.importe != null ? Number(body.importe) : undefined,
      horas: body.horas != null ? Number(body.horas) : undefined,
      dias: body.dias != null ? Number(body.dias) : undefined,
    })
    return NextResponse.json({ incidencia: inc }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('confirmada')) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }
}
