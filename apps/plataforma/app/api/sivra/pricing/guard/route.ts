import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { tgAlert } from "@/lib/telegram"
import { decidirSubMercado, decidirReservaBaja } from "@/lib/sivra/pricing-guardia"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/guard
//
// Red de seguridad "no puede fallar". Corre tras el snapshot diario (cron 07:30) y AVISA A ALBERTO
// POR TELEGRAM (antes solo dejaba las alertas en la tabla y nadie se enteraba — por eso una reserva
// de Luxury entró a ~110€ con el mercado a ~185€ sin que saltara nada, 20/07/2026).
//
// Chequeos:
//   #1 Reversión: el precio BASE en Smoobu ya no coincide con lo último que aplicó el motor → algo
//      (PriceLabs u otro) lo pisó.
//   #3 Suelo de coste: el motor fija el mínimo en ≥3 fechas → margen justo.
//   #4 Sub-mercado (NUEVO): el precio VIVO del piso va sistemáticamente por debajo de su MERCADO REAL
//      por piso (`market_rates.scenario = property_id`, datos de conector), casando fecha a fecha.
//      Ojo: NO se compara contra el escenario 'normal' (Serper, barato) — ese era el fallo que dejaba
//      a Luxury "aparentemente bien" a 128€ cuando su mercado real era ~185€.
//   #5 Reserva por debajo de mercado (NUEVO): una reserva recién entrada con ADR bruto muy por debajo
//      del p50 real del piso PARA SU FECHA (no el blended de todas las fechas — así una reserva de
//      evento cara "en absoluto" pero barata para su día, p.ej. Karol G, se detecta; ver #5 abajo).
// Crea alertas en pricing_alerts (dedup: no recrea mientras el mismo aviso siga abierto) y manda UN
// Telegram con lo nuevo sin avisar (avisado_at).

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

const SUB_UMBRAL = 0.80 // el vivo por debajo del 80% del p50 de mercado de ese día cuenta como "por debajo"

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  // #1 Reversiones: último precio real aplicado por (piso, fecha) vs base actual de Smoobu.
  const reversions = await prisma.$queryRaw<{
    property_id: string; rate_date: string; new_price: number; base_now: number
  }[]>(Prisma.sql`
    WITH last_applied AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, new_price
      FROM pricing_applied
      WHERE dry_run = false
      ORDER BY property_id, rate_date, applied_at DESC
    ),
    snap AS (
      SELECT property_id, rate_date, price_pricelabs
      FROM rate_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND price_pricelabs IS NOT NULL
    )
    SELECT la.property_id, la.rate_date::text, la.new_price, snap.price_pricelabs AS base_now
    FROM last_applied la
    JOIN snap USING (property_id, rate_date)
    WHERE la.rate_date >= CURRENT_DATE
      AND snap.price_pricelabs <> la.new_price
    ORDER BY la.property_id, la.rate_date
  `)

  // #3 Suelo de coste: pisos con ≥3 fechas futuras aplicadas al mínimo.
  const floorHits = await prisma.$queryRaw<{ property_id: string; dias: number; min_price: number }[]>(Prisma.sql`
    WITH last_applied AS (
      SELECT DISTINCT ON (property_id, rate_date) property_id, rate_date, new_price
      FROM pricing_applied WHERE dry_run = false
      ORDER BY property_id, rate_date, applied_at DESC
    )
    SELECT la.property_id, COUNT(*)::int AS dias, s.min_price
    FROM last_applied la
    JOIN pricing_settings s ON s.property_id = la.property_id
    WHERE la.rate_date >= CURRENT_DATE AND s.min_price IS NOT NULL AND la.new_price = s.min_price
    GROUP BY la.property_id, s.min_price
    HAVING COUNT(*) >= 3
  `)

  // Pisos habilitados (donde el motor escribe de verdad): son los que vigilamos para sub-mercado.
  const enabled = await prisma.$queryRaw<{ property_id: string }[]>(Prisma.sql`
    SELECT property_id FROM pricing_settings WHERE COALESCE(apply_enabled, false) = true`)

  // #4 Sub-mercado: por cada piso habilitado, casa el precio vivo (rate_snapshots) con el mercado
  // real por piso (market_rates.scenario = property_id) FECHA A FECHA y mira cuántas van por debajo.
  type SubHit = { property_id: string; matched: number; sub: number; avg_live: number; avg_p50: number; diffPct: number }
  const subHits: SubHit[] = []
  for (const { property_id } of enabled) {
    const rows = await prisma.$queryRaw<{ matched: number; sub: number; avg_live: number; avg_p50: number }[]>(Prisma.sql`
      WITH mkt AS (
        SELECT checkin_date,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night) AS p50,
               COUNT(*) AS n
        FROM market_rates
        WHERE scenario = ${property_id}
          AND search_date >= CURRENT_DATE - INTERVAL '21 days'
          AND price_night > 0
        GROUP BY checkin_date
        HAVING COUNT(*) >= 8
      ),
      live AS (
        SELECT rate_date, price_pricelabs AS live
        FROM rate_snapshots
        WHERE property_id = ${property_id}
          AND snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots WHERE property_id = ${property_id})
          AND available = 1 AND price_pricelabs IS NOT NULL
          AND rate_date >= CURRENT_DATE
      )
      SELECT COUNT(*)::int AS matched,
             COUNT(*) FILTER (WHERE live.live < ${SUB_UMBRAL} * mkt.p50)::int AS sub,
             COALESCE(AVG(live.live), 0)::float8 AS avg_live,
             COALESCE(AVG(mkt.p50), 0)::float8 AS avg_p50
      FROM live JOIN mkt ON mkt.checkin_date = live.rate_date
    `)
    const r = rows[0]
    if (!r) continue
    const d = decidirSubMercado({ datesMatched: Number(r.matched), datesSub: Number(r.sub), avgLive: Number(r.avg_live), avgP50: Number(r.avg_p50) })
    if (d.alerta) subHits.push({ property_id, matched: Number(r.matched), sub: Number(r.sub), avg_live: Number(r.avg_live), avg_p50: Number(r.avg_p50), diffPct: d.diffPct })
  }

  // #5 Reservas recién entradas (≤2 días) para fechas futuras con ADR bruto muy por debajo del mercado.
  // Se compara contra el p50 de mercado de LA FECHA EXACTA de la reserva (`mkt_date`, ≥8 comps, igual bar
  // que #4) y solo si esa fecha no tiene comps se cae al p50 BLENDED del piso (`mkt_blend`, todas las
  // fechas). Motivo (22/07/2026): el blended aplanaba a ~186€ TODAS las fechas, así que una reserva de
  // Karol G a 344€ (mercado real de ESE día ~931€) salía "por encima del mercado" y NO se detectaba, y
  // la de Feria a 140€ (mercado ~424€) se quedaba a 0,3% del umbral. Con p50 por fecha ambas disparan.
  const nuevasReservas = await prisma.$queryRaw<{
    property_id: string; guest: string; checkin: string; nights: number; adr: number; p50: number; comps: number; date_specific: boolean
  }[]>(Prisma.sql`
    WITH mkt_blend AS (
      SELECT scenario,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night) AS p50,
             COUNT(*) AS comps
      FROM market_rates
      WHERE search_date >= CURRENT_DATE - INTERVAL '21 days'
        AND price_night > 0 AND scenario LIKE 'prop_%'
      GROUP BY scenario
    ),
    mkt_date AS (
      SELECT scenario, checkin_date,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night) AS p50,
             COUNT(*) AS comps
      FROM market_rates
      WHERE search_date >= CURRENT_DATE - INTERVAL '21 days'
        AND price_night > 0 AND scenario LIKE 'prop_%'
      GROUP BY scenario, checkin_date
      HAVING COUNT(*) >= 8
    )
    SELECT i."propertyId" AS property_id, COALESCE(i."guestName", '') AS guest,
           i."checkIn"::date::text AS checkin, i.nights::int AS nights,
           (i.amount_gross / NULLIF(i.nights, 0))::float8 AS adr,
           COALESCE(md.p50, mb.p50)::float8 AS p50,
           COALESCE(md.comps, mb.comps)::int AS comps,
           (md.p50 IS NOT NULL) AS date_specific
    FROM incomes i
    JOIN mkt_blend mb ON mb.scenario = i."propertyId"
    LEFT JOIN mkt_date md ON md.scenario = i."propertyId" AND md.checkin_date = i."checkIn"::date
    WHERE i."createdAt" >= now() - INTERVAL '2 days'
      AND i."checkIn"::date >= CURRENT_DATE
      AND i.amount_gross > 0 AND i.nights > 0
  `)
  const reservasBajas = nuevasReservas
    .map(r => ({
      ...r,
      ev: decidirReservaBaja(
        { adr: Number(r.adr), marketP50: Number(r.p50), comps: Number(r.comps) },
        // El p50 por fecha exacta ya exige ≥8 comps (mismo bar que #4); al blended, que agrega muchas
        // fechas, le mantenemos el mínimo alto por defecto (25) para no fiarnos de una muestra floja.
        { minComps: r.date_specific ? 8 : 25 },
      ),
    }))
    .filter(r => r.ev.alerta)

  // Inserta alerta si no hay ya una IGUAL sin resolver (sin límite de tiempo). Antes la ventana era
  // "últimas 24h": como el cron corre a diario a la misma hora, cada pasada quedaba justo fuera de esa
  // ventana y creaba una fila NUEVA por día → el mismo aviso (p.ej. "tocando el precio mínimo") se
  // apilaba y salía DUPLICADO en el Telegram (5 avisos con repetidos, 22/07/2026). Mientras el aviso
  // siga abierto no se recrea; si Alberto lo resuelve y el problema persiste, la siguiente pasada crea
  // uno nuevo y vuelve a avisar (avisado_at se reinicia con la fila nueva).
  async function pushAlert(a: {
    tipo: string; prioridad: string; property_id: string; titulo: string; detalle: string
    dato_actual?: number; dato_mercado?: number; diferencia_pct?: number; fecha_ref?: string
  }): Promise<boolean> {
    const ex = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM pricing_alerts
      WHERE tipo = ${a.tipo} AND property_id = ${a.property_id} AND resuelta = false
        AND (${a.fecha_ref ?? null}::date IS NULL OR fecha_ref = ${a.fecha_ref ?? null}::date)
      LIMIT 1`)
    if (ex.length) return false
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_alerts (tipo, prioridad, property_id, titulo, detalle, dato_actual, dato_mercado, diferencia_pct, scenario, fecha_ref)
      VALUES (${a.tipo}, ${a.prioridad}, ${a.property_id}, ${a.titulo}, ${a.detalle},
        ${a.dato_actual ?? null}, ${a.dato_mercado ?? null}, ${a.diferencia_pct ?? null}, 'normal', ${a.fecha_ref ?? null}::date)`)
    return true
  }

  let created = 0
  const newReversions: typeof reversions = []
  for (const r of reversions) {
    const ok = await pushAlert({
      tipo: "precio_revertido", prioridad: "alta", property_id: r.property_id,
      titulo: `${PROP_NAMES[r.property_id] ?? r.property_id}: precio revertido el ${r.rate_date}`,
      detalle: `Fijamos ${r.new_price}€ base y ahora hay ${r.base_now}€ en Smoobu. Revisa que PriceLabs esté desconectado en este piso.`,
      dato_actual: r.new_price, dato_mercado: r.base_now, fecha_ref: r.rate_date,
    })
    if (ok) { created++; newReversions.push(r) }
  }
  for (const f of floorHits) {
    const ok = await pushAlert({
      tipo: "suelo_coste", prioridad: "media", property_id: f.property_id,
      titulo: `${PROP_NAMES[f.property_id] ?? f.property_id}: tocando el precio mínimo`,
      detalle: `El motor fija el suelo de coste (${f.min_price}€) en ${f.dias} fechas. A precio de mercado este piso va justo de margen; revisa costes/calidad.`,
      dato_actual: f.min_price,
    })
    if (ok) created++
  }
  for (const s of subHits) {
    const ok = await pushAlert({
      tipo: "precio_sub_mercado", prioridad: "alta", property_id: s.property_id,
      titulo: `${PROP_NAMES[s.property_id] ?? s.property_id}: precio ${Math.abs(Math.round(s.diffPct))}% por debajo de su mercado real`,
      detalle: `El precio vivo va por debajo del mercado del piso en ${s.sub}/${s.matched} fechas (media ${Math.round(s.avg_live)}€ vs ${Math.round(s.avg_p50)}€). Rampa hacia mercado — probablemente sigue anclado a un precio viejo.`,
      dato_actual: Math.round(s.avg_live), dato_mercado: Math.round(s.avg_p50), diferencia_pct: Math.round(s.diffPct),
    })
    if (ok) created++
  }
  for (const r of reservasBajas) {
    const nombre = r.guest ? ` (${r.guest.slice(0, 24)})` : ""
    const ok = await pushAlert({
      tipo: "reserva_bajo_mercado", prioridad: "alta", property_id: r.property_id,
      titulo: `${PROP_NAMES[r.property_id] ?? r.property_id}: reserva ${Math.abs(Math.round(r.ev.diffPct))}% por debajo de mercado`,
      detalle: `Entró una reserva${nombre} el ${r.checkin} a ${Math.round(r.adr)}€/noche brutos (mercado real de esa fecha ~${Math.round(r.p50)}€). Revisa que el precio de esas fechas no siga bajo.`,
      dato_actual: Math.round(r.adr), dato_mercado: Math.round(r.p50), diferencia_pct: Math.round(r.ev.diffPct), fecha_ref: r.checkin,
    })
    if (ok) created++
  }

  // ── AVISO A ALBERTO POR TELEGRAM ──────────────────────────────────────────────
  // Manda UN mensaje con las alertas alta/media aún NO avisadas (cubre también las que crea
  // mercado/cron, p.ej. precio_bajo). Se marca `avisado_at` para no repetir el mismo aviso.
  let avisadas = 0
  try {
    const pend = await prisma.$queryRaw<{
      id: string; tipo: string; prioridad: string; titulo: string; detalle: string
    }[]>(Prisma.sql`
      SELECT id, tipo, prioridad, titulo, detalle
      FROM pricing_alerts
      WHERE resuelta = false AND avisado_at IS NULL
        AND prioridad IN ('alta', 'media')
        AND created_at >= now() - INTERVAL '3 days'
      ORDER BY (prioridad = 'alta') DESC, created_at DESC
      LIMIT 12`)
    if (pend.length > 0) {
      const hayAlta = pend.some(p => p.prioridad === "alta")
      const lineas = pend.map(p => `• ${p.titulo}`).join("\n")
      await tgAlert(
        `🏷️ <b>Guardián de precios</b> — ${pend.length} aviso(s) sin ver:\n${lineas}\n\nDetalle y resolver: /sivra/pricing-auto`,
        hayAlta ? "critico" : "aviso",
      )
      // OJO: `id` es uuid y Prisma manda los params como text → `id IN (…)` lanza
      // `operator does not exist: uuid = text` (42883). Ese throw caía en el catch de abajo,
      // así que desde el 20/07 el Telegram SÍ salía pero avisado_at nunca se marcaba → el mismo
      // aviso se re-enviaba a diario hasta caducar la ventana de 3 días (duplicados del 22/07).
      // El cast a text mantiene el dedup sin pelearse con el tipado de parámetros.
      await prisma.$executeRaw(Prisma.sql`
        UPDATE pricing_alerts SET avisado_at = now()
        WHERE id::text IN (${Prisma.join(pend.map(p => p.id))})`)
      avisadas = pend.length
    }
  } catch (e) {
    console.error("[sivra/pricing/guard] aviso Telegram:", e)
  }

  return NextResponse.json({
    ok: true,
    reversions: reversions.length,
    floor_hits: floorHits.length,
    sub_mercado: subHits.length,
    reservas_bajas: reservasBajas.length,
    alerts_created: created,
    avisadas,
  })
}
