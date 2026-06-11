import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Buscador del corpus de licitaciones. El corpus es común; exige sesión.

export async function GET(req: Request) {
  try { await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const sp = new URL(req.url).searchParams
  const cpvList = (sp.get('cpv') || '').split(',').map(s => s.trim()).filter(Boolean)
  const q = (sp.get('q') || '').trim()
  const enPlazo = sp.get('en_plazo') !== '0' // por defecto sí
  const provincia = (sp.get('provincia') || '').trim()
  const min = sp.get('presupuesto_min') ? Number(sp.get('presupuesto_min')) : null
  const max = sp.get('presupuesto_max') ? Number(sp.get('presupuesto_max')) : null
  const orden = sp.get('orden') || 'relevancia'
  const page = Math.max(1, Number(sp.get('page') || '1'))
  const porPagina = 30
  const offset = (page - 1) * porPagina

  const conds: Prisma.Sql[] = []
  if (enPlazo) conds.push(Prisma.sql`fin_presentacion >= current_date`)
  if (cpvList.length) {
    const likes = cpvList.map(p => Prisma.sql`c LIKE ${p + '%'}`)
    conds.push(Prisma.sql`EXISTS (SELECT 1 FROM unnest(cpv) AS c WHERE ${Prisma.join(likes, ' OR ')})`)
  }
  if (q) conds.push(Prisma.sql`fts @@ plainto_tsquery('spanish', ${q})`)
  if (provincia) conds.push(Prisma.sql`provincia ILIKE ${'%' + provincia + '%'}`)
  if (min !== null && Number.isFinite(min)) conds.push(Prisma.sql`presupuesto >= ${min}`)
  if (max !== null && Number.isFinite(max)) conds.push(Prisma.sql`presupuesto <= ${max}`)
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty

  const order =
    orden === 'cierre' ? Prisma.sql`ORDER BY fin_presentacion ASC NULLS LAST`
    : orden === 'presupuesto' ? Prisma.sql`ORDER BY presupuesto DESC NULLS LAST`
    : q ? Prisma.sql`ORDER BY ts_rank(fts, plainto_tsquery('spanish', ${q})) DESC, created_at DESC`
    : Prisma.sql`ORDER BY created_at DESC`

  const resultados = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, titulo, objeto, cpv, presupuesto, organo, provincia, tipo_contrato, estado, fin_presentacion, url
    FROM concursos_licitaciones
    ${where}
    ${order}
    LIMIT ${porPagina} OFFSET ${offset}
  `)
  const totalRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int AS n FROM concursos_licitaciones ${where}
  `)
  return NextResponse.json({ resultados, total: totalRows[0]?.n ?? 0, page })
}
