import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/resultados
// Medidor de resultados: euros extra generados por el motor vs lo que habría cobrado PriceLabs.
// Cruza pricing_applied (cambios reales) con rate_snapshots.was_booked (si la noche se vendió).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  const porPiso = await prisma.$queryRaw<{
    property_id: string; noches_aplicadas: number; noches_reservadas: number
    extra_eur: number | null; pendientes: number
  }[]>(Prisma.sql`
    WITH applied AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, old_price, new_price
      FROM pricing_applied
      WHERE dry_run = false AND old_price IS NOT NULL
      ORDER BY property_id, rate_date, applied_at DESC
    ),
    booked AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, was_booked
      FROM rate_snapshots
      WHERE was_booked IS NOT NULL
      ORDER BY property_id, rate_date, snapshot_date DESC
    )
    SELECT
      a.property_id,
      COUNT(*)::int AS noches_aplicadas,
      COUNT(*) FILTER (WHERE b.was_booked)::int AS noches_reservadas,
      SUM(a.new_price - a.old_price) FILTER (WHERE b.was_booked)::int AS extra_eur,
      COUNT(*) FILTER (WHERE a.rate_date >= CURRENT_DATE)::int AS pendientes
    FROM applied a
    LEFT JOIN booked b USING (property_id, rate_date)
    GROUP BY a.property_id
    ORDER BY a.property_id
  `)

  const total = porPiso.reduce((s, p) => s + (Number(p.extra_eur) || 0), 0)
  const nochesReservadas = porPiso.reduce((s, p) => s + p.noches_reservadas, 0)

  return NextResponse.json({
    ok: true,
    total_extra_eur: total,
    noches_reservadas: nochesReservadas,
    por_piso: porPiso,
    // 🚨 Dos honestidades añadidas el 25/08/2026: (a) el GREATEST(...,0) anterior recortaba los
    // deltas NEGATIVOS (toda bajada contaba 0 → el medidor solo podía subir); (b) `old_price` es el
    // precio ANTERIOR — desde la baja de PL, el del propio motor salvo en el primer cambio tras el
    // go-live, así que esto NO es un contrafactual PriceLabs. El de verdad: /sivra/pricing-rentabilidad.
    nota: "Extra = (precio nuevo − precio anterior) en noches aplicadas que se reservaron. OJO: el precio anterior es el del PROPIO motor salvo el primer cambio tras el go-live; el contrafactual PriceLabs real vive en Motor vs PL.",
  })
}
