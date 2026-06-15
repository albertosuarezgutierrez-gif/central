import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId, apiError } from '@/lib/tenant'

// Pisos de la empresa (property_id texto) — incidencias no tiene empresa_id,
// se acota por las propiedades que han tenido sesiones de esa empresa.
const propsDeEmpresa = (empresa_id: string) =>
  Prisma.sql`(SELECT DISTINCT property_id FROM cleaning_sessions WHERE empresa_id = ${empresa_id}::uuid)`

export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado') || 'abierta'
    const filtraEstado = estado !== 'todas'

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        i.id::text                AS id,
        i.property_id,
        i.session_id::text        AS session_id,
        i.limpiadora_id::text     AS limpiadora_id,
        i.titulo,
        i.descripcion,
        i.categoria,
        i.urgencia,
        i.estado,
        i.photo_url,
        i.notas_admin,
        i.created_at::text        AS created_at,
        i.resolved_at::text       AS resolved_at,
        p.nombre                  AS propiedad_nombre,
        l.nombre                  AS limpiadora_nombre
      FROM incidencias i
      LEFT JOIN propiedades p ON p.id::text = i.property_id
      LEFT JOIN limpiadoras l ON l.id = i.limpiadora_id
      WHERE i.property_id IN ${propsDeEmpresa(empresa_id)}
        AND (${filtraEstado}::boolean = false OR i.estado = ${estado})
      ORDER BY (i.urgencia = 'urgente') DESC, i.created_at DESC
      LIMIT 100
    `)

    return NextResponse.json({ incidencias: rows })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, estado, notas_admin } = await req.json()

    await prisma.$executeRaw(Prisma.sql`
      UPDATE incidencias i SET
        estado      = ${estado},
        notas_admin = ${notas_admin || null},
        resolved_at = ${estado === 'resuelta' ? new Date().toISOString() : null}::timestamptz
      WHERE i.id = ${id}::uuid
        AND i.property_id IN ${propsDeEmpresa(empresa_id)}
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
