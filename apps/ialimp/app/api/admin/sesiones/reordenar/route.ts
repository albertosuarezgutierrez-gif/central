import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// POST /api/admin/sesiones/reordenar
// Fija el orden manual de las limpiezas de un día (lo que Vanessa arrastra/sube/baja).
//   { session_date, orden: [id1, id2, ...] }  → orden_manual = posición (1..N) de cada id.
//   { session_date, reset: true }             → orden_manual = NULL (vuelve al orden automático).
// Scope obligatorio por empresa_id (frontera multi-tenant) y por session_date.
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { session_date, orden, reset } = await req.json()

    if (!session_date) return NextResponse.json({ error: 'session_date requerido' }, { status: 400 })

    if (reset) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET orden_manual = NULL
        WHERE empresa_id = ${empresa_id}::uuid AND session_date = ${session_date}::date
      `)
      return NextResponse.json({ ok: true, reset: true })
    }

    if (!Array.isArray(orden) || orden.length === 0)
      return NextResponse.json({ error: 'orden debe ser un array de ids' }, { status: 400 })

    // unnest WITH ORDINALITY → posición 1..N; scope empresa + día (no toca otros días/empresas)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE cleaning_sessions cs
      SET orden_manual = v.pos
      FROM (SELECT * FROM unnest(${orden}::uuid[]) WITH ORDINALITY AS t(id, pos)) v
      WHERE cs.id = v.id
        AND cs.empresa_id   = ${empresa_id}::uuid
        AND cs.session_date = ${session_date}::date
    `)

    return NextResponse.json({ ok: true, total: orden.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
