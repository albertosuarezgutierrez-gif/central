import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/mercado/ingest-auto  (Estrategia 2: fuente de mercado AUTOMÁTICA)
//
// Llama a una API real de tarifas (p.ej. Booking/Expedia vía RapidAPI) y upserta los comparables
// en `market_rates`, sin depender de la recolección manual/MCP. Gated por entorno: si no hay
// `MARKET_API_URL`/`MARKET_API_KEY`, NO hace nada (no-op) y lo informa — así puede mergearse y
// activarse cuando Alberto contrate la API.
//
// Configuración (Vercel env, proyecto sivra):
//   MARKET_API_URL   — endpoint de la API (devuelve JSON con alojamientos + precio/noche)
//   MARKET_API_KEY   — API key (RapidAPI u otra)
//   MARKET_API_HOST  — (opcional) cabecera X-RapidAPI-Host
//
// Mapa piso→capacidad/zona para consultar la API a la MISMA capacidad de huéspedes.
const PROPS = [
  { propId: "prop_busto_reform",    guests: 2,  zona: "Sevilla centro" },
  { propId: "prop_duplex_center",   guests: 4,  zona: "Sevilla centro" },
  { propId: "prop_luxury_busto",    guests: 5,  zona: "Sevilla centro" },
  { propId: "prop_house_sevillana", guests: 12, zona: "Sevilla centro" },
]

// Adaptador: transforma la respuesta de la API al esquema de market_rates. Ajustar a la forma
// real del proveedor que se contrate (aquí se asume una lista normalizada de alojamientos).
function mapToComps(apiJson: any): { name: string; price_night: number; score?: number; review_count?: number; location?: string }[] {
  const items: any[] = apiJson?.results ?? apiJson?.data ?? apiJson?.hotels ?? []
  return items
    .map((it) => ({
      name: String(it.name ?? it.title ?? "comp"),
      price_night: Number(it.price_night ?? it.price ?? it.min_price ?? 0),
      score: it.score != null ? Number(it.score) : (it.review_score != null ? Number(it.review_score) : undefined),
      review_count: it.review_count != null ? Number(it.review_count) : undefined,
      location: it.location ?? it.area ?? undefined,
    }))
    .filter((c) => c.name && c.price_night > 0)
}

function nextWeekend(): { checkin: string; checkout: string } {
  const d = new Date()
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7
  const sat = new Date(d); sat.setDate(d.getDate() + daysUntilSat)
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1)
  return { checkin: sat.toISOString().slice(0, 10), checkout: sun.toISOString().slice(0, 10) }
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const apiUrl = process.env.MARKET_API_URL
  const apiKey = process.env.MARKET_API_KEY
  if (!apiUrl || !apiKey) {
    return NextResponse.json({
      ok: true, configured: false,
      message: "MARKET_API_URL/MARKET_API_KEY no configuradas — fuente automática inactiva (usa la ingesta manual /api/mercado/ingest).",
    })
  }

  const { checkin, checkout } = nextWeekend()
  const results: Record<string, number> = {}

  for (const prop of PROPS) {
    try {
      const url = new URL(apiUrl)
      url.searchParams.set("location", prop.zona)
      url.searchParams.set("checkin", checkin)
      url.searchParams.set("checkout", checkout)
      url.searchParams.set("adults", String(prop.guests))
      const res = await fetch(url.toString(), {
        headers: {
          "X-RapidAPI-Key": apiKey,
          ...(process.env.MARKET_API_HOST ? { "X-RapidAPI-Host": process.env.MARKET_API_HOST } : {}),
        },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) { results[prop.propId] = -res.status; continue }
      const comps = mapToComps(await res.json())

      let inserted = 0
      for (const c of comps) {
        try {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO market_rates
              (search_date, checkin_date, checkout_date, guests, portal, scenario,
               comp_name, price_night, price_total, score, review_count, location, currency)
            VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${prop.guests}, 'api', ${prop.propId},
              ${c.name}, ${c.price_night}, ${c.price_night * 2},
              ${c.score ?? null}, ${c.review_count ?? 0}, ${c.location ?? ""}, 'EUR')
            ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
            SET price_night = EXCLUDED.price_night, score = EXCLUDED.score, created_at = NOW()`)
          inserted++
        } catch { /* dup */ }
      }
      results[prop.propId] = inserted
    } catch (e) {
      results[prop.propId] = -1
      console.error(`[ingest-auto] ${prop.propId}:`, e)
    }
  }

  return NextResponse.json({ ok: true, configured: true, checkin, checkout, results })
}
