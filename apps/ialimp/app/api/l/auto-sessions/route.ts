import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cron: genera sesiones de limpieza a partir de pms_connections con iCal
// Complementa al /api/pms/sync que hace el parse iCal
// Este cron asegura que las sesiones del día siguiente estén asignables
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '3')
    const today = new Date()
    today.setHours(0,0,0,0)

    // Sesiones sin limpiadora asignada en los próximos N días
    const sin_asignar = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cs.id, cs.empresa_id, cs.session_date, cs.property_id, cs.property_name
      FROM cleaning_sessions cs
      WHERE cs.limpiadora_id IS NULL
        AND cs.completed_at IS NULL
        AND cs.session_date BETWEEN ${today.toISOString().split('T')[0]}::date
            AND (${today.toISOString().split('T')[0]}::date + ${days}::int)
      ORDER BY cs.empresa_id, cs.session_date
    `)

    return NextResponse.json({
      ok: true,
      sin_asignar: sin_asignar.length,
      message: 'Usa /api/pms/sync para importar reservas y /api/admin/asignacion para asignar'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
