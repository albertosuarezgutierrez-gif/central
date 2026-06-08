import { NextResponse } from "next/server"
import { aiComplete } from "@/lib/ai-client"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

const OUR_PRICES: Record<string, { label: string; normal: number; corpus: number }> = {
  prop_house_sevillana: { label: "House Sevillana", normal: 314, corpus: 570 },
  prop_duplex_center:   { label: "Duplex Center",   normal: 121, corpus: 200 },
  prop_luxury_busto:    { label: "Luxury Busto",    normal: 150, corpus: 235 },
  prop_busto_reform:    { label: "Busto Reform",    normal: 80,  corpus: 132 },
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
  if (!res.ok) throw new Error(`Serper ${res.status}`)
  const data = await res.json()
  // Concatenar snippets relevantes
  const organic: any[] = data.organic || []
  return organic
    .slice(0, 8)
    .map((r: any) => `${r.title} | ${r.snippet || ""}`)
    .join("\n")
}

// ── NVIDIA NIM extrae precios de los snippets ─────────────────────────────────
async function extractPrices(snippets: string, portal: string, checkin: string, checkout: string): Promise<any[]> {
  const system = `Eres experto en turismo en Sevilla. Extrae precios de apartamentos de los resultados de búsqueda.
Devuelve SOLO JSON sin markdown:
{"apartments":[{"name":"nombre_alojamiento","price_night":precio_numerico,"score":puntuacion_0_10,"location":"zona_sevilla"}]}
Solo apartamentos con precio numérico claro. Si no hay precios reales, devuelve {"apartments":[]}.`

  const prompt = `Portal: ${portal} | Check-in: ${checkin} | Check-out: ${checkout}
Resultados de búsqueda Google:
${snippets}

Extrae los apartamentos con sus precios por noche en euros. SOLO JSON.`

  try {
    const txt   = await aiComplete([{ role: "user", content: prompt }], { system, maxTokens: 600, temperature: 0.1 })
    const clean = txt.replace(/```json|```/g, "").trim()
    const s = clean.indexOf("{"); const e = clean.lastIndexOf("}")
    return JSON.parse(clean.slice(s, e + 1)).apartments ?? []
  } catch { return [] }
}

async function searchPortal(portal: string, checkin: string, checkout: string): Promise<any[]> {
  const queries: Record<string, string> = {
    booking:     `apartamentos turísticos Sevilla centro ${checkin} ${checkout} site:booking.com precio noche`,
    tripadvisor: `apartamentos Sevilla centro histórico ${checkin} site:tripadvisor.com precio`,
    expedia:     `apartamentos Sevilla centro ${checkin} ${checkout} site:expedia.com precio noche euros`,
  }
  const query = queries[portal] ?? `apartamentos Sevilla centro ${checkin} ${checkout} ${portal} precio`
  try {
    const snippets = await serperSearch(query)
    return await extractPrices(snippets, portal, checkin, checkout)
  } catch (e) {
    console.error(`[mercado] serper error ${portal}:`, e)
    return []
  }
}

async function generateAlerts(scenario: string) {
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

  for (const [propId, prop] of Object.entries(OUR_PRICES)) {
    const ourPrice = scenario === "corpus" ? prop.corpus : prop.normal
    const diffPct  = ((ourPrice - mktAvg) / mktAvg) * 100

    if (diffPct < -15) {
      const ex = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM pricing_alerts WHERE tipo='precio_bajo' AND property_id=${propId}
        AND scenario=${scenario} AND resuelta=false
        AND created_at >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`)
      if (!ex.length) alerts.push({
        tipo: "precio_bajo", prioridad: diffPct < -30 ? "alta" : "media", property_id: propId,
        titulo: `${prop.label}: precio ${Math.abs(Math.round(diffPct))}% por debajo del mercado`,
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
        titulo: `${prop.label}: precio muy por encima del mercado`,
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
        titulo: `⚡ Subida brusca del mercado: +${Math.round(weekChange)}% esta semana`,
        detalle: `Precio medio subió de ${Math.round(prevAvg)}€ a ${Math.round(mktAvg)}€ en 7 días. Revisa precios de todos los pisos.`,
        dato_actual: Math.round(mktAvg), dato_mercado: Math.round(prevAvg), diferencia_pct: Math.round(weekChange), scenario, fecha_ref: today,
      })
    }
  }
  return alerts
}

export async function GET() {
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

  const alerts = await generateAlerts("normal")
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
  console.log(`[mercado/cron] ${new Date().toISOString()} market:${JSON.stringify(summary)} alerts:${alertsCreated}`)
  return NextResponse.json({ ok: true, summary, total, alertsCreated, checkin, checkout })
}
