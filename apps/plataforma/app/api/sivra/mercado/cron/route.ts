import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { chatConDirector } from "@/lib/pasarela"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

const PROP_LABELS: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

// ── Serper.dev → búsqueda real en Google ─────────────────────────────────────
async function serperSearch(query: string): Promise<string> {
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error("SERPER_API_KEY no configurada")
  const res = await fetch("https://google.serper.dev/search", {
    method:  "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body:    JSON.stringify({ q: query, gl: "es", hl: "es", num: 10 }),
    signal:  AbortSignal.timeout(10_000),
  })
  // El body del error dice la CAUSA (p. ej. «Not enough credits», 22/08/2026): sin él, un
  // agotamiento de crédito y un payload roto son el mismo «Serper 400» en el log.
  if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const data = await res.json()
  const parts: string[] = []
  // Featured snippet / answer box suelen tener el precio más destacado
  if (data.answerBox?.answer) parts.push(`Destacado: ${data.answerBox.answer}`)
  if (data.answerBox?.snippet) parts.push(`Fragmento destacado: ${data.answerBox.snippet}`)
  const organic: any[] = data.organic || []
  organic.slice(0, 10).forEach((r: any) => {
    const sitelinks = (r.sitelinks || []).map((s: any) => s.snippet || "").filter(Boolean).join(" | ")
    parts.push(`${r.title} | ${r.snippet || ""} ${sitelinks ? "| " + sitelinks : ""}`)
  })
  return parts.join("\n")
}

async function extractPrices(snippets: string, portal: string, checkin: string, checkout: string): Promise<any[]> {
  const system = `Eres experto en turismo en Sevilla. Extrae precios de apartamentos de los resultados de búsqueda.
Devuelve SOLO JSON sin markdown:
{"apartments":[{"name":"nombre_alojamiento","price_night":precio_numerico,"score":puntuacion_0_10,"location":"zona_sevilla"}]}
Reglas: extrae cualquier cifra que parezca precio de noche (€, EUR, "por noche", "la noche"). Si hay un rango usa el extremo inferior. Si el precio parece total de estancia y hay fechas, divídelo entre las noches. Incluye aunque el precio no sea exacto. Solo omite si no hay ninguna cifra monetaria.`

  const prompt = `Portal: ${portal} | Check-in: ${checkin} | Check-out: ${checkout}
Resultados de búsqueda Google:
${snippets}

Extrae apartamentos con precios estimados por noche en euros. Si ves rangos como "80-120€" usa 80. SOLO JSON.`

  try {
    const txt   = (await chatConDirector([{ role: "user", content: prompt }], { app: "plataforma", endpoint: "mercado-cron", system, maxTokens: 600, temperature: 0.1 })).text
    const clean = txt.replace(/```json|```/g, "").trim()
    const s = clean.indexOf("{"); const e = clean.lastIndexOf("}")
    return JSON.parse(clean.slice(s, e + 1)).apartments ?? []
  } catch { return [] }
}

async function searchPortal(portal: string, checkin: string, checkout: string): Promise<any[]> {
  const queries: Record<string, string> = {
    booking:     `apartamentos turísticos Sevilla centro precio noche euros booking`,
    tripadvisor: `apartamentos Sevilla centro histórico precio noche tripadvisor`,
    expedia:     `apartamentos Sevilla centro precio noche euros expedia`,
  }
  const query = queries[portal] ?? `apartamentos Sevilla centro ${portal} precio noche euros`
  try {
    const snippets = await serperSearch(query)
    return await extractPrices(snippets, portal, checkin, checkout)
  } catch (e) {
    console.error(`[sivra/mercado/cron] serper error ${portal}:`, e)
    return []
  }
}

async function generateAlerts(scenario: string, checkin: string) {
  const alerts: any[] = []
  const today = new Date().toISOString().split("T")[0]

  const mktRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT AVG(price_night)::numeric(10,2) as avg_market,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_night) as p50
    FROM market_rates
    WHERE scenario = ${scenario}
      AND search_date >= CURRENT_DATE - INTERVAL '7 days'
      AND price_night > 0
  `)
  const mktAvg = mktRows[0]?.avg_market ? Number(mktRows[0].avg_market) : null
  if (!mktAvg) return alerts

  // Precio REAL vigente por piso para la fecha comparada (fix 19/07/2026: antes comparaba contra
  // constantes hardcodeadas de junio, desconectadas del motor dinámico → alertas falsas: Busto
  // "80€" cuando el motor real ya tenía 156€ aplicado con el suelo de 115€ respetado).
  const liveRows = await prisma.$queryRaw<{ property_id: string; price: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (property_id) property_id, new_price AS price
    FROM pricing_applied
    WHERE dry_run = false AND rate_date = ${checkin}::date
    ORDER BY property_id, applied_at DESC`)
  const livePrice = new Map(liveRows.map(r => [r.property_id, Number(r.price)]))

  for (const [propId, label] of Object.entries(PROP_LABELS)) {
    const ourPrice = livePrice.get(propId)
    if (ourPrice == null) continue // sin precio real aplicado para esa fecha: no hay con qué comparar
    const diffPct  = ((ourPrice - mktAvg) / mktAvg) * 100

    if (diffPct < -15) {
      const ex = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM pricing_alerts WHERE tipo='precio_bajo' AND property_id=${propId}
        AND scenario=${scenario} AND resuelta=false
        AND created_at >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`)
      if (!ex.length) alerts.push({
        tipo: "precio_bajo", prioridad: diffPct < -30 ? "alta" : "media", property_id: propId,
        titulo: `${label}: precio ${Math.abs(Math.round(diffPct))}% por debajo del mercado`,
        detalle: `Tarifa (${ourPrice}€/noche) muy por debajo del promedio de mercado (${Math.round(mktAvg)}€). Considera subir el precio base.`,
        dato_actual: ourPrice, dato_mercado: Math.round(mktAvg), diferencia_pct: Math.round(diffPct), scenario, fecha_ref: today,
      })
    }
    if (diffPct > 40 && propId !== "prop_house_sevillana") {
      const ex = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM pricing_alerts WHERE tipo='precio_alto' AND property_id=${propId}
        AND scenario=${scenario} AND resuelta=false
        AND created_at >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`)
      if (!ex.length) alerts.push({
        tipo: "precio_alto", prioridad: "baja", property_id: propId,
        titulo: `${label}: precio muy por encima del mercado`,
        detalle: `Tarifa (${ourPrice}€) supera en ${Math.round(diffPct)}% la media (${Math.round(mktAvg)}€). Verifica ocupación.`,
        dato_actual: ourPrice, dato_mercado: Math.round(mktAvg), diferencia_pct: Math.round(diffPct), scenario, fecha_ref: today,
      })
    }
  }

  const prevWeek = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT AVG(price_night)::numeric(10,2) as avg_prev FROM market_rates
    WHERE scenario=${scenario} AND search_date >= CURRENT_DATE - INTERVAL '14 days'
    AND search_date < CURRENT_DATE - INTERVAL '7 days' AND price_night > 0`)
  const prevAvg = prevWeek[0]?.avg_prev ? Number(prevWeek[0].avg_prev) : null
  if (prevAvg && mktAvg) {
    const weekChange = ((mktAvg - prevAvg) / prevAvg) * 100
    if (weekChange > 20) {
      const ex = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM pricing_alerts WHERE tipo='demanda_alta' AND resuelta=false
        AND created_at >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`)
      if (!ex.length) alerts.push({
        tipo: "demanda_alta", prioridad: "alta", property_id: null,
        titulo: `Subida brusca del mercado: +${Math.round(weekChange)}% esta semana`,
        detalle: `Precio medio subió de ${Math.round(prevAvg)}€ a ${Math.round(mktAvg)}€ en 7 días. Revisa precios de todos los pisos.`,
        dato_actual: Math.round(mktAvg), dato_mercado: Math.round(prevAvg), diferencia_pct: Math.round(weekChange), scenario, fecha_ref: today,
      })
    }
  }
  return alerts
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET (resiliente — isCronAuthorized permite en dev con warning si falta el secreto)
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  const d = new Date()
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7
  const sat = new Date(d); sat.setDate(d.getDate() + daysUntilSat)
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1)
  const checkin  = sat.toISOString().split("T")[0]
  const checkout = sun.toISOString().split("T")[0]

  const portals = ["booking", "tripadvisor", "expedia"]
  const summary: Record<string, number> = {}

  for (const portal of portals) {
    const apartments = await searchPortal(portal, checkin, checkout)
    let inserted = 0
    for (const apt of apartments) {
      if (!apt.name || !apt.price_night) continue
      try {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO market_rates
            (search_date, checkin_date, checkout_date, guests, portal, scenario,
             comp_name, price_night, price_total, score, review_count, location, currency)
          VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, 4, ${portal}, ${"normal"},
            ${String(apt.name)}, ${Number(apt.price_night)}, ${Number(apt.price_night * 2)},
            ${apt.score ? Number(apt.score) : null}, 0, ${String(apt.location || "")}, ${"EUR"})
          ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
          SET price_night=EXCLUDED.price_night, score=EXCLUDED.score, created_at=NOW()`)
        inserted++
      } catch {}
    }
    summary[portal] = inserted
  }

  const alerts = await generateAlerts("normal", checkin)
  let alertsCreated = 0
  for (const alert of alerts) {
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_alerts (tipo, prioridad, property_id, titulo, detalle,
          dato_actual, dato_mercado, diferencia_pct, scenario, fecha_ref)
        VALUES (${alert.tipo}, ${alert.prioridad}, ${alert.property_id ?? null},
          ${alert.titulo}, ${alert.detalle}, ${alert.dato_actual ?? null},
          ${alert.dato_mercado ?? null}, ${alert.diferencia_pct ?? null},
          ${alert.scenario}, ${alert.fecha_ref}::date)`)
      alertsCreated++
    } catch {}
  }

  const total = Object.values(summary).reduce((s, n) => s + n, 0)
  console.log(`[sivra/mercado/cron] ${new Date().toISOString()} market:${JSON.stringify(summary)} alerts:${alertsCreated}`)
  return NextResponse.json({ ok: true, summary, total, alertsCreated, checkin, checkout })
}
