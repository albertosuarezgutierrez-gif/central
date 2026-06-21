import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { registrarAvisoHuesped } from '@/lib/limpiadoras-early'

export const dynamic = 'force-dynamic'

// POST: la admin acepta/rechaza la entrada anticipada de una sesión
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { session_id, status, early_time } = await req.json()
  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE cleaning_sessions
      SET early_checkin_status = ${status},
          early_checkin_requested = ${early_time || null}::time
      WHERE id = ${session_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH: aviso del huésped (hora salida/llegada) desde /sivra/mensajes.
// Busca la sesión por property_id + fecha y la crea si no existe.
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { session_id, property_id, date, type, time } = await req.json()
  try {
    const sid = await registrarAvisoHuesped({ session_id, property_id, date, type, time })
    if (!sid) return NextResponse.json({ error: 'No session found' }, { status: 404 })
    return NextResponse.json({ ok: true, session_id: sid })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
