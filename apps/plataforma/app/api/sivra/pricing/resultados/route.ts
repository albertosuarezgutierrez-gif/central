import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/resultados
// Medidor de resultados: Δ CON SIGNO (precio nuevo − precio anterior) del motor en noches que
// luego se vendieron. Cruza pricing_applied (cambios reales) con rate_snapshots.was_booked.
//
// ⚠️ NO es «extra vs PriceLabs» (así se etiquetaba hasta el 25/08/2026): `old_price` es el precio
// que puso el PROPIO motor en su pasada anterior, no PL. Hasta ese día un GREATEST(…,0) además
// recortaba las bajadas (publicaba 0€ donde el neto real era −42€); ahora suma con signo — una
// bajada vendida resta. El contrafactual PriceLabs de verdad es /sivra/pricing-rentabilidad.
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
    nota: "Δ con signo (precio nuevo − precio anterior DEL MOTOR) en noches aplicadas que se reservaron. No es una comparación con PriceLabs: el contrafactual real vive en Motor vs PL (/sivra/pricing-rentabilidad).",
  })
}
