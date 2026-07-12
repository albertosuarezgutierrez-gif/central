import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { generarInforme } from '@/lib/informes'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { cliente_id, periodo, enviar_email = false } = await req.json()
    const res = await generarInforme({ empresa_id, cliente_id, periodo, enviar_email })
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
