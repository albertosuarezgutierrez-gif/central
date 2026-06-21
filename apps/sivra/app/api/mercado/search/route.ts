import { NextRequest, NextResponse } from "next/server"
import { aiComplete } from "@/lib/ai-client"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

function nextWeekend(): { checkin: string; checkout: string } {
  const d = new Date()
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7
  const sat = new Date(d); sat.setDate(d.getDate() + daysUntilSat)
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1)
  return { checkin: sat.toISOString().split("T")[0], checkout: sun.toISOString().split("T")[0] }
}

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
  const data     = await res.json()
  const organic: any[] = data.organic || []
  return organic
    .slice(0, 8)
    .map((r: any) => `${r.title} | ${r.snippet || ""}`)
    .join("\n")
}

async function extractPrices(snippets: string, portal: string, checkin: string, checkout: string, guests: number): Promise<any[]> {
  const system = `Eres experto en turismo en Sevilla. Extrae precios de apartamentos de resultados de búsqueda Google.
Devuelve SOLO JSON sin markdown:
{"apartments":[{"name":"nombre_alojamiento","price_night":precio_noche,"price_total":precio_total,"score":puntuacion_0_10,"review_count":numero_resenas,"location":"zona"}]}
Solo entradas con precio numérico real. Si no encuentras precios: {"apartments":[]}.`

  const prompt = `Portal: ${portal} | Check-in: ${checkin} | Check-out: ${checkout} | ${guests} huéspedes
Snippets Google:
${snippets}
Extrae apartamentos con precios reales en euros. SOLO JSON.`

  try {
    const txt   = await aiComplete([{ role: "user", content: prompt }], { system, maxTokens: 800, temperature: 0.1 })
    const clean = txt.replace(/```json|```/g, "").trim()
    const s = clean.indexOf("{"); const e = clean.lastIndexOf("}")
    const parsed = JSON.parse(clean.slice(s, e + 1))
    return parsed.apartments || []
  } catch { return [] }
}

async function searchPortal(
  portal: string, checkin: string, checkout: string, guests: number, scenario: string
): Promise<{ ok: boolean; apartments: any[] }> {
  const queries: Record<string, string> = {
    booking:     `apartamentos turísticos Sevilla centro ${checkin} ${checkout} ${guests} personas site:booking.com`,
    tripadvisor: `apartamentos Sevilla centro histórico ${checkin} ${guests} personas site:tripadvisor.com precios`,
    expedia:     `apartamentos Sevilla casco antiguo ${checkin} ${checkout} site:expedia.com precio euros`,
  }
  const query = queries[portal] ?? `apartamentos Sevilla centro ${checkin} ${checkout} ${portal}`
  try {
    const snippets   = await serperSearch(query)
    const apartments = await extractPrices(snippets, portal, checkin, checkout, guests)
    return { ok: true, apartments }
  } catch (e) {
    console.error(`[mercado/search] error ${portal}:`, e)
    return { ok: false, apartments: [] }
  }
}

export async function GET(req: NextRequest) {
  const scenario    = req.nextUrl.searchParams.get("scenario") || "normal"
  const portalParam = req.nextUrl.searchParams.get("portal")   || "all"
  const guests      = 4

  let checkin: string, checkout: string
  if (scenario === "corpus") { checkin = "2026-06-11"; checkout = "2026-06-13" }
  else { const w = nextWeekend(); checkin = w.checkin; checkout = w.checkout }

  const portals = portalParam === "all" ? ["booking", "tripadvisor", "expedia"] : [portalParam]
  const results: Record<string, { inserted: number; total: number }> = {}

  for (const portal of portals) {
    const { ok, apartments } = await searchPortal(portal, checkin, checkout, guests, scenario)
    if (!ok) { results[portal] = { inserted: 0, total: 0 }; continue }

    let inserted = 0
    for (const apt of apartments) {
      if (!apt.name || !apt.price_night) continue
      try {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO market_rates
            (search_date, checkin_date, checkout_date, guests, portal, scenario,
             comp_name, price_night, price_total, score, review_count, location, currency)
          VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${guests},
            ${portal}, ${scenario}, ${String(apt.name)},
            ${Number(apt.price_night)}, ${Number(apt.price_total || apt.price_night * 2)},
            ${apt.score ? Number(apt.score) : null}, ${Number(apt.review_count || 0)},
            ${String(apt.location || "")}, ${"EUR"})
          ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
          SET price_night=EXCLUDED.price_night, price_total=EXCLUDED.price_total,
              score=EXCLUDED.score, created_at=NOW()`)
        inserted++
      } catch {}
    }
    results[portal] = { inserted, total: apartments.length }
  }

  const totalInserted = Object.values(results).reduce((s, r) => s + r.inserted, 0)
  return NextResponse.json({ ok: true, results, totalInserted, scenario, checkin, checkout, portals })
}
