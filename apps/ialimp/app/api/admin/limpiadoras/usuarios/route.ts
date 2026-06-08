import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const limpiadoras = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, nombre, telefono, color, activa,
             (SELECT COUNT(*) FROM cleaning_sessions
              WHERE limpiadora_id = l.id AND session_date = CURRENT_DATE)::int AS sesiones_hoy
      FROM limpiadoras l
      WHERE empresa_id = ${empresa_id}::uuid AND activa = true
      ORDER BY nombre
    `)
    return NextResponse.json({ limpiadoras })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
