// GET /api/admin/limpiadoras/ranking — Ranking de rendimiento de limpiadoras
// de la empresa, sobre la vista `rendimiento_limpiadoras`. Scope por empresa_id
// (cookie de sesión admin). La puntuación vive en lib/scoring-limpiadoras (pura).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { rankingLimpiadoras } from '@/lib/scoring-limpiadoras'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT limpiadora_id::text AS limpiadora_id, limpiadora_nombre,
             total_sesiones, total_quejas, rating_medio
      FROM rendimiento_limpiadoras
      WHERE empresa_id = ${empresa_id}::uuid
    `)
    // Las columnas bigint llegan como BigInt y numeric como Decimal/string:
    // se normalizan a number (y rating null si no hay valoraciones).
    const ranking = rankingLimpiadoras(
      filas.map(f => ({
        limpiadora_id: String(f.limpiadora_id),
        limpiadora_nombre: f.limpiadora_nombre ?? null,
        total_sesiones: Number(f.total_sesiones ?? 0),
        total_quejas: Number(f.total_quejas ?? 0),
        rating_medio: f.rating_medio == null ? null : Number(f.rating_medio),
      })),
    )
    return NextResponse.json({ ranking })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
