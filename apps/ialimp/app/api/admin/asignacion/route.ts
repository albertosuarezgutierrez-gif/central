import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET:  devuelve TODAS las limpiadoras activas de la empresa para una fecha+propiedad,
//       ordenadas por idoneidad (conoce propiedad > disponible hoy > menos carga) y
//       marcando disponibilidad/ausencia. No excluye a nadie: permite override manual.
export async function GET(req: NextRequest) {
  const empresaId = await requireEmpresaId()
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')!         // YYYY-MM-DD
  const property_id = searchParams.get('property_id') || ''

  const d = new Date(fecha + 'T12:00:00')
  // dia_semana 1=lunes, 7=domingo (ISO)
  const diaSemana = d.getDay() === 0 ? 7 : d.getDay()

  const candidatas: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT
      l.id, l.nombre, l.color, l.propiedades,
      ld.hora_inicio, ld.hora_fin, ld.horas_max,
      (ld.limpiadora_id IS NOT NULL) AS disponible_hoy,
      EXISTS (
        SELECT 1 FROM limpiadora_ausencias a
        WHERE a.limpiadora_id = l.id
          AND ${fecha}::date BETWEEN a.fecha_inicio AND a.fecha_fin
          AND a.aprobada = true
      ) AS ausente,
      COALESCE(carga.total_min, 0)::int AS horas_asignadas_min,
      CASE WHEN ${property_id} = ANY(l.propiedades::text[]) THEN 1 ELSE 2 END AS prioridad
    FROM limpiadoras l
    LEFT JOIN (
      SELECT limpiadora_id,
             MIN(hora_inicio) AS hora_inicio,
             MAX(hora_fin)    AS hora_fin,
             MAX(horas_max)   AS horas_max
      FROM limpiadora_disponibilidad
      WHERE dia_semana = ${diaSemana} AND activo = true
      GROUP BY limpiadora_id
    ) ld ON ld.limpiadora_id = l.id
    LEFT JOIN (
      SELECT limpiadora_id, SUM(COALESCE(tiempo_estimado, 120)) AS total_min
      FROM cleaning_sessions
      WHERE session_date = ${fecha}::date
        AND limpiadora_id IS NOT NULL
        AND empresa_id = ${empresaId}::uuid
      GROUP BY limpiadora_id
    ) carga ON carga.limpiadora_id = l.id
    WHERE l.activa = true
      AND l.empresa_id = ${empresaId}::uuid
    ORDER BY ausente ASC, prioridad ASC, disponible_hoy DESC, horas_asignadas_min ASC, l.nombre ASC
  `)

  return NextResponse.json({ candidatas })
}

// POST: asigna/cambia limpiadora_id (u otros campos) de una cleaning_session de la empresa
export async function POST(req: NextRequest) {
  const empresaId = await requireEmpresaId()
  const { session_id, limpiadora_id, tipo_limpieza, nota_propietario, tiempo_estimado } = await req.json()

  if (limpiadora_id !== undefined)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET limpiadora_id = ${limpiadora_id}::uuid WHERE id = ${session_id}::uuid AND empresa_id = ${empresaId}::uuid`)
  if (tipo_limpieza)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET tipo_limpieza = ${tipo_limpieza} WHERE id = ${session_id}::uuid AND empresa_id = ${empresaId}::uuid`)
  if (nota_propietario !== undefined)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET nota_propietario = ${nota_propietario} WHERE id = ${session_id}::uuid AND empresa_id = ${empresaId}::uuid`)
  if (tiempo_estimado)
    await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET tiempo_estimado = ${tiempo_estimado} WHERE id = ${session_id}::uuid AND empresa_id = ${empresaId}::uuid`)

  const updated: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT cs.*, l.nombre as limpiadora_nombre, l.color as limpiadora_color
    FROM cleaning_sessions cs
    LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
    WHERE cs.id = ${session_id}::uuid AND cs.empresa_id = ${empresaId}::uuid
  `)
  return NextResponse.json({ session: updated[0] })
}
