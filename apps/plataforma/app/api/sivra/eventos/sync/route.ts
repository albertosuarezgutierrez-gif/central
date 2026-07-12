import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/eventos/sync  (cron semanal)
//
// Fase 2-A: detecta automáticamente eventos en Sevilla vía Ticketmaster (conciertos,
// deportes — incluida una final de Copa del Rey) y los upserta en `pricing_eventos_auto`
// con un factor por aforo. El motor (apply) combina ese factor con el calendario manual
// (MAX) → los eventos sorpresa suben el precio SOLOS, sin tocar el código.
//
// Gateado por `TICKETMASTER_API_KEY` (env de Vercel del proyecto sivra; reutiliza la de
// ia-rest). Sin la key, no hace nada (no-op) → se puede desplegar seguro y activar luego.
//
// Mismo modelo de impacto por aforo que la Edge Function `eventos-entorno` de ia-rest.

const TM_API = "https://app.ticketmaster.com/discovery/v2/events.json"
// Sevilla centro + radio amplio para captar también estadios (Pizjuán, La Cartuja).
// OJO: la búsqueda por postalCode devuelve 0 fuera de EE.UU. (el geocoding
// internacional de TM no resuelve 41001) — verificado en vivo el 13/07/2026.
// Por eso se busca por COORDENADAS, con la ciudad como red de seguridad.
const LATLONG = "37.3935,-5.9866"
const RADIUS_KM = 25

// Aforo → factor de premium (acotado a 2.5, el techo del motor).
function impacto(aforo: number): number {
  let f = 1.08
  if (aforo > 20000) f = 1.60
  else if (aforo > 10000) f = 1.40
  else if (aforo > 5000) f = 1.25
  else if (aforo > 1000) f = 1.15
  return Math.min(f, 2.5)
}

// Aforo por RECINTO de Sevilla. La Discovery API de Ticketmaster casi nunca trae la
// capacidad (`accessibility.seatCount` son plazas de movilidad reducida; los venues no
// exponen `capacity`), así que sin este mapa el aforo caía SIEMPRE al default y TODO
// evento se quedaba en factor 1.15 — una final de Copa del Rey en La Cartuja jamás
// disparaba el pelotazo. El NOMBRE del venue sí lo devuelve TM de forma fiable.
const AFORO_VENUE_SEVILLA: { match: string[]; aforo: number }[] = [
  { match: ["la cartuja", "estadio olímpico", "estadio olimpico"], aforo: 60000 },
  { match: ["villamarín", "villamarin"], aforo: 60000 },
  { match: ["sánchez-pizjuán", "sanchez-pizjuan", "pizjuán", "pizjuan"], aforo: 43000 },
  { match: ["plaza de toros", "real maestranza"], aforo: 12000 },
  { match: ["fibes", "exposiciones y congresos"], aforo: 7000 },
  { match: ["san pablo", "pabellón", "pabellon"], aforo: 7000 },
  { match: ["rocío jurado", "rocio jurado"], aforo: 6500 },
  { match: ["icónica", "iconica", "plaza de españa", "plaza de espana"], aforo: 5000 },
  { match: ["cartuja center"], aforo: 1500 },
  { match: ["custom", "malandar", "even sevilla", "sala x"], aforo: 500 },
]

// Aforo de un evento: 1º el mapa por recinto (lo fiable en Sevilla), 2º lo que traiga
// TM si viene, 3º un default conservador.
function aforoEvento(venue: string | null, tmSeat: number): number {
  const v = (venue ?? "").toLowerCase()
  if (v) {
    for (const e of AFORO_VENUE_SEVILLA) {
      if (e.match.some(m => v.includes(m))) return e.aforo
    }
  }
  if (Number.isFinite(tmSeat) && tmSeat > 0) return tmSeat
  return 2000
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const key = process.env.TICKETMASTER_API_KEY
  if (!key) {
    return NextResponse.json({
      ok: true, configured: false,
      message: "TICKETMASTER_API_KEY no configurada en plataforma — auto-eventos inactivo (cópiala del proyecto ia-rest).",
    })
  }

  const hoy = new Date()
  const fin = new Date(hoy.getTime() + PRICING_HORIZON_DAYS * 86400000)
  const start = `${hoy.toISOString().slice(0, 19)}Z`
  const endT = `${fin.toISOString().slice(0, 19)}Z`

  let upserted = 0, vistos = 0, sinFecha = 0
  const errors: string[] = []

  // Dos consultas por robustez: coordenadas+radio (la buena) y ciudad (fallback si
  // TM cambia el geocoding). El upsert es idempotente, los duplicados no importan.
  const consultas = [
    `latlong=${LATLONG}&radius=${RADIUS_KM}&unit=km`,
    `city=Sevilla&countryCode=ES`,
  ]

  try {
    for (const filtro of consultas) {
    for (let page = 0; page < 5; page++) {
      const url = `${TM_API}?apikey=${key}&${filtro}` +
        `&startDateTime=${start}&endDateTime=${endT}` +
        `&size=100&page=${page}&sort=date,asc`
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        errors.push(`TM HTTP ${res.status}${body ? ` ${body.slice(0, 140)}` : ""}`)
        break
      }
      const data = await res.json()
      const evs: any[] = data._embedded?.events ?? []
      vistos += evs.length

      for (const ev of evs) {
        const rateDate = ev.dates?.start?.localDate
        if (!rateDate) { sinFecha++; continue }
        const venue = ev._embedded?.venues?.[0]?.name ?? null
        const tmSeat = Number(ev.accessibility?.seatCount ?? ev._embedded?.venues?.[0]?.capacity ?? 0)
        const aforo = aforoEvento(venue, tmSeat)
        const seg = ev.classifications?.[0]?.segment?.name?.toLowerCase() ?? ""
        const tipo = seg.includes("sport") ? "deportes" : (seg || "concierto")
        try {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO pricing_eventos_auto (rate_date, nombre, fuente, tipo, aforo, factor, venue, raw, updated_at)
            VALUES (${rateDate}::date, ${String(ev.name)}, 'ticketmaster', ${tipo},
              ${aforo}::int, ${impacto(aforo)}::numeric, ${venue}, ${JSON.stringify({ id: ev.id, url: ev.url })}::jsonb, now())
            ON CONFLICT (fuente, nombre, rate_date) DO UPDATE
              SET aforo = EXCLUDED.aforo, factor = EXCLUDED.factor, venue = EXCLUDED.venue, updated_at = now()
          `)
          upserted++
        } catch { /* dup / fila inválida */ }
      }

      const pageCount = data.page?.totalPages ?? 1
      if (page + 1 >= pageCount) break
    }
    }
  } catch (e) {
    errors.push(String(e).slice(0, 120))
  }

  return NextResponse.json({ ok: errors.length === 0, configured: true, vistos, upserted, sinFecha, errors })
}
