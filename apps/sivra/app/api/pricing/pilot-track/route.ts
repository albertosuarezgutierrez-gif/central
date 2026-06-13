import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { notifyOwner } from "@/lib/pricing-notify"
import { evaluatePilot, type PilotVerdict } from "@/lib/pilot-track"
import { computeRecommendation, recommendedBaseFromEngine, percentile } from "@/lib/pricing-engine"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/pricing/pilot-track  (cron diario ~09:15)
//
// Agente de seguimiento del piloto de precio dinámico. Por cada piso con pilot_enabled=true:
//   - Mide ocupación/noches libres a 90d, días sin reserva NUEVA, € extra vs PriceLabs, ritmo (pace),
//     y mediana del mercado (precio huésped).
//   - Decide un veredicto (lib/pilot-track) con anti-falso-positivo y diagnóstico (caros / sin demanda).
//   - Solo PROPONE bajadas (no escribe precio en Smoobu); persiste histórico y avisa al propietario.
//   - Watchdog: avisa si el snapshot o el mercado están viejos ("el agente que vigila al agente").
//
// ?dryRun=1 → calcula y responde, pero NO persiste ni notifica (para verificar).

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center: "Duplex Center",
  prop_luxury_busto: "Luxury Busto",
  prop_busto_reform: "Busto Reform",
}

type Row = {
  property_id: string; verdict: PilotVerdict
  free_nights_60: number; booked_nights_60: number; occupancy_60: number | null
  days_since_booking: number; current_base: number | null; extra_eur: number
  pace_vs_last_year: number | null; market_p50_guest: number | null
  open_horizon_days: number | null; recommended_base: number | null
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  const dryRun = ["1", "true"].includes(req.nextUrl.searchParams.get("dryRun") ?? "")

  // Pisos con piloto activo + sus perillas + parámetros del MOTOR (mismos defaults que recommend),
  // para calcular la propuesta con la fuente única (lib/pricing-engine) en vez de una fórmula aparte.
  const settings = await prisma.$queryRaw<{
    property_id: string; pilot_no_booking_days: number
    channel_markup: number; min_price: number | null; max_price: number | null; max_change_pct: number
    target_pctl: number; floor_pctl: number; ceil_pctl: number; position_factor: number
    quality_k: number; demand_k: number; demand_baseline: number; own_score: number | null
  }[]>(Prisma.sql`
    SELECT property_id, pilot_no_booking_days,
      COALESCE(channel_markup, 1.16)::float8  AS channel_markup,
      min_price, max_price,
      COALESCE(max_change_pct, 0.20)::float8  AS max_change_pct,
      COALESCE(target_pctl, 0.50)::float8     AS target_pctl,
      COALESCE(floor_pctl, 0.25)::float8      AS floor_pctl,
      COALESCE(ceil_pctl, 0.90)::float8       AS ceil_pctl,
      COALESCE(position_factor, 1.0)::float8  AS position_factor,
      COALESCE(quality_k, 0.04)::float8       AS quality_k,
      COALESCE(demand_k, 0.16)::float8        AS demand_k,
      COALESCE(demand_baseline, 0.50)::float8 AS demand_baseline,
      own_score::float8 AS own_score
    FROM pricing_settings WHERE pilot_enabled = true`)

  if (settings.length === 0) {
    return NextResponse.json({ ok: true, nota: "ningún piso con pilot_enabled", pisos: [] })
  }

  // Stats de la ventana de 90d (último snapshot por piso). window_nights = cobertura real con dato
  // (puede ser < 60 si el snapshot aún no se amplió); occupancy solo sobre filas con `available`.
  const win = await prisma.$queryRaw<{
    property_id: string; window_nights: number; free_nights: number; occupancy_60: number | null
  }[]>(Prisma.sql`
    WITH latest AS (SELECT property_id, MAX(snapshot_date) sd FROM rate_snapshots GROUP BY property_id)
    SELECT rs.property_id,
      COUNT(*) FILTER (WHERE rs.available IS NOT NULL)::int AS window_nights,
      SUM((rs.available = 1)::int)::int AS free_nights,
      ROUND(1 - AVG(rs.available) FILTER (WHERE rs.available IS NOT NULL)::numeric, 2) AS occupancy_60
    FROM rate_snapshots rs
    JOIN latest l ON l.property_id = rs.property_id AND l.sd = rs.snapshot_date
    WHERE rs.rate_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
    GROUP BY rs.property_id`)

  // Noches REALMENTE reservadas en la ventana (cruce con incomes), para distinguir
  // "reservado" de "bloqueado" (available=0 incluye ambos).
  const bk = await prisma.$queryRaw<{ property_id: string; booked_nights: number }[]>(Prisma.sql`
    WITH latest AS (SELECT property_id, MAX(snapshot_date) sd FROM rate_snapshots GROUP BY property_id)
    SELECT rs.property_id, COUNT(*)::int AS booked_nights
    FROM rate_snapshots rs
    JOIN latest l ON l.property_id = rs.property_id AND l.sd = rs.snapshot_date
    WHERE rs.rate_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
      AND EXISTS (
        SELECT 1 FROM incomes i
        WHERE i."propertyId" = rs.property_id
          AND i."checkIn"::date <= rs.rate_date AND i."checkOut"::date > rs.rate_date)
    GROUP BY rs.property_id`)

  // Chivato de horizonte: hasta qué día hay disponibilidad real (available=1) en el último snapshot.
  // Acotado al horizonte del snapshot (90d), así que un piso abierto >90d dará ~90 (sin falsa alarma).
  const horizon = await prisma.$queryRaw<{ property_id: string; open_horizon_days: number | null }[]>(Prisma.sql`
    WITH latest AS (SELECT property_id, MAX(snapshot_date) sd FROM rate_snapshots GROUP BY property_id)
    SELECT rs.property_id,
      (MAX(rs.rate_date) FILTER (WHERE rs.available = 1) - CURRENT_DATE)::int AS open_horizon_days
    FROM rate_snapshots rs
    JOIN latest l ON l.property_id = rs.property_id AND l.sd = rs.snapshot_date
    WHERE rs.rate_date >= CURRENT_DATE
    GROUP BY rs.property_id`)

  // Precio base actual: el de la fecha futura más próxima del último snapshot.
  const base = await prisma.$queryRaw<{ property_id: string; current_base: number | null }[]>(Prisma.sql`
    WITH latest AS (SELECT property_id, MAX(snapshot_date) sd FROM rate_snapshots GROUP BY property_id)
    SELECT DISTINCT ON (rs.property_id) rs.property_id, rs.price_pricelabs AS current_base
    FROM rate_snapshots rs
    JOIN latest l ON l.property_id = rs.property_id AND l.sd = rs.snapshot_date
    WHERE rs.rate_date >= CURRENT_DATE AND rs.price_pricelabs IS NOT NULL
    ORDER BY rs.property_id, rs.rate_date`)

  // Días desde la última reserva NUEVA creada.
  const since = await prisma.$queryRaw<{ property_id: string; days_since_booking: number | null }[]>(Prisma.sql`
    SELECT "propertyId" AS property_id, (CURRENT_DATE - MAX("createdAt"::date))::int AS days_since_booking
    FROM incomes GROUP BY "propertyId"`)

  // Mercado por piso (array de comparables de la última captura) — alimenta el MOTOR compartido.
  const marketRows = await prisma.$queryRaw<{ property_id: string; price: number; score: number | null }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) AS sd FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0 GROUP BY scenario
    )
    SELECT m.scenario AS property_id, m.price_night::float8 AS price, m.score::float8 AS score
    FROM market_rates m JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
    WHERE m.price_night > 0`)
  const marketByPiso: Record<string, { prices: number[]; scores: number[] }> = {}
  for (const r of marketRows) {
    const g = (marketByPiso[r.property_id] ??= { prices: [], scores: [] })
    g.prices.push(Number(r.price))
    if (r.score != null) g.scores.push(Number(r.score))
  }

  // € extra vs PriceLabs (misma lógica que /api/pricing/resultados, por piso).
  const extra = await prisma.$queryRaw<{ property_id: string; extra_eur: number | null }[]>(Prisma.sql`
    WITH applied AS (
      SELECT DISTINCT ON (property_id, rate_date) property_id, rate_date, old_price, new_price
      FROM pricing_applied WHERE dry_run = false AND old_price IS NOT NULL
      ORDER BY property_id, rate_date, applied_at DESC
    ),
    booked AS (
      SELECT DISTINCT ON (property_id, rate_date) property_id, rate_date, was_booked
      FROM rate_snapshots WHERE was_booked IS NOT NULL
      ORDER BY property_id, rate_date, snapshot_date DESC
    )
    SELECT a.property_id,
      SUM(GREATEST(a.new_price - a.old_price, 0)) FILTER (WHERE b.was_booked)::int AS extra_eur
    FROM applied a LEFT JOIN booked b USING (property_id, rate_date)
    GROUP BY a.property_id`)

  // Ritmo de reservas: creadas últimos 30d vs misma ventana hace un año.
  const pace = await prisma.$queryRaw<{ property_id: string; recent: number; last_year: number }[]>(Prisma.sql`
    SELECT "propertyId" AS property_id,
      COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_DATE - 30)::int AS recent,
      COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_DATE - 395 AND "createdAt" < CURRENT_DATE - 365)::int AS last_year
    FROM incomes GROUP BY "propertyId"`)

  // Watchdog del pipeline (#2).
  const fresh = await prisma.$queryRaw<{ snap: Date | null; mkt: Date | null }[]>(Prisma.sql`
    SELECT (SELECT MAX(snapshot_date) FROM rate_snapshots) AS snap,
           (SELECT MAX(search_date) FROM market_rates) AS mkt`)
  const watchdog: string[] = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const ageDays = (d: Date | null) => (d ? Math.round((+today - +new Date(d)) / 86400000) : null)
  const snapAge = ageDays(fresh[0]?.snap ?? null)
  const mktAge = ageDays(fresh[0]?.mkt ?? null)
  if (snapAge == null || snapAge >= 1) watchdog.push(`Snapshot viejo (${snapAge ?? "nunca"}d) — ¿corrió rates/snapshot?`)
  if (mktAge == null || mktAge > 7) watchdog.push(`Mercado viejo (${mktAge ?? "nunca"}d) — refresca market_rates (ingest).`)

  const byId = <T extends { property_id: string }>(arr: T[]) =>
    Object.fromEntries(arr.map((r) => [r.property_id, r]))
  const W = byId(win), BK = byId(bk), B = byId(base), S = byId(since), E = byId(extra), P = byId(pace), H = byId(horizon)

  const pisos: Row[] = []
  for (const s of settings) {
    const id = s.property_id
    const windowNights = Number(W[id]?.window_nights ?? 0)
    const freeNights = Number(W[id]?.free_nights ?? 0)
    const bookedNights = Number(BK[id]?.booked_nights ?? 0)
    const occupancy60 = W[id]?.occupancy_60 != null ? Number(W[id].occupancy_60) : null
    const daysSinceBooking = Number(S[id]?.days_since_booking ?? 999)
    const currentBase = B[id]?.current_base != null ? Number(B[id].current_base) : null
    const channelMarkup = Number(s.channel_markup)
    const minPrice = s.min_price != null ? Number(s.min_price) : null
    const extraEur = E[id]?.extra_eur != null ? Number(E[id].extra_eur) : 0
    const recent = Number(P[id]?.recent ?? 0), lastYear = Number(P[id]?.last_year ?? 0)
    const paceVsLastYear = lastYear > 0 ? Math.round((recent / lastYear) * 100) / 100 : null
    const openHorizonDays = H[id]?.open_horizon_days != null ? Number(H[id].open_horizon_days) : null

    // Precio recomendado por el MOTOR compartido (lib/pricing-engine) — misma fuente que recommend/panel.
    const mkt = marketByPiso[id] ?? { prices: [], scores: [] }
    const marketP50Guest = mkt.prices.length ? Math.round(percentile([...mkt.prices].sort((a, b) => a - b), 0.5)) : null
    const eng = computeRecommendation(
      { target_pctl: Number(s.target_pctl), floor_pctl: Number(s.floor_pctl), ceil_pctl: Number(s.ceil_pctl),
        position_factor: Number(s.position_factor), quality_k: Number(s.quality_k), demand_k: Number(s.demand_k),
        demand_baseline: Number(s.demand_baseline), own_score: s.own_score != null ? Number(s.own_score) : null },
      mkt.prices, mkt.scores, occupancy60,
    )
    const recommendedBase = recommendedBaseFromEngine(eng, {
      markup: channelMarkup, max_change_pct: Number(s.max_change_pct),
      min_price: minPrice, max_price: s.max_price != null ? Number(s.max_price) : null, baseActual: currentBase,
    })
    // Guardia de confianza: solo proponemos con mercado sólido (≥5 comps) y fresco (≤7d).
    const recommendationConfident = eng.confidence === "alta" && mktAge != null && mktAge <= 7

    // Chivato: si el calendario abierto se queda corto, avisar (no escribe en Smoobu, solo informa).
    // Solo cuando el snapshot ya cubre ≥60 días (si no, el horizonte está limitado por la captura,
    // no por Smoobu → evita falsa alarma mientras el snapshot a 90d aún no ha corrido).
    if (openHorizonDays != null && windowNights >= 60 && openHorizonDays < 60) {
      watchdog.push(`${PROP_NAMES[id] ?? id}: calendario abierto solo ${openHorizonDays}d — revisa disponibilidad/restricciones en Smoobu.`)
    }

    const verdict = evaluatePilot({
      windowNights, freeNights, bookedNights, daysSinceBooking,
      threshold: Number(s.pilot_no_booking_days ?? 7),
      currentBase, marketP50Guest, channelMarkup, minPrice,
      recommendedBase, recommendationConfident,
    })

    pisos.push({
      property_id: id, verdict,
      free_nights_60: freeNights, booked_nights_60: bookedNights, occupancy_60: occupancy60,
      days_since_booking: daysSinceBooking, current_base: currentBase,
      extra_eur: extraEur, pace_vs_last_year: paceVsLastYear, market_p50_guest: marketP50Guest,
      open_horizon_days: openHorizonDays, recommended_base: recommendedBase,
    })

    if (!dryRun) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_pilot_tracking
          (tracked_on, property_id, verdict, free_nights_60, booked_nights_60, occupancy_60,
           days_since_booking, current_base, extra_eur, pace_vs_last_year, market_p50_guest, diagnosis, proposal, open_horizon_days, recommended_base)
        VALUES (CURRENT_DATE, ${id}, ${verdict.verdict}, ${freeNights}, ${bookedNights},
           ${occupancy60}, ${daysSinceBooking}, ${currentBase}, ${extraEur},
           ${paceVsLastYear}, ${marketP50Guest}, ${verdict.diagnosis}, ${verdict.proposal}, ${openHorizonDays}, ${recommendedBase})
        ON CONFLICT (tracked_on, property_id) DO UPDATE SET
          verdict = EXCLUDED.verdict, free_nights_60 = EXCLUDED.free_nights_60,
          booked_nights_60 = EXCLUDED.booked_nights_60, occupancy_60 = EXCLUDED.occupancy_60,
          days_since_booking = EXCLUDED.days_since_booking, current_base = EXCLUDED.current_base,
          extra_eur = EXCLUDED.extra_eur, pace_vs_last_year = EXCLUDED.pace_vs_last_year,
          market_p50_guest = EXCLUDED.market_p50_guest, diagnosis = EXCLUDED.diagnosis,
          proposal = EXCLUDED.proposal, open_horizon_days = EXCLUDED.open_horizon_days,
          recommended_base = EXCLUDED.recommended_base`)
    }
  }

  // Aviso al propietario si hay 🔴 o watchdog.
  const rojos = pisos.filter((p) => p.verdict.verdict === "rojo")
  if (!dryRun && (rojos.length > 0 || watchdog.length > 0)) {
    const filas = rojos.map((p) =>
      `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb">${PROP_NAMES[p.property_id] ?? p.property_id}</td>
       <td style="padding:6px 8px;border:1px solid #e5e7eb">${p.verdict.diagnosis}</td>
       <td style="padding:6px 8px;border:1px solid #e5e7eb;color:#1e40af">${p.verdict.proposal ?? "—"}</td></tr>`).join("")
    const wd = watchdog.length ? `<p style="color:#b45309">⚙️ ${watchdog.join(" · ")}</p>` : ""
    await notifyOwner({
      subject: `🔴 SIVRA Pricing: seguimiento del piloto (${rojos.length} alerta${rojos.length === 1 ? "" : "s"})`,
      html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto">
        <h2 style="color:#b91c1c">Seguimiento del piloto</h2>${wd}
        ${rojos.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#f9fafb"><th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb">Piso</th>
          <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb">Diagnóstico</th>
          <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb">Propuesta</th></tr>${filas}</table>
          <p style="color:#6b7280;font-size:12px">El agente solo propone; aplicar la bajada es decisión tuya en /pricing-auto.</p>` : ""}
      </div>`,
      push: {
        title: rojos.length ? "🔴 Piloto: revisar precio" : "⚙️ Pipeline de pricing",
        body: rojos.length ? `${rojos.length} piso(s) sin reservas. Revisa SIVRA.` : watchdog.join(" · "),
        url: "/pricing-auto",
      },
    })
  }

  return NextResponse.json({ ok: true, dryRun, watchdog, pisos })
}

// El panel dispara el agente con POST ("Ejecutar ahora"); misma lógica que el cron (GET).
export const POST = GET
