// Botón «probar conexión». Solo lectura contra SES: no da de alta ningún parte.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { probarEstablecimiento } from '@/lib/ses/probar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  return NextResponse.json(await probarEstablecimiento(id))
}
