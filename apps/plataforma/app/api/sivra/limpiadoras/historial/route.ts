import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { PROPS_CALENDARIO_IDS } from '@/lib/sivra/constantes'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const property_id = searchParams.get('property_id')

  const dateFilter = (from && to)
    ? Prisma.sql`AND cs.session_date BETWEEN ${from}::date AND ${to}::date`
    : Prisma.sql``
  // cleaning_sessions es multi-tenant (ialimp escribe ahí las limpiezas de otras empresas):
  // sin acotar a los slugs de Alberto, este panel veía sesiones de TODOS los tenants.
  const propFilter = property_id
    ? Prisma.sql`AND cs.property_id = ${property_id}`
    : Prisma.sql`AND cs.property_id = ANY(${PROPS_CALENDARIO_IDS}::text[])`

  const sessions = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      cs.*,
      l.nombre as limpiadora_nombre,
      COUNT(sc.id) FILTER (WHERE sc.checked = true) as items_completados,
      COUNT(sc.id) as items_total,
      EXTRACT(EPOCH FROM (cs.completed_at - cs.started_at))/60 as duracion_minutos
    FROM cleaning_sessions cs
    LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
    LEFT JOIN session_completions sc ON sc.session_id = cs.id
    WHERE true ${dateFilter} ${propFilter}
    GROUP BY cs.id, l.nombre
    ORDER BY cs.session_date DESC
    LIMIT 60
  `)
  return NextResponse.json({ sessions })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, valoracion_admin, notas } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    UPDATE cleaning_sessions SET valoracion_admin = ${valoracion_admin}, notes = ${notas || null}
    WHERE id = ${id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
