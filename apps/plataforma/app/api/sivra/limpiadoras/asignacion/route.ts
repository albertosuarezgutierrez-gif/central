import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET: sugiere la mejor limpiadora para una fecha+propiedad
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')!
  const property_id = searchParams.get('property_id')!

  const d = new Date(fecha + 'T12:00:00')
  const diaSemana = d.getDay() === 0 ? 7 : d.getDay()

  const candidatas: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT
      l.id, l.nombre, l.color, l.propiedades,
      ld.hora_inicio, ld.hora_fin, ld.horas_max,
      COALESCE(carga.total_min, 0) AS horas_asignadas_min,
      CASE WHEN ${property_id} = ANY(l.propiedades::text[]) THEN 1 ELSE 2 END AS prioridad
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
    ORDER BY prioridad, horas_asignadas_min ASC
  `)

  return NextResponse.json({ candidatas })
}

// POST: asigna limpiadora_id a una cleaning_session
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { session_id, limpiadora_id, tipo_limpieza, nota_propietario, tiempo_estimado } = await req.json()

  if (limpiadora_id !== undefined)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET limpiadora_id = ${limpiadora_id ? limpiadora_id + '::uuid' : null}::uuid WHERE id = ${session_id}::uuid`)
  if (tipo_limpieza)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET tipo_limpieza = ${tipo_limpieza} WHERE id = ${session_id}::uuid`)
  if (nota_propietario !== undefined)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET nota_propietario = ${nota_propietario} WHERE id = ${session_id}::uuid`)
  if (tiempo_estimado)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET tiempo_estimado = ${tiempo_estimado} WHERE id = ${session_id}::uuid`)

  const updated: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT cs.*, l.nombre as limpiadora_nombre, l.color as limpiadora_color
    FROM cleaning_sessions cs
    LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
    WHERE cs.id = ${session_id}::uuid
  `)
  return NextResponse.json({ session: updated[0] })
}
