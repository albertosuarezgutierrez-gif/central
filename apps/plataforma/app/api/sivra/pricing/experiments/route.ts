import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/experiments
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      pe.*,
      pe.rate_date::text AS rate_date,
      pe.created_at::text AS created_at,
      pe.result_checked_at::text AS result_checked_at,
      -- Stats globales del experimento
      CASE
        WHEN pe.was_booked = true  THEN 'reservado'
        WHEN pe.was_booked = false THEN 'libre'
        ELSE 'pendiente'
      END AS estado,
      -- Diferencia vs nuestro motor
      pe.price_set - COALESCE(pe.price_ours, 0) AS diff_vs_ours
    FROM pricing_experiments pe
    ORDER BY pe.rate_date DESC
  `)

  // Resumen
  const resumen = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      COUNT(*)                                    AS total,
      COUNT(*) FILTER (WHERE was_booked = true)   AS reservados,
      COUNT(*) FILTER (WHERE was_booked = false)  AS libres,
      COUNT(*) FILTER (WHERE was_booked IS NULL)  AS pendientes,
      ROUND(
        COUNT(*) FILTER (WHERE was_booked = true)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE was_booked IS NOT NULL), 0) * 100
      , 1) AS ocupacion_experimento_pct,
      AVG(price_set)
        FILTER (WHERE was_booked = true)::numeric  AS avg_precio_reservado
    FROM pricing_experiments
  `)

  return NextResponse.json({ experiments: rows, resumen: resumen[0] })
}

// POST /api/sivra/pricing/experiments — registrar override manual
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  const body = await req.json()
  const { property_id, rate_date, price_set, price_ours, notes } = body

  if (!property_id || !rate_date || !price_set) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_experiments
      (property_id, rate_date, price_set, price_ours, notes)
    VALUES
      (${property_id}, ${rate_date}::date, ${price_set}::integer,
       ${price_ours ?? null}::integer, ${notes ?? null})
    ON CONFLICT (property_id, rate_date)
    DO UPDATE SET
      price_set  = EXCLUDED.price_set,
      price_ours = EXCLUDED.price_ours,
      notes      = EXCLUDED.notes
  `)

  return NextResponse.json({ ok: true })
}

// DELETE /api/sivra/pricing/experiments?id=X
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`DELETE FROM pricing_experiments WHERE id = ${parseInt(id)}`)
  return NextResponse.json({ ok: true })
}
