export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { mensaje } = await req.json()
  if (!mensaje) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
  await tgAlert(mensaje, 'info')
  return NextResponse.json({ ok: true })
}
