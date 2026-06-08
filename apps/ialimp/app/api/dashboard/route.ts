import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const today = new Date().toISOString().split('T')[0]

    const [sesiones, pendientes, completadas, limpiadoras] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT cs.*, l.nombre as limpiadora_nombre
        FROM cleaning_sessions cs
        LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
        WHERE cs.empresa_id = ${empresa_id}::uuid
          AND cs.session_date = ${today}::date
        ORDER BY cs.session_date, l.nombre
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT COUNT(*) as count FROM cleaning_sessions
        WHERE empresa_id = ${empresa_id}::uuid AND session_date = ${today}::date
          AND started_at IS NULL
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT COUNT(*) as count FROM cleaning_sessions
        WHERE empresa_id = ${empresa_id}::uuid AND session_date = ${today}::date
          AND completed_at IS NOT NULL
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT COUNT(*) as count FROM limpiadoras WHERE empresa_id = ${empresa_id}::uuid AND activa = true
      `)
    ])

    return NextResponse.json({
      sesiones,
      stats: {
        total: sesiones.length,
        pendientes: Number(pendientes[0]?.count || 0),
        completadas: Number(completadas[0]?.count || 0),
        limpiadoras: Number(limpiadoras[0]?.count || 0)
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
