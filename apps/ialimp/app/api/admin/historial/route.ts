import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')

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
    WHERE cs.empresa_id = ${empresa_id}::uuid
      AND (${property_id}::text IS NULL OR cs.property_id = ${property_id})
    GROUP BY cs.id, l.nombre
    ORDER BY cs.session_date DESC
    LIMIT 60
  `)

  // Serializar BigInt (COUNT devuelve BigInt en PostgreSQL)
  const serialized = sessions.map((s) => ({
    ...s,
    items_completados: Number(s.items_completados ?? 0),
    items_total: Number(s.items_total ?? 0),
  }))

  return NextResponse.json({ sessions: serialized })
}

export async function PATCH(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { id, valoracion_admin, notas } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    UPDATE cleaning_sessions SET valoracion_admin = ${valoracion_admin}, notes = ${notas || null}
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
