import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPrevision } from '@/lib/sivra/prevision-pisos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Previsión de rendimiento por piso (mes en curso + 2) + seguimiento previsto-vs-real.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await getPrevision())
  } catch (err) {
    console.error('[prevision]', err)
    return NextResponse.json({ error: 'Error calculando la previsión' }, { status: 500 })
  }
}
