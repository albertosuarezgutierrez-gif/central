import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId, apiError } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    // Scope obligatorio: la sesión debe ser de la empresa.
    const owns = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM cleaning_sessions
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      LIMIT 1
    `)
    if (!owns.length) {
      return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    }

    const sesionRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        cs.id,
        cs.property_name,
        cs.completed_at::text  AS completed_at,
        cs.hora_llegada::text  AS hora_llegada,
        cs.hora_salida::text   AS hora_salida,
        l.nombre               AS limpiadora_nombre
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      WHERE cs.id = ${id}::uuid AND cs.empresa_id = ${empresa_id}::uuid
      LIMIT 1
    `)

    const completions = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        item_description,
        checked,
        photo_url,
        photo_url_2,
        photo_url_3,
        notes,
        completed_at::text AS completed_at
      FROM session_completions
      WHERE session_id = ${id}::uuid
      ORDER BY completed_at NULLS LAST, item_description
    `)

    return NextResponse.json(serialize({ sesion: sesionRows[0], completions }))
  } catch (e: any) {
    return apiError(e)
  }
}
