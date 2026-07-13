import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"
import { buscarWeb, busquedaConfigurada } from "@/lib/websearch"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/eventos/websearch  (cron semanal)
//
// Fase 2-B: complementa a Ticketmaster (/eventos/sync). Ticketmaster capta conciertos y
// deportes con venue, pero NO lista LaLiga (Sevilla FC / Betis), ferias locales, congresos
// ni festivos puntuales. Esta ruta los descubre por BÚSQUEDA WEB y los upserta en
// `pricing_eventos_auto` con `fuente='websearch'`. El motor (apply) ya combina TODAS las
// fuentes de la tabla por MAX(factor) → cero cambios en el motor. Mismo modelo de impacto
// por aforo que Ticketmaster.
//
// La búsqueda va por `lib/websearch.ts::buscarWeb` (13/07/2026): Gemini google_search
// (gratis) primero y, si está saturado (las rachas de 429 tenían este cron mudo desde junio),
// el plugin `web` de OpenRouter como suplente de pago (~0,02€/pasada, presupuesto diario de
// la pasarela). Ambos intentos quedan en `ai_usos` (endpoint='eventos'). Sin NINGUNA de las
// dos keys, no-op → se despliega seguro.

// Aforo → factor de premium (acotado a 2.5, el techo del motor). Idéntico a /eventos/sync.
function impacto(aforo: number): number {
  let f = 1.08
  if (aforo > 20000) f = 1.60
  else if (aforo > 10000) f = 1.40
  else if (aforo > 5000) f = 1.25
  else if (aforo > 1000) f = 1.15
  return Math.min(f, 2.5)
}

type EvWeb = { fecha?: string; nombre?: string; tipo?: string; aforo_estimado?: number }

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  if (!busquedaConfigurada()) {
    return NextResponse.json({
      ok: true, configured: false,
      message: "Ni GEMINI_API_KEY ni OPENROUTER_API_KEY configuradas — eventos por web_search inactivos (complementa a Ticketmaster).",
    })
  }

  const hoy = new Date()
  const fin = new Date(hoy.getTime() + PRICING_HORIZON_DAYS * 86400000)
  const desde = hoy.toISOString().slice(0, 10)
  const hasta = fin.toISOString().slice(0, 10)

  // Para no repetir lo que ya hay (Ticketmaster u otra pasada), pásale a Gemini lo registrado.
  const yaRows = await prisma.$queryRaw<{ rate_date: string; nombre: string }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, nombre FROM pricing_eventos_auto
    WHERE rate_date >= CURRENT_DATE ORDER BY rate_date LIMIT 200
  `).catch(() => [])
  const yaResumen = yaRows.map(r => `${r.rate_date} ${r.nombre}`).join(" | ")

  const prompt = `Busca eventos CONFIRMADOS en Sevilla (España) entre ${desde} y ${hasta} que disparen la demanda de ALOJAMIENTO turístico: partidos de LaLiga del Sevilla FC y del Real Betis (local), conciertos en recintos de >1000 personas, ferias y congresos en FIBES, festivales, y festivos locales/puentes grandes (Semana Santa, Feria de Abril).

EVENTOS YA REGISTRADOS (NO repitas ni incluyas nada parecido a estos):
${yaResumen || "Ninguno aún"}

Incluye solo eventos con FECHA CONFIRMADA. Estima el aforo del recinto (estadio La Cartuja ~60000, Sánchez-Pizjuán ~43000, Benito Villamarín ~60000, FIBES ~7000, conciertos medianos ~3000, feria/festivo ciudad ~20000).

Responde SOLO con JSON válido sin markdown:
{"eventos":[{"fecha":"YYYY-MM-DD","nombre":"nombre corto","tipo":"deportes|concierto|feria|congreso|festivo","aforo_estimado":43000}]}
Si no hay nada nuevo: {"eventos":[]}`

  let evs: EvWeb[] = []
  let via = "websearch"
  const errors: string[] = []
  try {
    const res = await buscarWeb("", prompt, { app: "sivra", endpoint: "eventos", maxTokens: 2048, timeoutMs: 30_000 })
    via = `${res.proveedor}:${res.modelo}`
    try {
      evs = JSON.parse(res.text.replace(/```json|```/g, "").trim())?.eventos ?? []
    } catch { errors.push(`JSON de ${res.proveedor} no parseable`) }
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, errors: [String(e).slice(0, 200)] })
  }

  let upserted = 0, descartados = 0
  for (const ev of evs) {
    const rateDate = ev.fecha
    const nombre = (ev.nombre ?? "").trim()
    if (!rateDate || !/^\d{4}-\d{2}-\d{2}$/.test(rateDate) || !nombre) { descartados++; continue }
    if (rateDate < desde || rateDate > hasta) { descartados++; continue }
    const aforo = Math.max(0, Math.round(Number(ev.aforo_estimado ?? 3000)) || 3000)
    const tipo = (ev.tipo ?? "evento").toString().slice(0, 40)
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_eventos_auto (rate_date, nombre, fuente, tipo, aforo, factor, venue, raw, updated_at)
        VALUES (${rateDate}::date, ${nombre}, 'websearch', ${tipo},
          ${aforo}::int, ${impacto(aforo)}::numeric, NULL, ${JSON.stringify({ via })}::jsonb, now())
        ON CONFLICT (fuente, nombre, rate_date) DO UPDATE
          SET aforo = EXCLUDED.aforo, factor = EXCLUDED.factor, tipo = EXCLUDED.tipo, updated_at = now()
      `)
      upserted++
    } catch { descartados++ }
  }

  return NextResponse.json({ ok: errors.length === 0, configured: true, via, vistos: evs.length, upserted, descartados, errors })
}
