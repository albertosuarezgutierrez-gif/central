import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { esAnuncioPropio } from "@/lib/sivra/mercado-propios"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Fuentes que este endpoint acepta declarar. `serper` NO está: ese camino lo escribe el barrido
// automático, no una ingesta externa — permitirlo aquí solo serviría para etiquetar mal.
const FUENTES_INGESTA = ["booking_mcp", "manual"]

// POST /api/sivra/mercado/ingest
// Ingesta de comparables de mercado REALES (Booking, Trivago, Expedia…) obtenidos
// por un conector externo o un agente, sin depender del scraping de Google (Serper).
// Hace upsert en market_rates con la MISMA clave que usa el cron (search_date,
// portal, scenario, comp_name, checkin_date), así que es idempotente por día.
//
// Cuerpo esperado:
// {
//   "portal":   "booking",                // booking | trivago | expedia | tripadvisor | ...
//   "scenario": "prop_busto_reform",      // prop_<id> para comparables por piso, o normal/corpus
//   "checkin":  "2026-06-13",
//   "checkout": "2026-06-14",
//   "guests":   4,                          // opcional, def. 4
//   "currency": "EUR",                      // opcional, def. EUR
//   "apartments": [
//     { "name": "Singular Metropol", "price_night": 177, "price_total": 177,
//       "score": 8.7, "review_count": 1263, "location": "Centro" }
//   ]
// }
//
// Auth de RUTINA (`isRoutineAuthorized`): acepta el token DEDICADO de bajo privilegio
// `ALERTA_TOKEN` (header-only) o, por compatibilidad, el `CRON_SECRET` maestro.
//
// Por qué NO exige `CRON_SECRET`: quien llama aquí es la rutina de Claude Code del agente de
// pricing, una sesión efímera cuyo campo de variables de entorno es TEXTO PLANO VISIBLE — no un
// almacén de secretos (lo avisa la propia interfaz). Meter ahí la llave maestra va contra la regla
// de `apps/plataforma/CLAUDE.md` ("NO ponerla en prompts de rutinas"). El radio de daño de este
// endpoint es acotado: escribe comparables en `market_rates` (dato de entrada del motor), NO aplica
// precios — eso sigue pasando por los raíles de `/api/sivra/pricing/aplicar-propuesta`, que valida
// suelo de coste, tope ±%/día y circuit-breaker aunque los comps vinieran envenenados.
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { portal, scenario, checkin, checkout } = body
  const guests   = Number(body.guests ?? 4)
  const currency = String(body.currency ?? "EUR")
  const apartments: any[] = Array.isArray(body.apartments) ? body.apartments : []

  // 🚨 `fuente` marca DE DÓNDE sale el precio, y es lo único que distingue un comparable medido
  // para ESA fecha de uno scrapeado de un anuncio sin fecha (los dos llegan con portal='booking').
  // Ver `prisma/sql/2026-08-06_market_rates_fuente.sql`. Default `booking_mcp` porque quien llama
  // aquí es la rutina del conector; un valor desconocido se RECHAZA en vez de colarse como fiable
  // (un centinela que acepta cualquier etiqueta no vigila nada).
  const fuente = String(body.fuente ?? "booking_mcp")
  if (!FUENTES_INGESTA.includes(fuente)) {
    return NextResponse.json(
      { error: `fuente inválida: ${fuente}. Válidas: ${FUENTES_INGESTA.join(", ")}` },
      { status: 400 },
    )
  }

  if (!portal || !scenario || !checkin || !checkout) {
    return NextResponse.json({ error: "Faltan campos: portal, scenario, checkin, checkout" }, { status: 400 })
  }
  if (apartments.length === 0) {
    return NextResponse.json({ error: "apartments vacío" }, { status: 400 })
  }

  let inserted = 0
  const skipped: string[] = []
  /**
   * Comparables descartados por ser NUESTROS propios anuncios. Van en una lista APARTE de `skipped`
   * (que es «no tenía precio utilizable») y se devuelven en la respuesta: un comparable que
   * desaparece en silencio es indistinguible de uno que el portal no devolvió. Ver
   * `lib/sivra/mercado-propios.ts`.
   */
  const propios: string[] = []

  for (const apt of apartments) {
    const name  = apt?.name
    const night = Number(apt?.price_night)
    if (!name || !Number.isFinite(night) || night <= 0) { skipped.push(String(name ?? "?")); continue }
    // 🪞 Nuestro propio anuncio NO es mercado: escribirlo aquí ancla el ancla al precio que este
    // mismo motor acaba de poner. El raíl va en el endpoint, no solo en el prompt de la rutina.
    if (esAnuncioPropio(String(name))) { propios.push(String(name)); continue }
    const total  = Number.isFinite(Number(apt?.price_total)) ? Number(apt.price_total) : night
    const score  = apt?.score != null && Number.isFinite(Number(apt.score)) ? Number(apt.score) : null
    const reviews = Number.isFinite(Number(apt?.review_count)) ? Number(apt.review_count) : 0
    const location = apt?.location != null ? String(apt.location) : ""

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO market_rates
          (search_date, checkin_date, checkout_date, guests, portal, scenario,
           comp_name, price_night, price_total, score, review_count, location, currency, fuente)
        VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${guests},
          ${String(portal)}, ${String(scenario)}, ${String(name)},
          ${Math.round(night)}::integer, ${Math.round(total)}::integer,
          ${score}::numeric, ${reviews}::integer, ${location}, ${currency}, ${fuente})
        ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
        SET price_night=EXCLUDED.price_night, price_total=EXCLUDED.price_total,
            score=EXCLUDED.score, review_count=EXCLUDED.review_count,
            location=EXCLUDED.location, created_at=NOW(),
            -- La fuente MEJOR gana el desempate: si el barrido ya había escrito este comparable
            -- hoy con un precio de anuncio, la medición real de la fecha lo sustituye y además
            -- se queda marcada como fiable. Al revés no puede pasar (el sweep no llama aquí).
            fuente=EXCLUDED.fuente`)
      inserted++
    } catch (e) {
      skipped.push(`${name}: ${String(e).slice(0, 80)}`)
    }
  }

  return NextResponse.json({ ok: true, portal, fuente, scenario, checkin, checkout, inserted, skipped, propios })
}
