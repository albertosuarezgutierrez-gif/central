import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { chatConDirector } from "@/lib/pasarela"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/sivra/mercado/sweep  (cron semanal) — Fase 2-B (B1)
//
// El scraper normal (`mercado/cron`) solo mira el PRÓXIMO FINDE, así que el motor solo
// tiene mercado de "hoy" y los precios normales salen planos. Esto barre una ventana por
// mes (próximos 8 meses) y guarda los comps por `checkin_date` para los 4 pisos, de modo
// que el motor (en B2) podrá tarificar por TEMPORADA con datos reales.
//
// ADITIVO: solo INSERTA en market_rates. No toca el pricing (eso es B2). Coste acotado:
// 8 búsquedas Serper + 8 extracciones NIM por ejecución (los comps se reutilizan para los
// 4 pisos, que el motor ya diferencia por calidad/percentiles propios).

const MONTHS_AHEAD = 8
const fmt = (d: Date) => d.toISOString().slice(0, 10)

// 🚨 El barrido busca por el AFORO REAL de cada piso, NO con "4 personas" para todos (bug hasta el
// 31/07/2026: guardaba los MISMOS comps de 4 plazas para los 4 pisos con `guests=4` fijo, así que
// House —12 plazas— se comparaba con apartamentos de 4 y salía a mitad de precio). Los pisos que
// comparten aforo comparten búsqueda, así que el coste es 1 búsqueda por AFORO DISTINTO y ventana
// (hoy 4: 2, 4, 5 y 12 plazas), no 1 por piso.
async function pisosPorAforo(): Promise<Map<number, string[]>> {
  const filas = await prisma.$queryRaw<{ property_id: string; max_guests: number }[]>`
    SELECT property_id, COALESCE(max_guests, 4)::int AS max_guests FROM pricing_piso_zona`
  const porAforo = new Map<number, string[]>()
  for (const f of filas) {
    const aforo = Number(f.max_guests) > 0 ? Number(f.max_guests) : 4
    porAforo.set(aforo, [...(porAforo.get(aforo) ?? []), f.property_id])
  }
  return porAforo
}

// Primer viernes→domingo (2 noches) del mes a `m` meses vista.
function weekendInMonth(m: number): { checkin: string; checkout: string } {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + m)
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1) // avanzar a viernes
  const fri = new Date(d)
  const sun = new Date(d); sun.setUTCDate(sun.getUTCDate() + 2)
  return { checkin: fmt(fri), checkout: fmt(sun) }
}

async function serperSearch(query: string): Promise<string> {
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error("SERPER_API_KEY no configurada")
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "es", hl: "es", num: 10 }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Serper ${res.status}`)
  const data = await res.json()
  return (data.organic || []).slice(0, 8).map((r: any) => `${r.title} | ${r.snippet || ""}`).join("\n")
}

async function extractPrices(snippets: string, checkin: string, checkout: string): Promise<any[]> {
  const system = `Eres experto en turismo en Sevilla. Extrae precios de apartamentos de resultados de búsqueda.
Devuelve SOLO JSON sin markdown:
{"apartments":[{"name":"nombre","price_night":precio_numerico,"score":puntuacion_0_10,"location":"zona"}]}
Solo apartamentos con precio numérico claro. Si no hay, {"apartments":[]}.`
  const prompt = `Portal: booking | Check-in: ${checkin} | Check-out: ${checkout}\nResultados:\n${snippets}\nExtrae apartamentos con precio/noche en euros. SOLO JSON.`
  try {
    const txt = (await chatConDirector([{ role: "user", content: prompt }], { app: "plataforma", endpoint: "mercado-sweep", system, maxTokens: 600, temperature: 0.1 })).text
    const clean = txt.replace(/```json|```/g, "").trim()
    const s = clean.indexOf("{"); const e = clean.lastIndexOf("}")
    return JSON.parse(clean.slice(s, e + 1)).apartments ?? []
  } catch { return [] }
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let upserted = 0
  const ventanas: { checkin: string; aforo: number; comps: number }[] = []
  const errors: string[] = []

  const porAforo = await pisosPorAforo()
  if (!porAforo.size) {
    return NextResponse.json({ error: "pricing_piso_zona vacía: sin aforos no hay comparables fiables" }, { status: 409 })
  }

  for (let m = 1; m <= MONTHS_AHEAD; m++) {
    const { checkin, checkout } = weekendInMonth(m)
    for (const [aforo, pisos] of porAforo) {
      try {
        const snippets = await serperSearch(
          `apartamentos turísticos Sevilla centro ${checkin} ${checkout} ${aforo} personas site:booking.com precio noche`
        )
        const comps = await extractPrices(snippets, checkin, checkout)
        let n = 0
        for (const apt of comps) {
          const night = Number(apt?.price_night)
          if (!apt?.name || !Number.isFinite(night) || night <= 0) continue
          const score = apt?.score != null && Number.isFinite(Number(apt.score)) ? Number(apt.score) : null
          // Estos comps son del aforo de ESTOS pisos: se guardan con su `guests` real para que el
          // motor sepa contra qué está comparando (y aplique `factorAforo` si algún día no cuadra).
          for (const scenario of pisos) {
            try {
              await prisma.$executeRaw(Prisma.sql`
                INSERT INTO market_rates
                  (search_date, checkin_date, checkout_date, guests, portal, scenario,
                   comp_name, price_night, price_total, score, review_count, location, currency)
                VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${aforo}::int, 'booking', ${scenario},
                  ${String(apt.name)}, ${Math.round(night)}::int, ${Math.round(night) * 2}::int,
                  ${score}::numeric, 0, ${String(apt.location || "")}, 'EUR')
                ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
                SET price_night=EXCLUDED.price_night, guests=EXCLUDED.guests, score=EXCLUDED.score, created_at=NOW()`)
              upserted++; if (scenario === pisos[0]) n++
            } catch { /* dup */ }
          }
        }
        ventanas.push({ checkin, aforo, comps: n })
      } catch (e) {
        errors.push(`${checkin} (${aforo}p): ${String(e).slice(0, 80)}`)
      }
    }
  }

  return NextResponse.json({ ok: errors.length === 0, upserted, ventanas, errors })
}
