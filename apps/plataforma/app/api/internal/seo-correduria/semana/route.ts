import { NextRequest, NextResponse } from "next/server"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/internal/seo-correduria/semana
//
// La foto MÁS RECIENTE de `seo_correduria_semana` (GSC/SERP/PostHog), en JSON. Es el mismo dato y
// la misma consulta que la skill `seo-asegura` pide por Supabase MCP («Cómo se lee la foto»), pero
// por HTTP con el token de bajo privilegio de las rutinas — porque una Routine programada
// (`create_trigger`) NO puede llevar conectores MCP en esta organización (comprobado 14/09/2026:
// el parámetro `connectors` da "not available for this organization"), así que la Routine semanal
// de `seo-asegura` no tenía forma de leer esta tabla salvo abrir sesión interactiva.
//
// Solo lectura, sin PII: `fuente`/`estado`/`detalle`/`datos` son posiciones SEO, comparables SERP
// y contadores agregados de PostHog — nada de un cliente ni de la cartera. Mismo patrón que
// `/api/sivra/mercado/plan` (lectura de rutina, radio de daño nulo si el token se filtra).
export async function GET(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const ultima = await prisma.seoCorreduriaSemana.aggregate({ _max: { semana: true } })
  if (!ultima._max.semana) {
    return NextResponse.json({ ok: true, semana: null, filas: [] })
  }

  const filas = await prisma.seoCorreduriaSemana.findMany({
    where: { semana: ultima._max.semana },
    select: { fuente: true, estado: true, detalle: true, datos: true },
  })

  return NextResponse.json({
    ok: true,
    semana: ultima._max.semana.toISOString().slice(0, 10),
    filas,
  })
}
