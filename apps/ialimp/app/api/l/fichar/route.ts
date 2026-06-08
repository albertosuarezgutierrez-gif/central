import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'

export async function POST(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { session_id, tipo } = await req.json()
  try {
    if (tipo === 'entrada') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET hora_llegada = now()
        WHERE id = ${session_id}::uuid AND empresa_id = ${sess.empresa_id}::uuid AND hora_llegada IS NULL
      `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET hora_salida = now()
        WHERE id = ${session_id}::uuid AND empresa_id = ${sess.empresa_id}::uuid
      `)
    }
    const row = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT hora_llegada, hora_salida FROM cleaning_sessions
      WHERE id = ${session_id}::uuid AND empresa_id = ${sess.empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true, session: row[0] })
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
