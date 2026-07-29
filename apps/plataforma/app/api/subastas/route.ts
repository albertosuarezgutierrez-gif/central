// Listado del corpus de subastas, paginado en SERVIDOR (regla de rendimiento:
// nunca montar cientos de filas de golpe).
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'
import { evaluarOportunidad } from '@central/module-subastas'
import { COLS_SUBASTA, filaASubasta } from '@/lib/subastas-radar'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 30

export async function GET(req: NextRequest) {
  try {
    await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const sp = new URL(req.url).searchParams
  const provincia = sp.get('provincia')
  const q = sp.get('q')
  const enPlazo = sp.get('en_plazo') !== 'false'
  const precioMax = sp.get('precio_max')
  const pagina = Math.max(parseInt(sp.get('page') || '1', 10) || 1, 1)
  const offset = (pagina - 1) * POR_PAGINA

  const cond: Prisma.Sql[] = [Prisma.sql`es_inmueble = true`]
  if (provincia && provincia !== 'all') cond.push(Prisma.sql`provincia = ${provincia}`)
  if (enPlazo) cond.push(Prisma.sql`(fecha_fin IS NULL OR fecha_fin >= now())`)
  if (precioMax) {
    const p = Number(precioMax)
    if (Number.isFinite(p)) cond.push(Prisma.sql`(valor_subasta IS NULL OR valor_subasta <= ${p})`)
  }
  if (q && q.trim()) cond.push(Prisma.sql`fts @@ plainto_tsquery('spanish', ${q.trim()})`)

  const where = Prisma.sql`WHERE ${Prisma.join(cond, ' AND ')}`

  try {
    const [filas, total] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${COLS_SUBASTA} FROM subastas ${where}
        ORDER BY fecha_fin ASC NULLS LAST, actualizado_en DESC
        LIMIT ${POR_PAGINA} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM subastas ${where}`),
    ])

    // La oportunidad se calcula al vuelo: es determinista y barato, y así
    // refleja siempre el último enriquecimiento sin quedarse cacheada.
    const resultados = filas.map((f) => {
      const s = filaASubasta(f)
      return { subasta: s, oportunidad: evaluarOportunidad(s) }
    })

    return NextResponse.json({
      resultados,
      total: total[0]?.total ?? 0,
      pagina,
      porPagina: POR_PAGINA,
    })
  } catch (e: any) {
    console.error('[api/subastas]', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
