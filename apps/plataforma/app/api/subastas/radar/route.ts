// Lo que ha casado con los criterios de la cuenta. `descartar` alimenta el
// aprendizaje futuro de criterios (mismo espíritu que `banca_destino_reglas`).
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const soloNuevos = new URL(req.url).searchParams.get('no_vistos') === '1'
  const filtro = soloNuevos ? Prisma.sql`AND visto = false` : Prisma.empty

  const anuncios = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, dedupe_key, subasta, puntuacion, motivos, avisos, coste_total, descuento,
           visto, descartado, fecha_fin, created_at
    FROM subastas_radar
    WHERE cuenta_id = ${cuentaId}::uuid AND descartado = false ${filtro}
    ORDER BY puntuacion DESC NULLS LAST, created_at DESC
    LIMIT 200
  `)

  const noVistos = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM subastas_radar
    WHERE cuenta_id = ${cuentaId}::uuid AND visto = false AND descartado = false
  `)

  return NextResponse.json({ anuncios, no_vistos: noVistos[0]?.n ?? 0 })
}

export async function POST(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id, accion } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const campo =
    accion === 'descartar'
      ? Prisma.sql`descartado = true, visto = true`
      : Prisma.sql`visto = true`

  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas_radar SET ${campo}
    WHERE id = ${id}::uuid AND cuenta_id = ${cuentaId}::uuid
  `)
  return NextResponse.json({ ok: true })
}
