import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { isSuperadmin } from '@/lib/tenant'

export async function GET() {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        e.id, e.nombre, e.email, e.plan, e.activa, e.created_at,
        COUNT(DISTINCT l.id) FILTER (WHERE l.activa = true)  AS limpiadoras_activas,
        COUNT(DISTINCT c.id)                                  AS total_clientes,
        COUNT(DISTINCT p.id)                                  AS total_propiedades,
        COUNT(DISTINCT cs.id) FILTER (
          WHERE cs.session_date >= date_trunc('month', CURRENT_DATE)
        )                                                     AS sesiones_mes
      FROM empresas e
      LEFT JOIN limpiadoras l ON l.empresa_id = e.id
      LEFT JOIN clientes c    ON c.empresa_id = e.id
      LEFT JOIN propiedades p ON p.empresa_id = e.id AND p.activa = true
      LEFT JOIN cleaning_sessions cs ON cs.empresa_id = e.id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `)

    return NextResponse.json(serialize({ empresas }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
