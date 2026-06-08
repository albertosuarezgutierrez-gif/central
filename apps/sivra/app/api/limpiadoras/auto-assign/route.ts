import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Cron diario: asigna automáticamente limpiadoras a sesiones sin asignar
// Lógica: busca la limpiadora disponible con menos carga ese día y que tenga el piso asignado
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

  // Sesiones sin asignar en los próximos 3 días
  const unassigned: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT id, property_id, session_date, tipo_limpieza, tiempo_estimado
    FROM cleaning_sessions
    WHERE limpiadora_id IS NULL
      AND session_date BETWEEN ${today}::date AND ${in3days}::date
    ORDER BY session_date
  `)

  let assigned = 0
  const log: string[] = []

  for (const session of unassigned) {
    const fecha = session.session_date instanceof Date
      ? session.session_date.toISOString().split('T')[0]
      : String(session.session_date).split('T')[0]

    const d = new Date(fecha + 'T12:00:00')
    const diaSemana = d.getDay() === 0 ? 7 : d.getDay()

    // Buscar mejor candidata
    const candidatas: any[] = await prisma.$queryRaw(Prisma.sql`
      SELECT
        l.id, l.nombre, l.propiedades,
        COALESCE(carga.total_min, 0) AS horas_asignadas_min,
        ld.horas_max * 60 AS horas_max_min,
        CASE WHEN ${session.property_id} = ANY(l.propiedades::text[]) THEN 1 ELSE 2 END AS prioridad
      FROM limpiadoras l
      JOIN limpiadora_disponibilidad ld ON ld.limpiadora_id = l.id
        AND ld.dia_semana = ${diaSemana} AND ld.activo = true
      LEFT JOIN (
        SELECT limpiadora_id, SUM(COALESCE(tiempo_estimado, 120)) AS total_min
        FROM cleaning_sessions
        WHERE session_date = ${fecha}::date AND limpiadora_id IS NOT NULL
        GROUP BY limpiadora_id
      ) carga ON carga.limpiadora_id = l.id
      WHERE l.activa = true
        AND NOT EXISTS (
          SELECT 1 FROM limpiadora_ausencias a
          WHERE a.limpiadora_id = l.id
            AND ${fecha}::date BETWEEN a.fecha_inicio AND a.fecha_fin
            AND a.aprobada = true
        )
        AND COALESCE(carga.total_min, 0) + COALESCE(${session.tiempo_estimado}, 120) <= ld.horas_max * 60
      ORDER BY prioridad, horas_asignadas_min ASC
      LIMIT 1
    `)

    if (candidatas.length > 0) {
      const c = candidatas[0]
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET limpiadora_id = ${c.id}::uuid WHERE id = ${session.id}::uuid
      `)
      assigned++
      log.push(`✅ ${fecha} ${session.property_id} → ${c.nombre}`)
    } else {
      log.push(`⚠️ ${fecha} ${session.property_id} → sin candidata disponible`)
    }
  }

  return NextResponse.json({ ok: true, total: unassigned.length, assigned, log })
}
