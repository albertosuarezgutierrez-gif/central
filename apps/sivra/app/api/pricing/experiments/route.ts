import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/pricing/experiments
export async function GET() {
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
      -- Diferencia vs PriceLabs
      pe.price_set - COALESCE(pe.price_pricelabs, 0) AS diff_vs_pl,
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
      -- Revenue extra vs lo que habría cobrado PL
      SUM(price_set - COALESCE(price_pricelabs, 0))
        FILTER (WHERE was_booked = true)           AS revenue_extra_vs_pl,
      AVG(price_set)
        FILTER (WHERE was_booked = true)::numeric  AS avg_precio_reservado
    FROM pricing_experiments
  `)

  return NextResponse.json({ experiments: rows, resumen: resumen[0] })
}

// POST /api/pricing/experiments — registrar override manual
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { property_id, rate_date, price_set, price_pricelabs, price_ours, notes } = body

  if (!property_id || !rate_date || !price_set) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_experiments
      (property_id, rate_date, price_set, price_pricelabs, price_ours, notes)
    VALUES
      (${property_id}, ${rate_date}::date, ${price_set}::integer,
       ${price_pricelabs ?? null}::integer, ${price_ours ?? null}::integer,
       ${notes ?? null})
    ON CONFLICT (property_id, rate_date)
    DO UPDATE SET
      price_set     = EXCLUDED.price_set,
      price_pricelabs = EXCLUDED.price_pricelabs,
      price_ours    = EXCLUDED.price_ours,
      notes         = EXCLUDED.notes
  `)

  return NextResponse.json({ ok: true })
}

// DELETE /api/pricing/experiments?id=X
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`DELETE FROM pricing_experiments WHERE id = ${parseInt(id)}`)
  return NextResponse.json({ ok: true })
}
