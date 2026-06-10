import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/pricing/restore?property=prop_xxx
//
// Botón "Restaurar precio anterior": reescribe en Smoobu el `old_price` que el motor guardó en
// pricing_applied (último cambio REAL por fecha) para las fechas futuras de ese piso. Red de
// seguridad para deshacer una aplicación. Exige sesión admin o CRON_SECRET.

const SMOOBU_KEY = process.env.SMOOBU_API_KEY ?? ""
const BASE = "https://login.smoobu.com/api"
const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

export async function POST(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  const property = req.nextUrl.searchParams.get("property") ?? ""
  const smoobuId = SMOOBU_ID[property]
  if (!smoobuId) return NextResponse.json({ error: "property inválida" }, { status: 400 })
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true"

  // Último cambio real por fecha futura con old_price conocido.
  const rows = await prisma.$queryRaw<{ rate_date: string; old_price: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (rate_date) rate_date::text, old_price
    FROM pricing_applied
    WHERE property_id = ${property} AND dry_run = false
      AND old_price IS NOT NULL AND rate_date >= CURRENT_DATE
    ORDER BY rate_date, created_at DESC
  `)
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, restored: 0, message: "Sin precios anteriores que restaurar" })
  }

  const operations = rows.map(r => ({ dates: [r.rate_date], daily_price: r.old_price }))
  let written = false
  if (!dryRun) {
    try {
      const res = await fetch(`${BASE}/rates`, {
        method: "POST",
        headers: { "Api-Key": SMOOBU_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ apartments: [smoobuId], operations }),
      })
      written = res.ok
      if (!res.ok) return NextResponse.json({ ok: false, error: `Smoobu POST ${res.status}` }, { status: 502 })
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Smoobu POST ${String(e).slice(0, 80)}` }, { status: 502 })
    }
    // Auditar la restauración (new = old anterior).
    for (const r of rows) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run)
        VALUES (${property}, ${r.rate_date}::date, NULL, ${r.old_price}::int, false)`).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, restored: rows.length, written, dryRun, sample: rows.slice(0, 3) })
}
