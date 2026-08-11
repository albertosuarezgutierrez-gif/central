import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/resumen-diario  (cron)
// Resumen de pricing del día: cambios reales aplicados en las últimas 24h + alertas abiertas.
// Loguea en consola (sin email en plataforma — simplificado vs sivra).
const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
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

  const aplicados = await prisma.$queryRaw<{
    property_id: string; rate_date: string; old_price: number | null; new_price: number
  }[]>(Prisma.sql`
    SELECT property_id, rate_date::text, old_price, new_price
    FROM pricing_applied
    -- La columna de tiempo de pricing_applied es applied_at, NO created_at (esa sí existe, pero en
    -- pricing_alerts, de ahí la confusión): con created_at el cron moría en 500 a diario desde el 30/07/2026.
    WHERE dry_run = false AND applied_at >= now() - INTERVAL '24 hours'
    ORDER BY property_id, rate_date`)

  const alertas = await prisma.$queryRaw<{ titulo: string; prioridad: string }[]>(Prisma.sql`
    SELECT titulo, prioridad FROM pricing_alerts
    WHERE resuelta = false ORDER BY
      CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 10`)

  if (aplicados.length === 0 && alertas.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "Sin movimiento" })
  }

  // En plataforma solo logueamos el resumen en consola (sin email/push)
  console.log(`[sivra/pricing/resumen-diario] ${new Date().toLocaleDateString("es-ES")} — ${aplicados.length} cambio(s), ${alertas.length} alerta(s) abiertas`)
  for (const a of aplicados) {
    console.log(`  ${PROP_NAMES[a.property_id] ?? a.property_id} ${a.rate_date}: ${a.old_price ?? "—"}€ → ${a.new_price}€`)
  }
  for (const a of alertas) {
    console.log(`  [${a.prioridad}] ${a.titulo}`)
  }

  return NextResponse.json({ ok: true, sent: true, cambios: aplicados.length, alertas: alertas.length })
}
