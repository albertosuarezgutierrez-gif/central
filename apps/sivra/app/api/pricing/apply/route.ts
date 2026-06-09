import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/pricing/apply
//
// APLICA el precio recomendado por el motor (anclado al mercado) escribiéndolo en
// SMOOBU vía su API. Es el paso "recomendar → aplicar". Corre en Vercel, que SÍ tiene
// acceso de red a Smoobu (a diferencia del entorno de desarrollo).
//
// 🔒 PROTECCIONES ("no puede fallar"):
//   - `dryRun` por defecto TRUE: calcula y registra lo que ESCRIBIRÍA, sin tocar Smoobu.
//     Sólo escribe en vivo con `?dryRun=false`.
//   - Sólo pisos con `apply_enabled=true` (gate aparte de `enabled`).
//   - Precio acotado a [suelo, techo] del mercado y a un cambio máx. por aplicación
//     (`max_change_pct`) respecto al precio actual de Smoobu.
//   - Auditoría de cada cambio en `pricing_applied`.
//   - ⚠️ PriceLabs (u otro pricing) debe estar DESCONECTADO en el piso, o sobrescribirá esto.
//
// ⚠️ VERIFICAR EN PREVIEW antes de poner dryRun=false en producción: el formato del POST
//    a Smoobu (`/api/rates`) debe validarse contra la doc de Smoobu con una fecha de prueba.
//
// Protegido por CRON_SECRET (Bearer o ?secret=).

const SMOOBU_KEY = process.env.SMOOBU_API_KEY ?? ""
const BASE = "https://login.smoobu.com/api"

const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const fmt = (d: Date) => d.toISOString().slice(0, 10)

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    const qs = req.nextUrl.searchParams.get("secret")
    if (bearer !== secret && qs !== secret) {
      return NextResponse.json({ error: "no autorizado" }, { status: 401 })
    }
  }

  const sp = req.nextUrl.searchParams
  const onlyProp = sp.get("property")               // opcional: aplicar a un solo piso
  const days = Math.min(Math.max(Number(sp.get("days") ?? 14), 1), 60)
  const dryRun = sp.get("dryRun") !== "false"       // por defecto TRUE (no escribe)

  // Precio recomendado por piso (mercado × demanda × calidad, acotado), igual que /recommend,
  // resuelto en SQL para no duplicar lógica. Sólo pisos con apply_enabled=true.
  const recs = await prisma.$queryRaw<{
    property_id: string; recommended: number; floor: number; ceil: number; max_change_pct: number
  }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) sd FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0 GROUP BY scenario
    ),
    mkt AS (
      SELECT m.scenario,
        percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY m.price_night)::numeric med,
        percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY m.price_night)::numeric flo,
        percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY m.price_night)::numeric cei,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY m.score)::numeric mkt_score
      FROM market_rates m JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
      JOIN pricing_settings s ON s.property_id = m.scenario
      WHERE m.price_night > 0
      GROUP BY m.scenario, s.target_pctl, s.floor_pctl, s.ceil_pctl
    ),
    occ AS (
      SELECT property_id scenario, (1 - AVG(available))::numeric occupancy
      FROM rate_snapshots WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND rate_date >= CURRENT_DATE AND available IS NOT NULL GROUP BY property_id
    )
    SELECT
      mkt.scenario AS property_id,
      LEAST(GREATEST(
        ROUND(mkt.med
          * GREATEST(LEAST(1 + (COALESCE(occ.occupancy,0.5) - s.demand_baseline) * s.demand_k, 1.10), 0.92)
          * GREATEST(LEAST(1 + (s.own_score - mkt.mkt_score) * s.quality_k, 1.10), 0.90)),
        ROUND(mkt.flo)), ROUND(mkt.cei))::int AS recommended,
      ROUND(mkt.flo)::int AS floor, ROUND(mkt.cei)::int AS ceil,
      s.max_change_pct::numeric AS max_change_pct
    FROM mkt
    JOIN pricing_settings s ON s.property_id = mkt.scenario
    WHERE s.apply_enabled = true
      AND (${onlyProp}::text IS NULL OR mkt.scenario = ${onlyProp})
  `)

  if (recs.length === 0) {
    return NextResponse.json({ ok: true, dryRun, applied: 0, message: "Ningún piso con apply_enabled=true (o filtro sin match)" })
  }

  const today = new Date()
  const end = new Date(today); end.setDate(end.getDate() + days)
  const startDate = fmt(today), endDate = fmt(end)

  const results: any[] = []

  for (const r of recs) {
    const smoobuId = SMOOBU_ID[r.property_id]
    if (!smoobuId) { results.push({ property: r.property_id, error: "sin smoobuId" }); continue }

    // 1) Precio/disponibilidad actuales en Smoobu (para tope de cambio + sólo fechas disponibles).
    let plRates: Record<string, { price: number | null; available: number }> = {}
    try {
      const res = await fetch(`${BASE}/rates?apartments[]=${smoobuId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { "Api-Key": SMOOBU_KEY, "Cache-Control": "no-cache" }, next: { revalidate: 0 } })
      if (!res.ok) { results.push({ property: r.property_id, error: `Smoobu GET ${res.status}` }); continue }
      plRates = (await res.json()).data?.[smoobuId] ?? {}
    } catch (e) {
      results.push({ property: r.property_id, error: `Smoobu GET ${String(e).slice(0, 80)}` }); continue
    }

    const ops: { dates: string[]; daily_price: number }[] = []
    const audit: { rate_date: string; old_price: number | null; new_price: number }[] = []
    const cur = new Date(today)
    while (cur <= end) {
      const date = fmt(cur); cur.setDate(cur.getDate() + 1)
      const info = plRates[date]
      if (!info || !info.available) continue            // sólo fechas disponibles
      const old = info.price != null ? Math.round(info.price) : null
      // Tope de cambio por aplicación: no mover más de max_change_pct respecto al precio actual.
      let target = r.recommended
      if (old != null) {
        const lo = Math.round(old * (1 - Number(r.max_change_pct)))
        const hi = Math.round(old * (1 + Number(r.max_change_pct)))
        target = clamp(target, lo, hi)
      }
      target = clamp(target, r.floor, r.ceil)            // y siempre dentro del mercado
      if (old != null && target === old) continue        // sin cambio
      ops.push({ dates: [date], daily_price: target })
      audit.push({ rate_date: date, old_price: old, new_price: target })
    }

    // 2) Escribir en Smoobu (sólo si NO es dry-run).
    let written = false
    if (!dryRun && ops.length > 0) {
      try {
        const res = await fetch(`${BASE}/rates`, {
          method: "POST",
          headers: { "Api-Key": SMOOBU_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ apartments: [smoobuId], operations: ops }),
        })
        written = res.ok
        if (!res.ok) results.push({ property: r.property_id, error: `Smoobu POST ${res.status}` })
      } catch (e) {
        results.push({ property: r.property_id, error: `Smoobu POST ${String(e).slice(0, 80)}` })
      }
    }

    // 3) Auditoría (registra lo aplicado o lo que se habría aplicado en dry-run).
    for (const a of audit) {
      try {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run)
          VALUES (${r.property_id}, ${a.rate_date}::date, ${a.old_price}::int, ${a.new_price}::int, ${dryRun})`)
      } catch { /* no crítico */ }
    }

    results.push({
      property: r.property_id, recommended: r.recommended,
      dates_con_cambio: ops.length, written, sample: audit.slice(0, 3),
    })
  }

  return NextResponse.json({ ok: true, dryRun, days, properties: recs.length, results })
}
