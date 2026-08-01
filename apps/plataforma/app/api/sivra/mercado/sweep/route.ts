import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { chatConDirector } from "@/lib/pasarela"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { EVENTS } from "@/lib/pricing-calendar"
import { ventanasDelBarrido, type EventoFecha } from "@/lib/sivra/mercado-ventanas"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"

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
//
// 🚨 AMPLIADO 01/08/2026 — el barrido también mide las fechas de EVENTO. Hasta hoy solo miraba el
// primer viernes de cada mes, así que las noches que el motor tarifica al triple (Feria, Semana
// Santa, los tres días de Karol G) NUNCA tenían comps propios: se tarificaban a ciegas y, peor, los
// dos centinelas que las vigilan (#7 «evento sin respaldo» y #8 «el mercado sube y no sabemos por
// qué») se quedaban en `evaluado:false` para siempre por falta de muestra. Qué fechas entran lo
// decide el helper PURO `lib/sivra/mercado-ventanas.ts` (un bloque de evento = una ventana, los más
// cercanos primero, con tope). Ver el porqué completo en su cabecera.

const MONTHS_AHEAD = 8
// Ventanas EXTRA de evento por pasada. Cada una cuesta 1 búsqueda Serper + 1 extracción por aforo
// distinto (hoy 4), así que 6 ≈ +24 búsquedas sobre las 32 de la base. Sube esto solo mirando la
// duración real de la pasada: `maxDuration` es 300 s.
const MAX_VENTANAS_EVENTO = Number(process.env.SIVRA_SWEEP_MAX_EVENTOS ?? 6)

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

// Fechas de evento de las DOS fuentes que conoce el motor: el calendario del repo y lo que
// descubren los crons (Ticketmaster / búsqueda web). Si la tabla falla NO se cae la pasada: se
// barre la base mensual y se dice en la respuesta, que es distinto de «no había eventos».
async function fechasDeEvento(): Promise<{ eventos: EventoFecha[]; tablaOk: boolean }> {
  const eventos: EventoFecha[] = Object.entries(EVENTS).map(([fecha, factor]) => ({
    fecha, factor: Number(factor), nombre: 'calendario',
  }))
  try {
    const filas = await prisma.$queryRaw<{ rate_date: Date; factor: number; nombre: string }[]>(Prisma.sql`
      SELECT rate_date, MAX(factor)::float AS factor, MIN(nombre) AS nombre
      FROM pricing_eventos_auto
      WHERE rate_date >= CURRENT_DATE
      GROUP BY rate_date`)
    for (const f of filas) {
      eventos.push({
        fecha: new Date(f.rate_date).toISOString().slice(0, 10),
        factor: Number(f.factor),
        nombre: String(f.nombre ?? '').slice(0, 60),
      })
    }
    return { eventos, tablaOk: true }
  } catch {
    return { eventos, tablaOk: false }
  }
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
  const ventanas: { checkin: string; aforo: number; comps: number; motivo: string; etiqueta?: string }[] = []
  const errors: string[] = []

  const porAforo = await pisosPorAforo()
  if (!porAforo.size) {
    return NextResponse.json({ error: "pricing_piso_zona vacía: sin aforos no hay comparables fiables" }, { status: 409 })
  }

  const { eventos, tablaOk } = await fechasDeEvento()
  if (!tablaOk) errors.push("pricing_eventos_auto ilegible: se barre la base mensual, pero SIN las fechas de evento descubiertas por los crons")

  const plan = ventanasDelBarrido(new Date().toISOString().slice(0, 10), eventos, {
    mesesBase: MONTHS_AHEAD,
    maxEventos: MAX_VENTANAS_EVENTO,
  })

  for (const { checkin, checkout, motivo, etiqueta } of plan) {
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
        ventanas.push({ checkin, aforo, comps: n, motivo, etiqueta })
      } catch (e) {
        errors.push(`${checkin} (${aforo}p): ${String(e).slice(0, 80)}`)
      }
    }
  }

  // Huella para el vigía: una pasada que no trae NI UN comp es un fallo, aunque no lance.
  const conComps = ventanas.filter(v => v.comps > 0).length
  const ok = errors.length === 0 && conComps > 0
  const eventosBarridos = plan.filter(v => v.motivo === 'evento').length
  await registrarLatido('sivra_mercado_sweep', ok, [
    `${upserted} comps en ${ventanas.length} ventanas (${eventosBarridos} de evento)`,
    errors.length ? `${errors.length} fallos: ${errors[0]}` : '',
  ].filter(Boolean).join(' · ')).catch(() => {})

  return NextResponse.json({ ok, upserted, ventanas, eventosBarridos, errors })
}
