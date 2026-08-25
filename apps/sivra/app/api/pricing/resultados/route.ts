import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/pricing/resultados
// Medidor de resultados: suma de las SUBIDAS que aplicó el motor en noches que luego se vendieron.
// Cruza pricing_applied (cambios reales) con rate_snapshots.was_booked (si la noche se vendió).
//
// ⚠️ NO es «extra vs PriceLabs» (así se etiquetaba hasta el 25/08/2026): `old_price` es el precio
// que puso el PROPIO motor en su pasada anterior, no PL. Y `GREATEST(…, 0)` cuenta solo las
// subidas e ignora las bajadas, así que el número es un tope optimista, no un beneficio neto —
// con el motor moviendo precios a diario, la diferencia importa. Léelo como «cuánto subimos en
// noches que acabaron vendiéndose», nunca como euros ganados frente a una alternativa.
// Detrás del login admin (middleware). El argumento de venta del producto.
export async function GET() {
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
      SUM(GREATEST(a.new_price - a.old_price, 0)) FILTER (WHERE b.was_booked)::int AS extra_eur,
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
    nota: "Suma de subidas (precio nuevo − precio anterior DEL MOTOR, solo si >0) en noches aplicadas que se reservaron. No es un neto ni una comparación con PriceLabs.",
  })
}
