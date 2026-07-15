import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { eventFactor, seasonalFloorFactor, PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"
import { getSmoobuKey } from "@/lib/smoobu"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/sivra/pricing/apply
//
// APLICA el precio recomendado por el motor (anclado al mercado) escribiéndolo en
// SMOOBU vía su API. Es el paso "recomendar → aplicar".
//
// Protegido por CRON_SECRET (Bearer) O por una sesión de admin logueada.

const BASE = "https://login.smoobu.com/api"

const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const fmt = (d: Date) => d.toISOString().slice(0, 10)

// GET = mismo comportamiento que POST (patrón cron-GET del repo, como /api/rates/snapshot);
// dryRun=true por defecto en ambos, así que un GET sin params nunca escribe.
export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  // Autorización: vale el CRON_SECRET (crons) O una sesión de admin (panel del propietario).
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const qs = req.nextUrl.searchParams.get("secret")
  const secretOk = !!secret && (bearer === secret || qs === secret)
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const onlyProp = sp.get("property")
  const days = Math.min(Math.max(Number(sp.get("days") ?? 14), 1), PRICING_HORIZON_DAYS)
  let dryRun = sp.get("dryRun") !== "false"

  // Botón de pánico / pausa global: si está pausado, NUNCA escribe (degrada a dry-run).
  let paused = false
  try {
    const cfg = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
      SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`)
    paused = cfg[0]?.paused === true
  } catch { /* sin tabla aún: no pausado */ }
  if (paused && !dryRun) dryRun = true

  const SMOOBU_KEY = await getSmoobuKey()

  const MIN_SAMPLE = 5
  const MAX_MARKET_AGE_DAYS = 7

  const recs = await prisma.$queryRaw<{
    property_id: string; recommended_guest: number; med_guest_global: number; floor_guest: number; ceil_guest: number
    channel_markup: number; max_change_pct: number; min_price: number | null; max_price: number | null
    sample_n: number; market_age_days: number; events_enabled: boolean; gap_discount_pct: number
    flight_demand_k: number; seasonal_floor_k: number
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
        percentile_cont(0.5) WITHIN GROUP (ORDER BY m.score)::numeric mkt_score,
        COUNT(*)::int AS sample_n,
        (CURRENT_DATE - MAX(l.sd))::int AS market_age_days
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
      ROUND(mkt.med
        * GREATEST(LEAST(1 + (COALESCE(occ.occupancy,0.5) - s.demand_baseline) * s.demand_k, 1.10), 0.92)
        * GREATEST(LEAST(1 + (s.own_score - mkt.mkt_score) * s.quality_k, 1.10), 0.90))::int AS recommended_guest,
      ROUND(mkt.med)::int AS med_guest_global,
      ROUND(mkt.flo)::int AS floor_guest, ROUND(mkt.cei)::int AS ceil_guest,
      COALESCE(s.channel_markup, 1.16)::float8 AS channel_markup,
      s.max_change_pct::float8 AS max_change_pct,
      s.min_price, s.max_price,
      mkt.sample_n, mkt.market_age_days,
      COALESCE(s.events_enabled, true) AS events_enabled,
      COALESCE(s.gap_discount_pct, 0)::float8 AS gap_discount_pct,
      COALESCE(s.flight_demand_k, 0)::float8 AS flight_demand_k,
      COALESCE(s.seasonal_floor_k, 0)::float8 AS seasonal_floor_k
    FROM mkt
    JOIN pricing_settings s ON s.property_id = mkt.scenario
    LEFT JOIN occ ON occ.scenario = mkt.scenario
    WHERE s.apply_enabled = true
      AND (${onlyProp}::text IS NULL OR mkt.scenario = ${onlyProp})
  `)

  if (recs.length === 0) {
    return NextResponse.json({ ok: true, dryRun, applied: 0, message: "Ningún piso con apply_enabled=true (o filtro sin match)" })
  }

  const today = new Date()
  const end = new Date(today); end.setDate(end.getDate() + days)
  const startDate = fmt(today), endDate = fmt(end)

  const autoEvRows = await prisma.$queryRaw<{ rate_date: string; factor: number }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, MAX(factor)::float8 AS factor
    FROM pricing_eventos_auto WHERE rate_date >= CURRENT_DATE GROUP BY rate_date
  `).catch(() => [])
  const autoEv = new Map(autoEvRows.map(r => [r.rate_date, Number(r.factor)]))

  // Señal de demanda por vuelos a SVQ (Fase 3). Solo influye si flight_demand_k>0 por piso.
  const flightRows = await prisma.$queryRaw<{ rate_date: string; demand_index: number }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, demand_index::float8 AS demand_index
    FROM pricing_flight_demand WHERE rate_date >= CURRENT_DATE
  `).catch(() => [])
  const flightIdx = new Map(flightRows.map(r => [r.rate_date, Number(r.demand_index)]))

  const MIN_BUCKET = 3
  const mesRows = await prisma.$queryRaw<{
    property_id: string; ym: string; med_guest: number; flo_guest: number; cei_guest: number; n: number
  }[]>(Prisma.sql`
    WITH recent AS (
      SELECT DISTINCT ON (m.scenario, m.checkin_date, m.comp_name)
        m.scenario, m.checkin_date, m.price_night
      FROM market_rates m
      WHERE m.price_night > 0 AND m.scenario LIKE 'prop_%'
        AND m.checkin_date >= CURRENT_DATE
        AND m.search_date >= CURRENT_DATE - 120
      ORDER BY m.scenario, m.checkin_date, m.comp_name, m.search_date DESC
    )
    SELECT r.scenario AS property_id, to_char(r.checkin_date, 'YYYY-MM') AS ym,
      ROUND(percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY r.price_night))::int AS med_guest,
      ROUND(percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY r.price_night))::int AS flo_guest,
      ROUND(percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY r.price_night))::int AS cei_guest,
      COUNT(*)::int AS n
    FROM recent r JOIN pricing_settings s ON s.property_id = r.scenario
    GROUP BY r.scenario, to_char(r.checkin_date, 'YYYY-MM'), s.target_pctl, s.floor_pctl, s.ceil_pctl
  `).catch(() => [])
  const mes = new Map<string, Map<string, { med: number; flo: number; cei: number; n: number }>>()
  for (const m of mesRows) {
    if (!mes.has(m.property_id)) mes.set(m.property_id, new Map())
    mes.get(m.property_id)!.set(m.ym, { med: m.med_guest, flo: m.flo_guest, cei: m.cei_guest, n: m.n })
  }

  const results: any[] = []

  for (const r of recs) {
    const smoobuId = SMOOBU_ID[r.property_id]
    if (!smoobuId) { results.push({ property: r.property_id, error: "sin smoobuId" }); continue }

    if (!dryRun && (r.sample_n < MIN_SAMPLE || r.market_age_days > MAX_MARKET_AGE_DAYS)) {
      results.push({
        property: r.property_id, skipped: "datos_insuficientes",
        sample_n: r.sample_n, market_age_days: r.market_age_days,
        detail: `Necesita ≥${MIN_SAMPLE} comparables y mercado ≤${MAX_MARKET_AGE_DAYS}d`,
      })
      continue
    }

    let plRates: Record<string, { price: number | null; available: number }> = {}
    try {
      const res = await fetch(`${BASE}/rates?apartments[]=${smoobuId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { "Api-Key": SMOOBU_KEY, "Cache-Control": "no-cache" }, next: { revalidate: 0 } })
      if (!res.ok) { results.push({ property: r.property_id, error: `Smoobu GET ${res.status}` }); continue }
      plRates = (await res.json()).data?.[smoobuId] ?? {}
    } catch (e) {
      results.push({ property: r.property_id, error: `Smoobu GET ${String(e).slice(0, 80)}` }); continue
    }

    const markup = Number(r.channel_markup) > 1 ? Number(r.channel_markup) : 1.16
    const dqFactor = r.med_guest_global > 0 ? r.recommended_guest / r.med_guest_global : 1
    const baseTargetGlobal = Math.round(r.recommended_guest / markup)
    const floorBaseGlobal = Math.round(r.floor_guest / markup)
    const ceilBaseGlobal = Math.round(r.ceil_guest / markup)
    const mesProp = mes.get(r.property_id)

    const ops: { dates: string[]; daily_price: number }[] = []
    const audit: { rate_date: string; old_price: number | null; new_price: number }[] = []
    const cur = new Date(today)
    while (cur <= end) {
      const date = fmt(cur); cur.setDate(cur.getDate() + 1)
      const info = plRates[date]
      if (!info || !info.available) continue
      const old = info.price != null ? Math.round(info.price) : null
      const ym = date.slice(0, 7)
      const mb = mesProp?.get(ym)
      const useMonth = !!mb && mb.n >= MIN_BUCKET
      const baseD = useMonth ? Math.round((mb!.med * dqFactor) / markup) : baseTargetGlobal
      const floorD = useMonth ? Math.round(mb!.flo / markup) : floorBaseGlobal
      const ceilD = useMonth ? Math.round(mb!.cei / markup) : ceilBaseGlobal
      let target = clamp(baseD, floorD, ceilD)
      let eventTarget = 0
      let evFactor = 1
      if (r.events_enabled) {
        const ev = Math.max(eventFactor(date), autoEv.get(date) ?? 1)
        evFactor = ev
        if (ev > 1) {
          const globalEvent = Math.round(clamp(baseTargetGlobal, floorBaseGlobal, ceilBaseGlobal) * ev)
          target = useMonth ? Math.max(target, globalEvent) : globalEvent
          eventTarget = globalEvent // capturado para saltar el raíl ±20% al ALZA (ver abajo)
        }
      }
      // Demanda por vuelos a SVQ (Fase 3): inerte si flight_demand_k=0 o sin dato de la fecha.
      if (Number(r.flight_demand_k) > 0) {
        const fi = flightIdx.get(date) ?? 1
        if (fi > 1) target = Math.round(target * (1 + Number(r.flight_demand_k) * (fi - 1)))
      }
      if (Number(r.gap_discount_pct) > 0) {
        const prevD = fmt(new Date(new Date(date).getTime() - 86400000))
        const nextD = fmt(new Date(new Date(date).getTime() + 86400000))
        const prevBooked = plRates[prevD] && !plRates[prevD].available
        const nextBooked = plRates[nextD] && !plRates[nextD].available
        if (prevBooked && nextBooked) target = Math.round(target * (1 - Number(r.gap_discount_pct)))
      }
      if (old != null) {
        const lo = Math.round(old * (1 - Number(r.max_change_pct)))
        const hi = Math.round(old * (1 + Number(r.max_change_pct)))
        target = clamp(target, lo, hi)
      }
      if (r.min_price != null) target = Math.max(target, r.min_price)
      // Suelo estacional: impide que una fecha de temporada alta (primavera/Navidad/eventos) se
      // deslice al suelo base cuando el mercado de ese mes caduca. Inerte si seasonal_floor_k=0.
      if (Number(r.seasonal_floor_k) > 0 && r.min_price != null) {
        const factor = 1 + (seasonalFloorFactor(date) - 1) * Number(r.seasonal_floor_k)
        let sf = Math.round(r.min_price * factor)
        if (r.max_price != null) sf = Math.min(sf, r.max_price)
        target = Math.max(target, sf)
      }
      // Salto de evento: una fecha de evento CONOCIDA (puente/Feria/S.Santa) sube a su precio de
      // GOLPE, sin esperar a la rampa de ±20%/día — un evento del calendario no es ruido. Solo al
      // ALZA (las bajadas siguen el raíl). Resuelve la malventa por antelación: quien reserva una
      // fecha de evento la ve ya a su precio aunque el apply no haya escalado día a día.
      if (eventTarget > target) target = eventTarget
      if (r.max_price != null) target = Math.min(target, r.max_price)
      // Guarda de evento fuerte (lección Karol G, 15/07/2026): con factor ≥2 y SIN mercado del
      // mes (fallback global), el precio NUNCA baja — el bucket global (dominado por temporada
      // media/baja) arrastraría la noche de evento hacia abajo (788→283 en jun-2027) y el factor
      // solo multiplica esa base hundida. Se CONGELA el precio actual hasta tener comps del mes.
      // Excepción: si el techo del propietario (max_price) exige bajar, manda el techo.
      if (evFactor >= 2 && !useMonth && old != null && target < old
          && (r.max_price == null || old <= r.max_price)) continue
      if (old != null && target === old) continue
      ops.push({ dates: [date], daily_price: target })
      audit.push({ rate_date: date, old_price: old, new_price: target })
    }

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

    if (audit.length > 0) {
      try {
        const auditRows = audit.map(a =>
          Prisma.sql`(${r.property_id}, ${a.rate_date}::date, ${a.old_price}::int, ${a.new_price}::int, ${dryRun})`)
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run)
          VALUES ${Prisma.join(auditRows)}`)
      } catch { /* no crítico */ }
    }

    results.push({
      property: r.property_id,
      recommended_guest: r.recommended_guest, base_target: baseTargetGlobal,
      meses_con_mercado: mesProp ? [...mesProp.entries()].filter(([, v]) => v.n >= MIN_BUCKET).map(([k]) => k) : [],
      bounds: { floor_base: floorBaseGlobal, ceil_base: ceilBaseGlobal, min: r.min_price, max: r.max_price },
      dates_con_cambio: ops.length, written, sample: audit.slice(0, 3),
    })
  }

  return NextResponse.json({ ok: true, dryRun, paused, days, properties: recs.length, results })
}
