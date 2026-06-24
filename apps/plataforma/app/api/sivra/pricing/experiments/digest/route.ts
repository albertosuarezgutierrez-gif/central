import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/experiments/digest
// Resumen semanal para decidir la BAJA de PriceLabs. Por piso, mide la evidencia de
// que NUESTRO precio (>= baseline de PL) sigue reservando. Lo computa sobre el ADR
// bruto real (revenue_realized) que dejó update_experiment_results().
//
// Criterio de baja (por piso) — ajustable:
//   * >= MIN_CERRADOS experimentos cerrados a precio >= PL, y
//   * ocupacion de esos >= MIN_OCUPACION_PCT %, y
//   * ADR real medio reservado >= baseline medio de PL (batimos a PL en dinero).
const MIN_CERRADOS = 10
const MIN_OCUPACION_PCT = 50

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET (cron semanal) o sesión admin (verlo en pantalla).
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!(secret && bearer === secret)) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      pe.property_id,
      COALESCE(p.name, pe.property_id) AS piso,
      COUNT(*)                                                                          AS total,
      COUNT(*) FILTER (WHERE pe.was_booked IS NULL)                                     AS pendientes,
      COUNT(*) FILTER (WHERE pe.was_booked IS NOT NULL
                         AND pe.price_set >= pe.price_pricelabs)                        AS cerrados_ge_pl,
      COUNT(*) FILTER (WHERE pe.was_booked = true
                         AND pe.price_set >= pe.price_pricelabs)                        AS reservados_ge_pl,
      ROUND(100.0 * COUNT(*) FILTER (WHERE pe.was_booked = true AND pe.price_set >= pe.price_pricelabs)
            / NULLIF(COUNT(*) FILTER (WHERE pe.was_booked IS NOT NULL AND pe.price_set >= pe.price_pricelabs), 0)) AS ocupacion_ge_pl_pct,
      ROUND(AVG(pe.revenue_realized) FILTER (WHERE pe.was_booked = true AND pe.price_set >= pe.price_pricelabs)) AS adr_real_medio,
      ROUND(AVG(pe.price_pricelabs)  FILTER (WHERE pe.was_booked = true AND pe.price_set >= pe.price_pricelabs)) AS pl_baseline_medio,
      COALESCE(SUM(pe.revenue_realized - pe.price_pricelabs)
               FILTER (WHERE pe.was_booked = true AND pe.price_set >= pe.price_pricelabs), 0) AS revenue_extra_vs_pl
    FROM pricing_experiments pe
    LEFT JOIN properties p ON p.id = pe.property_id
    GROUP BY pe.property_id, p.name
    ORDER BY reservados_ge_pl DESC
  `)

  const pisos = rows.map(r => {
    const cerrados = Number(r.cerrados_ge_pl)
    const ocup = r.ocupacion_ge_pl_pct == null ? null : Number(r.ocupacion_ge_pl_pct)
    const adr = r.adr_real_medio == null ? null : Number(r.adr_real_medio)
    const plb = r.pl_baseline_medio == null ? null : Number(r.pl_baseline_medio)
    const listo =
      cerrados >= MIN_CERRADOS &&
      ocup != null && ocup >= MIN_OCUPACION_PCT &&
      adr != null && plb != null && adr >= plb
    return {
      piso: r.piso,
      total: Number(r.total),
      pendientes: Number(r.pendientes),
      cerrados_ge_pl: cerrados,
      reservados_ge_pl: Number(r.reservados_ge_pl),
      ocupacion_ge_pl_pct: ocup,
      adr_real_medio: adr,
      pl_baseline_medio: plb,
      revenue_extra_vs_pl: Number(r.revenue_extra_vs_pl),
      listo_para_baja: listo,
    }
  })

  return NextResponse.json({
    ok: true,
    criterio: { min_cerrados: MIN_CERRADOS, min_ocupacion_pct: MIN_OCUPACION_PCT, regla: "ADR real medio >= baseline PL medio" },
    pisos,
    veredicto_global: pisos.length > 0 && pisos.every(p => p.listo_para_baja)
      ? "TODOS los pisos cumplen — base sólida para cancelar PriceLabs"
      : "Aún no — seguir acumulando experimentos reservados a precio >= PL",
  })
}
