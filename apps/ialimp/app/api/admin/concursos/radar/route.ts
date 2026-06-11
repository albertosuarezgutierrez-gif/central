import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Lista de anuncios captados por el radar para la empresa. ?no_vistos=1 para filtrar.

export async function GET(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const soloNoVistos = new URL(req.url).searchParams.get('no_vistos') === '1'
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, anuncio, puntuacion, motivos, visto, created_at
    FROM concursos_radar_anuncios
    WHERE empresa_id = ${empresa_id}::uuid
      ${soloNoVistos ? Prisma.sql`AND visto = false` : Prisma.empty}
    ORDER BY created_at DESC
    LIMIT 200
  `)
  const noVistos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int AS n FROM concursos_radar_anuncios
    WHERE empresa_id = ${empresa_id}::uuid AND visto = false
  `)
  return NextResponse.json({ anuncios: rows, no_vistos: noVistos[0]?.n ?? 0 })
}
