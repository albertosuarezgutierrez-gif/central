// Lo que ha casado con los criterios de la cuenta. `descartar` alimenta el
// aprendizaje futuro de criterios (mismo espíritu que `banca_destino_reglas`).
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'
import { RADAR_CON_CORPUS, RADAR_VIGENTE } from '@/lib/subastas-radar'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const soloNuevos = new URL(req.url).searchParams.get('no_vistos') === '1'
  const filtro = soloNuevos ? Prisma.sql`AND r.visto = false` : Prisma.empty

  // `RADAR_VIGENTE` deja fuera lo ya cerrado: la bandeja es de cosas que aún
  // se pueden pujar, no un histórico (para eso está el corpus).
  const anuncios = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.dedupe_key, r.subasta, r.puntuacion, r.motivos, r.avisos, r.coste_total,
           r.descuento, r.visto, r.descartado, COALESCE(s.fecha_fin, r.fecha_fin) AS fecha_fin,
           r.created_at
    ${RADAR_CON_CORPUS}
    WHERE r.cuenta_id = ${cuentaId}::uuid AND ${RADAR_VIGENTE} ${filtro}
    ORDER BY r.puntuacion DESC NULLS LAST, r.created_at DESC
    LIMIT 200
  `)

  // El contador va por el MISMO filtro: un badge que cuenta subastas cerradas
  // manda a Alberto a una bandeja donde no hay nada que hacer.
  const noVistos = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    ${RADAR_CON_CORPUS}
    WHERE r.cuenta_id = ${cuentaId}::uuid AND r.visto = false AND ${RADAR_VIGENTE}
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
